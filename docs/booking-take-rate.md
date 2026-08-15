# Booking Take Rate — Implementation Sketch

[← Back to docs index](README.md)

> **Status: ✅ implemented.** Migration `20260812075914_booking_platform_fee` (+ `Booking.platformFee` / `platformFeeRateBps`), `computePlatformFee` / `isPlanFeeExempt` in `booking-ui.ts`, the fee stamped at accept-with-quote in both adapters (demo + prisma in-tx), the RespondDialog "you receive X · platform fee Y" preview (waived line for Enterprise), the customer booking-row transparency line, i18n keys, and tests (unit calc, adapter stamps incl. the exempt path, prisma mapper, `db:smoke` assertion). This page documents the original proposal — the implementation follows it as written.

> Original design proposal for the headline revenue lever in `docs/BUSINESS-MODEL.md` §5.2:
> a **platform fee on quoted bookings**, recorded at accept-with-quote and shown as a
> split ("you receive X · platform fee Y") on both sides of the marketplace.

---

## 1. Goal & policy

- The worker accepts a REQUESTED booking with a **quote**; the platform takes a **% of the quote** (the take rate).
- The fee is recorded **once, at accept time** (deterministic, immutable snapshot — not recomputed later from a changing rate).
- The customer sees the **total (quote)**, with a transparent "includes platform fee · worker receives" line; the worker sees the **net** in the RespondDialog before committing.
- The fee settles through the existing Payment/Invoice rails (deposit pay-in, or a fee invoice at completion for quote-only jobs).

**Default policy (config, single source of truth):**

| Parameter | Default | Meaning |
|---|---|---|
| `PLATFORM_FEE_RATE_BPS` | `700` (7.0%) | take rate, basis points |
| `PLATFORM_FEE_MIN_MINOR` | `500` (SAR 5 / $5) | floor, minor units |
| `PLATFORM_FEE_MAX_MINOR` | `30_000` (SAR 300 / $300) | cap per job, minor units |
| exemption | Enterprise plan | fee waived for workers whose subscription plan is exempt (per BUSINESS-MODEL §5.2) |

Fee applies to the **quote**, not on top of it and not on the deposit (the deposit is a partial pre-payment of the quote). `fee = clamp(round(quote × bps / 10000), min, max)` — round-half-up to the nearest minor unit, then clamp.

---

## 2. Data model

### Prisma (`prisma/schema.prisma`, `model Booking`)

```prisma
  quote         Int? // minor units — worker's price for this job
  deposit       Int? // minor units — required upfront when set
  // M5 take rate — platform fee snapshot at accept-with-quote (minor units).
  // Null until a quoted accept; NEVER recomputed from a later rate change.
  platformFee      Int?
  // The rate in force when the fee was set (basis points) — audit trail so a
  // future rate change can't rewrite history or break fee reporting.
  platformFeeRateBps Int?
  currency      String @default("USD")
```

Migration (single ALTER — nullable, no backfill needed; only NEW accepts compute it):

```sql
ALTER TABLE "Booking"
  ADD COLUMN "platformFee" INTEGER,
  ADD COLUMN "platformFeeRateBps" INTEGER;
```

### Domain (`src/lib/data/types.ts`, `interface Booking`)

```ts
  quote?: number; // minor units
  deposit?: number; // minor units
  /** M5 — platform take-rate fee snapshot (minor units), set at quoted accept. */
  platformFee?: number;
  /** The take-rate basis points in force when platformFee was set (audit). */
  platformFeeRateBps?: number;
```

**Net is derived, never stored:** `workerReceives = quote − platformFee`. Storing the absolute fee (not the net) keeps `quote = fee + net` provably consistent with zero drift, and `toDomainBooking` just maps the two new columns through.

---

## 3. Shared fee calculator (single source of truth)

New pure function, exported from `src/lib/data/booking-ui.ts` (already client-safe — the RespondDialog imports it) next to `bookingEmailContext` / `computeResponseRate`:

