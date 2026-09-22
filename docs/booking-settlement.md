# Booking Settlement — the money behind a job

[← Back to docs index](README.md)

> **Status: ✅ implemented.** Pure engine (`src/lib/data/booking-settlement.ts`), the second payment leg (`Booking.settlementPaymentId` + migration `20260922160000_booking_settlement`), the funds-aware earnings credit in both adapters, `BookingStatus.SETTLED` on the audit trail, the customer **pay-the-balance** card, the worker **waiting on the customer** banner, the worker's **settled directly** declaration, the admin **pending-payments** card's `leg`, and the admin **reconciliation** card. Unit tests (`tests/booking-settlement.test.ts`, `tests/settlement-reconciliation-card.test.tsx`) + live-DB coverage in `npm run db:smoke`.

---

## 1. The problem this exists to prevent

The take rate is only real money when the platform handled the money. Before this engine, `creditEarnings` credited `quote − platformFee` to the worker's **withdrawable balance** at COMPLETED with **no reference to whether any money had been received**:

- a **quote-only job** (accepted with a price, never paid through the platform) accrued a payout the platform never collected;
- an approved payout then paid that worker out of **platform funds**;
- and because `Booking.paymentId` is `@unique`, there was no second payment path for the balance even when the customer did want to pay.

The rate was therefore *accrued*, not *collected* — and every other revenue lever (leads, credits, subscriptions) sits on top of this one, so it had to be fixed first.

## 2. The invariant, in one sentence

> **The ledger never credits more than the platform has collected, and the fee is only ever taken out of money actually received.**

`settlementFor(facts)` is the single decision point. It is **pure** — no db, no clock, no side effects — and *every* surface calls it: both adapters' credit path, the customer's pay card, the worker's banner, the payout guard, and the admin reconciliation. No surface reads the raw payment rows to decide whether a worker can be paid.

## 3. Where a job's money can stand

| State | Means | Worker credit |
|---|---|---|
| `no-quote` | quote-less accept — there is no job value to collect | nothing |
| `funded` | collected ≥ quote (the classic deposit job) | `collected − fee` |
| `part-funded` | the deposit landed, the balance did not | the collected part now, the rest as an `ADJUSTMENT` when the balance is confirmed |
| `awaiting-customer` | nothing collected, nothing requested yet | nothing |
| `awaiting-confirmation` | a manual OMT/Whish reference is issued and unpaid | nothing (a reference is a promise, not money) |
| `outside-platform` | the parties settled directly (cash on the doorstep) | nothing — the fee becomes a **claim** |
| `overpaid` | collected > quote (a double-paid deposit) | `collected − fee`, with the excess flagged for refund |

Each verdict also carries a `reason` string that is stored on the ledger row, so the worker's statement explains itself.

## 4. The engine API

| Function | Answers |
|---|---|
| `settlementFor(facts)` | the verdict for one booking (state + every amount) |
| `settlementNeedsCollection(s)` | is money still missing before this job is settled? |
| `settlementPayable(s)` | may a payout be released against it? (`funded`, `part-funded`, `overpaid`) |
| `ledgerDeltaFor(s, already)` | what to POST: `0`, an `earning`, or an `adjustment` |
| `feeClaimPlan(claim, balance)` | how much of an outside-platform fee claim the worker's credit balance absorbs |
| `payoutGuard({ available, pending, requested })` | may this withdrawal leave the platform at all? |
| `tallySettlements(rows)` / `reconcileSettlements(jobs)` / `reconciliationQueue(jobs)` | the admin reconciliation (§7) |

## 5. Persistence

- **`Booking.settlementPaymentId`** — the *second* payment leg. The deposit and the balance are different payments with different amounts, so they are separate unique FKs; `PendingManualPayment` carries a `leg` (`"deposit" | "settlement"`) so confirming the balance can never be mistaken for confirming the deposit.
- **`BookingStatus.SETTLED`** — audit-event only. It records *how* a job was settled (the balance collected, or the parties settling directly) without inventing a funnel bucket.
- **The credit** runs at whichever comes **last** — completion or collection — and is idempotent either way: one `EARNING` per booking (`@@unique([bookingId])`), top-ups as `ADJUSTMENT` rows, and a redelivered webhook or a second admin confirmation is a no-op (the flip is a CAS on `PENDING`).

## 6. The surfaces

