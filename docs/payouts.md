# Worker Payouts — Design & Implementation

> **Status: ✅ implemented.** `WorkerLedgerEntry` (+ migration), earnings credited **inside the completion transition tx** (both adapters), `getWorkerBalance` / `requestPayout` / `decidePayout` / `getWorkerPayouts` / `getPendingPayouts` seams (demo + prisma), the worker dashboard **Payouts** card (available/pending balance, withdraw dialog, history), the /admin pending-payouts queue (approve/reject), tests + `db:smoke`. This page documents the design; the implementation follows it as written.

---

## 1. Goal & policy

A worker's **net earnings** (`quote − platformFee`, the M5 take-rate snapshot) accrue when a job is done, and settle into a **withdrawable balance** the worker can pull out through a reviewed payout.

- **When do earnings post?** When the booking reaches **COMPLETED** — the job was done, the customer was notified, and no refund path remains (completed is terminal). NOT at confirm: a confirmed job can still be cancelled/refunded, so crediting at confirm would overpay.
- **What amount?** `quote − platformFee` (minor units), the exact "worker receives" figure the RespondDialog previews and the customer row shows — the fee snapshot is never recomputed.
- **What is a payout?** The worker requests a withdrawal of part of the available balance; an **admin reviews it** (approve → settled; reject → nothing moves). Pending requests **reserve** their amount so a worker can't double-spend while a request is in review.
- **Balance is derived, never stored** — the ledger is the single source of truth: `available = Σ POSTED earnings/adjustments − Σ PROCESSED withdrawals`. The only stored number per entry is `balanceAfter` (audit trail of the running balance).

## 2. Data model

### Prisma (`prisma/schema.prisma`)

```prisma
model WorkerLedgerEntry {
  id           String   @id @default(cuid())
  workerId     String
  worker       Worker   @relation(fields: [workerId], references: [id], onDelete: Cascade)
  bookingId    String? // set on EARNING entries (unique → credit is idempotent)
  booking      Booking? @relation(fields: [bookingId], references: [id], onDelete: SetNull)
  kind         LedgerKind // EARNING | WITHDRAWAL | ADJUSTMENT
  status       LedgerStatus // POSTED | PENDING | PROCESSED | REJECTED
  amount       Int // SIGNED minor units: earnings +, withdrawals/adjustments −
  balanceAfter Int // the worker's running balance after this entry
  currency     String @default("USD")
  reason       String?
  reviewedBy   String? // admin id for WITHDRAWAL decisions
  reviewedAt   DateTime?
  createdAt    DateTime @default(now())

  @@unique([bookingId]) // EARNING rows only — one credit per completed booking
  @@index([workerId, createdAt])
  @@index([status])
}
```

Statuses: **EARNING**/**ADJUSTMENT** post immediately (`POSTED`); **WITHDRAWAL** starts `PENDING` (reserves the amount — excluded from `available`), becomes `PROCESSED` on admin approval (now counts as a debit) or `REJECTED` (dead, never counts).

### Domain (`src/lib/data/types.ts`)

```ts
type LedgerEntryKind = "earning" | "withdrawal" | "adjustment";
type LedgerEntryStatus = "posted" | "pending" | "processed" | "rejected";
interface LedgerEntry { id; workerId; bookingId?; kind; status; amount; balanceAfter; currency; reason?; time }
interface WorkerBalance { availableMinor; pendingMinor; currency }
```

## 3. Credit at completion (both adapters, one rule)

`net = (quote ?? 0) − (platformFee ?? 0)`; if `net > 0` an EARNING entry is created **inside the same transaction/step as the COMPLETED flip**:

- **prisma** — inside `prismaTransitionBooking`'s `$transaction`: read the booking (quote/platformFee), compute the running balance, `create` the ledger row with `balanceAfter`. The `@@unique([bookingId])` makes the credit **idempotent**: a concurrent or redelivered completion can never double-credit (the second insert fails and the tx rolls back).
- **demo** — `demoTransitionBooking` performs the identical credit synchronously in the in-memory store.

Quote-less accepts (`quote = null`) → net 0 → no entry. Exempt-plan fees (fee 0) → the full quote is credited.

## 4. Payout lifecycle

```
worker: requestPayout(amount)          → WITHDRAWAL(PENDING, −amount)   [validates amount ≤ available − pending]
admin:  decidePayout(id, approve)      → PROCESSED (now counts as debit) / REJECTED (nothing moves)
```

- `requestPayout` rejects with `"insufficient"` when `amount > available − pending` (pending reserves its amount), `"invalid"` for bad input.
- `decidePayout` requires the entry be `PENDING` (CAS — two admins can't both decide), stamps `reviewedBy`/`reviewedAt` + reason, and recomputes `balanceAfter` inside the tx.
- The worker dashboard shows **available** (spendable) and **pending** (in review) separately; a withdraw dialog caps the amount at `available − pending`.

## 5. Admin queue

`/admin` gains a **Pending payouts** card: every `WITHDRAWAL(PENDING)` with worker name, amount, and request time, plus **Approve / Reject** actions (`decidePayoutAction` — admin-only, same guard as the campaign refund). The activity feed logs the decision (a future wave can add a `PAYOUT_*` code); the worker is notified via the existing notification seam when their payout is approved/rejected.

## 6. Real-money rails (future)

The settlement step is intentionally seam-free for now: `decidePayout → PROCESSED` is the **approval**, not the transfer. In production a provider payout call (Stripe Payouts / bank transfer via the payments registry) should be added between approval and PROCESSED — the ledger row's `PROCESSED` then means "money sent" and `providerRef` would ride `metadata`. The `PaymentProvider` interface gains a `payout()` method in that wave; nothing in the ledger model changes.

## 7. Currency assumption

Workers are city-keyed, so their bookings share one currency in practice (Khaled → SAR). Each entry records its `currency`; the balance surfaces the worker's city currency. Mixed-currency workers (not reachable through the current booking flow) are a documented future concern, not a bug.

## 8. Files touched

| Concern | Files |
|---|---|
| Model + migration | `prisma/schema.prisma`, `prisma/migrations/<ts>_worker_ledger/` |
| Domain types | `src/lib/data/types.ts` |
| Demo adapter | `src/lib/data/bookings.ts` (ledger store + credit + seams) |
| Prisma adapter | `src/lib/data/prisma-repo.ts` |
| Seam | `src/lib/data/repo.ts` |
| Actions | `src/app/actions/payouts.ts` |
| UI | `src/components/dashboard/worker-dashboard.tsx`, `src/app/dashboard/page.tsx`, `src/app/admin/page.tsx`, `src/components/dashboard/admin-dashboard.tsx` |
| i18n | `src/lib/i18n/translations/{en,ar}.ts` |
| Tests | `tests/bookings.test.ts` (demo), `scripts/smoke-prisma.ts` (prisma) |