```ts
/** M5 take rate — platform fee on a quote (minor units), rounded then clamped. */
export function computePlatformFee(
  quoteMinor: number,
  opts: { exempt?: boolean } = {}
): number {
  if (opts.exempt || !Number.isFinite(quoteMinor) || quoteMinor <= 0) return 0;
  const raw = Math.round((quoteMinor * PLATFORM_FEE_RATE_BPS) / 10_000);
  return Math.min(Math.max(raw, PLATFORM_FEE_MIN_MINOR), PLATFORM_FEE_MAX_MINOR);
}
```

Constants (`PLATFORM_FEE_RATE_BPS`, `_MIN_MINOR`, `_MAX_MINOR`) live in the same module (or `src/lib/data/config.ts`), mirroring the `BOOKING_CANCEL_REFUND_WINDOW_MS` pattern in `types.ts`. The exemption input keeps the calculator pure and lets the UI preview the exact fee before the worker commits (same function, same answer).

---

## 4. Where the fee is applied (accept-with-quote)

Both adapters stamp the fee **inside the accept branch** of `respondToBooking`, in the same `$transaction` as the status CAS (prisma) — the fee is derived from the quote, so no extra lock is needed and the existing CAS already prevents a double-respond.

### Demo (`src/lib/data/bookings.ts`, `demoRespondToBooking` accept branch)

```ts
booking.status = input.deposit ? "pendingPayment" : "confirmed";
booking.quote = input.quote;
booking.deposit = input.deposit;
// M5 — fee snapshot from the quote (exempt when the worker's plan waives it).
if (input.quote) {
  booking.platformFee = computePlatformFee(input.quote, { exempt: isPlanExempt(worker) });
  booking.platformFeeRateBps = PLATFORM_FEE_RATE_BPS;
}
```

### Prisma (`src/lib/data/prisma-repo.ts`, `prismaRespondToBooking`)

Add the two columns to the accept `updateMany` data set (computed the same way from the validated quote, worker subscription plan read inside the tx for the exemption). `toDomainBooking` gains:

```ts
platformFee: row.platformFee ?? undefined,
platformFeeRateBps: row.platformFeeRateBps ?? undefined,
```

### Acceptance rules

- **Accept without a quote** → no fee (`platformFee` stays null) — free tier remains free to test the waters.
- **Decline** → nothing recorded.
- **Reschedule / transition** → fee untouched (it's a quote snapshot; times move, money doesn't).
- **Cancellation** → the fee is refunded together with any deposit refund (policy: the platform earns the fee only on completed jobs); on **no-show** the deposit stays with the worker and the fee stays with the platform (the worker kept the money, so the fee on that quote is earned).

---

## 5. UI presentation ("you receive X · platform fee Y")

### Worker: `src/components/dashboard/bookings/respond-dialog.tsx`

Under the quote input, a **live preview** line (recomputed on every keystroke — same `computePlatformFee` import, so what the dialog shows is exactly what the accept stores):

```
Quote:        [ 80 ]
Platform fee: SAR 5.60   (7%, min/max applied — shown only when > 0)
You receive:  SAR 74.40
```

- Exempt plans show `Platform fee: waived (Enterprise)` instead of a number.
- The submit is unchanged — the fee is derived server-side; the preview is informational but the value is deterministic and identical (pure function, minor-unit conversion documented: dialog shows major ÷100, like the existing `Price` component).

### Customer: `src/components/bookings/booking-row.tsx`

Under the quote price, a muted transparency line (builds trust, which is the point of showing it):

```
SAR 80 · Includes platform fee SAR 5.60 · Worker receives SAR 74.40
```

Rendered only when `booking.platformFee` is set. The deposit pay-box copy is unchanged (the customer pays the quote total; the fee is settled by the platform from the transaction).

### i18n keys (EN + AR, `booking.*`)