| Surface | What it does |
|---|---|
| **Customer `/bookings` row** | On a finished job whose balance is outstanding, a pay card names the amount and collects it on the same rails as the deposit (Stripe-shaped URL, or a signed OMT/Whish reference an admin confirms). It states the promise: paying releases the worker's payout. |
| **Worker dashboard row** | The same card, `role="worker"`: "waiting for the customer — $X outstanding", plus the reason the money has not appeared. No pay control — the worker cannot pay the customer's balance. |
| **Worker: "we settled this directly"** | The honest exit for a cash job. The dialog spells out the consequence first (no earnings credited; the platform's fee becomes a claim recoverable from the credit balance), then records it and cancels any pending checkout. |
| **Admin pending-payments card** | The balance appears exactly like a deposit, tagged `settlement`, and confirming it is the manual twin of a provider webhook. |
| **Payout guard** | `payoutGuard` is the single statement of the withdrawal rule, and because every posted earning is funded by construction, an unfunded legacy credit can never be paid out. |
| **Admin reconciliation card** | §7. |

## 7. The reconciliation (admin)

`getSettlementReconciliation(days)` reads every job that **finished in the window** *or* is still sitting in a money state (so a blocked payout never ages out of the view), and joins it to what the earnings ledger already holds. The card then shows:

- **fee stamped** vs. **fee collected** — what the take rate says the platform earned vs. what it holds;
- **awaiting customers** — the cash gap that is legitimately waiting on customers;
- **unbacked credit** — ledger money with no collection behind it. This is the canary: it must read **$0.00**, and it is reported explicitly rather than assumed;
- **still owed / blocked on collection** — worker money that exists in principle but is waiting for the customer;
- **outside-platform claims** — claimed, recovered and outstanding.

The worklist is ordered worst-first (`reconciliationQueue`): unbacked credit → claims with money outstanding → credit blocked on collection → part-funded → awaiting confirmation. Fully funded jobs are omitted — there is nothing to do about a job the platform already collected for.

## 8. Outside-platform claims

A worker who was paid in cash has not done anything wrong — the platform simply never handled the money. So:

- **no earnings are credited** (there is nothing to pay from);
- the platform's fee is recorded as a **claim** (`feeClaimMinor`), never fabricated into the ledger;
- `feeClaimPlan` collects it **tranche by tranche against the worker's credit balance** — real money the worker already paid for — and leaves the rest as a claim for an admin to pursue or write off;
- declaring it is idempotent, and it cancels any pending balance checkout so the customer stops being asked for money they already handed over.

## 9. What this deliberately does **not** do

- **No payment gateway.** The balance rides the existing manual rails (OMT/Whish reference → admin confirms) or the Stripe-shaped checkout seam already used by deposits. Nothing here changes the provider registry.
- **No automatic write-off** of an outside-platform claim: the remaining claim stays visible in the reconciliation until an admin acts.
- **No historical rewrite.** A legacy over-credit is never reversed by this engine (`ledgerDeltaFor` returns 0 for it, and the reconciliation reports it) — silence, not a clawback.

## 10. Verification

- `tests/booking-settlement.test.ts` — the pure engine: every state, the funded/unfunded boundary, the settlement top-up as an `ADJUSTMENT`, refunded deposits, over-collection, junk inputs, `feeClaimPlan`, `payoutGuard`, `tallySettlements`.
- `tests/settlement-reconciliation-card.test.tsx` — the admin card's wiring, including the unbacked-credit canary jumping to the front of the queue.
- `npm run db:smoke` — the live path: an unfunded finished job credits **nothing**; the balance is minted on the manual rails, appears in the admin card, is confirmed, and then credits the net **exactly once**; a job settled directly credits nothing and records the claim; and the reconciliation asserts **no job in the window holds a ledger credit the platform never collected**.
- `scripts/seed-production.ts` **funds** every completed demo job it seeds (a paid deposit covering the quote). Before that, the seed itself created the unfunded accrual the engine exists to prevent, so a fresh install opened the reconciliation on a red banner. It also heals already-seeded rows on re-run.

## Related

- [booking-take-rate.md](booking-take-rate.md) — the fee itself (rate/floor/cap, stamp-at-accept) and §Settlement in that doc's own terms.
- [payouts.md](payouts.md) — the ledger, the withdrawal lifecycle, and where the credit now lands.
- [PAYMENTS.md](PAYMENTS.md) — the rails both legs ride.
- [fee-rules.md](fee-rules.md) — the versioned rule set that decides the fee being settled.
- [BUSINESS-MODEL.md](BUSINESS-MODEL.md) — why revenue had to become collectable before anything else could be priced on top of it.