| Key | EN | AR |
|---|---|---|
| `booking.platformFee` | "Platform fee" | "رسوم المنصة" |
| `booking.platformFeeHint` | "{rate}% of the quote, min {min}" | "…" |
| `booking.youReceive` | "You receive" | "ستحصل على" |
| `booking.includesFee` | "Includes platform fee" | "يشمل رسوم المنصة" |
| `booking.workerReceives` | "Worker receives" | "يستلم العامل" |
| `booking.feeWaived` | "Platform fee waived ({plan})" | "…" |

Follow the existing exhaustive-key convention: add to `en.ts`, and `ar.ts` is enforced by the `Record<Locale, Dictionary>` typing + `tests/i18n.test.ts` parity check.

---

## 6. Settlement & money flow (v1)

| Path | Who pays what | Fee collected |
|---|---|---|
| Deposit job (M3) | customer pays quote total at checkout | fee rides the existing `Payment`/`Invoice` — add a `platformFee` line to the booking invoice (`WA-*`) |
| Quote-only job | no upfront payment today | fee invoice (scope `bookingFee`, `INV-*`-style or a new sequence) minted at `transitionBooking(completed)` |
| Cancellation | deposit refunded per M4 policy | fee refunded with it (v1: informational — the fee is "earned" only at completion) |

Out of scope for v1 (noted for a later wave): escrow/milestone payout splitting at `completed`, per-job payout records, and a platform `Revenue` ledger — the `Invoice` rows + funnel already give reporting.

---

## 7. Test plan

1. **Unit (`tests/bookings.test.ts`)** — `computePlatformFee`: zero quote → 0; exact percentage; rounding half-up; min floor; max cap; exemption → 0. (Mirrors the `bookingCancelRefundDue` test style.)
2. **Demo adapter** — `demoRespondToBooking` accept-with-quote stamps `platformFee` + `platformFeeRateBps`; accept-without-quote leaves them unset; exempt plan → 0; decline stamps nothing.
3. **Prisma adapter + live DB** — mirror assertions in `tests/booking-email-chain-prisma.test.ts` or a `db:smoke` section: accept-with-quote persists the fee columns and `toDomainBooking` maps them.
4. **Chain/email parity — ✅ shipped** — `bookingEmailContext` (extended with `platformFee`) renders the fee line in the confirmation email (amount for charged fees, "Waived by the worker's plan" when the exempt marker 0 is stamped — matching the customer booking row); demo and prisma chain tests assert the identical payload shape incl. `platformFee` (560 for a premium quote-8000 accept; 0 + the waived line for the Enterprise case).
5. **i18n** — `tests/i18n.test.ts` picks up the new keys automatically (exhaustive parity).
6. **E2E** — the existing `runBookingFlow` deposit path can assert the customer row's fee line renders after accept (cheap addition to `tests/e2e-smoke.test.ts`).

---

## 8. Files touched (summary map)

| File | Change |
|---|---|
| `prisma/schema.prisma` + migration | `Booking.platformFee` / `platformFeeRateBps` (nullable Int) |
| `src/lib/data/types.ts` | `Booking` fields (+ optional `BookingEmailContext.platformFee`) |
| `src/lib/data/booking-ui.ts` | `computePlatformFee` + rate/min/max constants |
| `src/lib/data/bookings.ts` | fee stamp in `demoRespondToBooking` accept branch |
| `src/lib/data/prisma-repo.ts` | fee stamp in `prismaRespondToBooking` tx + `toDomainBooking` mapping |
| `src/components/dashboard/bookings/respond-dialog.tsx` | live fee/net preview under the quote |
| `src/components/bookings/booking-row.tsx` | "includes fee · worker receives" line |
| `src/lib/i18n/translations/en.ts` + `ar.ts` | 6 new `booking.*` keys |
| `src/lib/notifications/templates.ts` | fee / fee-waived line in the confirmation email (`renderBookingEmail` html + text) |
| tests | unit fee calc, adapter stamps, chain parity, smoke assertion |

**Sequencing recommendation:** calculator + domain fields + adapters + migration first (the money logic), then UI + i18n, then tests — with the chain/email parity tests as the gate, exactly like M3/M4 landed.
