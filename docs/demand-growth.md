# Demand-first growth — instant booking, fixed-price packages, price benchmarks

Phase 2 of the revenue plan (`docs/ENHANCEMENT-PLAN.md`). Phase 1 made the money
the platform already takes *real* (`docs/booking-settlement.md`). Phase 2 goes
after the scarcer side of the marketplace: **customers**.

The audit that produced this ordering found that the supply side is monetized
from every angle — subscriptions, take rate, leads, credits, upgrades,
advertising — while the *demand* side has no reason to prefer WorkersArena over
asking a neighbour. Every worker profile showed a price and nothing told the
customer whether that price was fair; every booking was a negotiation the
customer had to wait on. Phase 2 fixes those two things first, because they are
what decides whether a customer ever returns.

Three pieces ship in this phase. They are deliberately independent: a worker can
sell instantly without benchmarks existing, and a customer can read a benchmark
on a profile that takes no instant bookings at all.

---

## 1. Instant booking — buy the job now, at a published price

`src/lib/data/instant-book.ts` · action `instantBookAction` · dialog
`src/components/worker/booking-dialog.tsx`

### The decision (pure, five conditions)

A booking is instant-bookable only when **all** of these hold:

| # | Condition | Why it is not optional |
|---|---|---|
| 1 | `Worker.instantBook` is on | Nobody is drafted into answering a job they never saw |
| 2 | The picked service has `fixedPrice: true` | The platform may only charge a card without a human agreeing a number first |
| 3 | The service is `unit: "job"` | An hourly price is a **rate**, not a total — charging it as one overcharges the customer |
| 4 | The slot is `AVAILABLE` | RESERVED / BOOKED / BLOCKED slots are somebody else's |
| 5 | The slot starts ≥ `INSTANT_BOOK_MIN_LEAD_MINUTES` (120) from now | "Book me in 10 minutes" is a promise supply cannot keep |

`instantBookDecision(facts)` is the single authority. The server action re-runs
it against **live rows** on submit, so a stale button in a browser tab can never
sell a slot the worker has since blocked, nor honour a price they have changed.
Refusals are ordered cheapest-first so the customer sees the most actionable
reason: "this worker does not take instant bookings" beats "that price is
hourly", and both beat "that slot is gone".

`instantBookableService` / `instantServices` answer the slot-independent half,
which is what a surface needs to *advertise* the feature before a slot is picked
(the badge on the service step).

### The deposit equals the price

There is nothing left to negotiate at a fixed price, so the customer pays it up
front and the job is **funded before it starts** — which is exactly what
`src/lib/data/booking-settlement.ts` credits the worker from. Confirm-now,
collect-later is the unfunded accrual Phase 1 removed; instant booking must not
reintroduce it through a second door.

### Major units vs minor units — the one place they meet

`ServiceItem.price` is stored in **MAJOR** units: a $150 package is `150`
everywhere (demo recipes, the seed, the Prisma mapper, the `<Price>` component
that renders it). A booking `quote`, a payment amount and every ledger entry are
**MINOR** units: `15000`.

Instant booking is the only place the two meet, so the conversion is a named
constant rather than an inline literal:

```
MINOR_UNITS_PER_MAJOR = 100        // src/lib/data/instant-book.ts
```

A `$150` package therefore yields `price: 150` (for display) and
`priceMinor: 15000` / `depositMinor: 15000` (for the booking). Getting this
wrong charges the customer a penny per dollar — pinned by
`tests/instant-book.test.ts` ("quotes the published price in MINOR units").

### Customer surface

On the details step, when the slot and package qualify, the **primary** action
becomes `Book instantly — $150` in emerald with a `Payable now, at the published
price…` hint; the ordinary `Send booking request` button stays beside it as an
outline, because a customer who wants to negotiate still can. Two cases
deliberately keep the request path:

- **a repeat cadence** — a recurring contract needs the worker's single accept;
- **an emergency claim** — a surge factor on a price that was never published is
  not a fixed price, so selling it at the list price would be dishonest.

When the action accepts, it hands back the checkout URL and the dialog navigates
straight to it — an instant booking that stalls on "pay later" is not instant.
If no checkout is offered (the manual OMT/Whish rails), the booking is confirmed
and the confirmation says **"Booked and confirmed!"**, not "Request sent!" — the
two are different events and the copy must not collapse them.

---

## 2. Fixed-price packages — the shelf the opt-in switches on

`publishFixedPricePackageAction` · `publishablePackage` ·
panel `src/components/dashboard/bookings/availability-panel.tsx`

The opt-in flag is **consent, not a price**. Before this existed,
`fixedPrice` was only ever true on *seeded* rows — the feature was live for
nobody real. That is the failure mode of a demand-side feature with no supply,
and it is why the package editor ships in the same phase as instant booking.

The worker keeps the services they already have (that list is the catalog the
customer sees) and decides which of them carries a buy-now price. Naming and
unit come from the existing row, so the only free input is the number:

- `publishablePackage(service, priceMajor)` returns a writable draft or a
  **refusal**: `unknown-service`, `hourly`, `invalid-price`.
- Publishing **is** the `fixedPrice` flag — there is no separate step.
- **Withdrawing does not re-price.** The service returns to being a quoted item
  at the price it was last published at, so a worker cannot accidentally re-list
  it at whatever number happens to be in the input box.
- The panel shows one row per service: name, a numeric price input, and a
  `Sell instantly` / `Stop selling instantly` button. Hourly rows show
  `per hour` and **no input at all** — the refusal is structural, not a toast
  the worker has to discover.
- The opt-in toggle itself refuses to switch **on** over an empty shelf
  (`instantServices(worker.services, true).length === 0` disables it), and its copy
  explains that a package is a per-job service priced up front. The refusal is
  one-directional on purpose: an empty shelf must never block switching the
  feature **off**, or a worker who withdraws their last package would be stuck
  with an opt-in they cannot cancel.

Both writes are worker-gated **and worker-scoped**: the service is resolved from
the session worker's own catalog, and the Prisma update carries `workerId` in its
`WHERE`, so a crafted name cannot price someone else's service. Publishing
round-trips through the demo store and the Prisma adapter with the same
semantics (`tests/instant-book.test.ts`, `tests/availability-panel-packages.test.tsx`).

---

## 3. Price benchmarks — "what does this normally cost?"

`src/lib/data/price-benchmarks.ts` · surface
`src/components/worker/price-benchmark-note.tsx` on `/workers/[slug]`

The single biggest reason a customer abandons a services marketplace is that they
cannot tell whether the number in front of them is fair. Every profile showed a
price; nothing said whether $150 for a kitchen pipe repair is routine or a gouge.

The band comes from jobs the platform has already priced: **completed** bookings
with a real quote, inside a **180-day** window (`BENCHMARK_WINDOW_DAYS`).

### Why percentiles, and why they are rounded

A mean is the wrong statistic: one emergency call-out at 3× the going rate moves
it, and a "typical price" that only exists because of one outlier is worse than no
answer. So the band is the interquartile range — **p25 → p75** with the **median**
in the middle — with linear interpolation between neighbours so the band moves
smoothly instead of jumping a whole job when the sample changes.

The numbers are then rounded to a human step (`BENCHMARK_ROUND_TO_MINOR` = $5).
"$137.42–$243.19" implies a precision the data has never had and reads like a
quote; "$140–$240" reads like what it is — what jobs like yours have cost lately.

### Why there is a floor

Below `BENCHMARK_MIN_SAMPLE` (5) samples a category reports **nothing**. Two jobs
is not a benchmark, it is two jobs — and a displayed band built from two rows is
trivially gameable by anyone who wants to move it. `benchmarkFor` returns `null`
and the surface renders nothing rather than something the data cannot support.
Categories below the floor are omitted from the result entirely, never reported
as zero.

`priceStanding(price, benchmark)` answers "is this fair?" with exactly three
verdicts — `below` / `within` / `above` — because it is not this module's job to
moralise about a price, only to say where it lands relative to the middle half of
the market.

Nothing is stored: a benchmark is derived on read, so it can never go stale
against the jobs it describes. Both adapters gather the same rows
(`demoPriceBenchmarkJobs` / `prismaPriceBenchmarkJobs`) and the same pure engine
does the arithmetic, so the two adapters cannot order or round differently.

---

## What this phase does **not** include

Still ahead in the demand-first track, in the order the plan set:

- **Guest → account claim** — turn a phone-keyed guest booking into an account so
  the second purchase has a home.
- **WhatsApp booking entry** — start a booking from the channel customers already
  use to talk to tradespeople.
- **SEO expansion** — city × category landing pages from the same catalog data.
- **Review solicitation** — ask for the review at the moment the job completes,
  which is when the customer is happiest.
- **Payment automation** — deferred by decision; the OMT/Whish manual rails plus
  the admin confirm remain the collection path.

## Tests

| File | Locks |
|---|---|
| `tests/instant-book.test.ts` | the five conditions, the major→minor conversion, price rounding, the refusal to sell hourly work or a $0 job, the package draft rules, and the demo store round-trip |
| `tests/booking-dialog.test.tsx` | the service-step badge (one instant package, not two), the one-tap buy with the request path kept beside it, the hourly trap, an opted-out worker, and a slot inside the lead time |
| `tests/availability-panel-packages.test.tsx` | which rows can be sold, the typed price reaching the action, withdrawal not re-pricing, and the two refusal toasts |
| `tests/price-benchmarks.test.ts` | percentile interpolation, the sample floor, rounding never inverting the band, and the three standings |
| `npm run db:smoke` (§Phase 2) | the live-DB half: the opt-in and a sellable package map through the real adapter, publish/withdraw/restore round-trips a borrowed row (and a name that is not on the worker's catalog cannot be priced), the slot re-read returns a real slot, and the benchmark gather returns trade-carrying samples whose bands are ordered |

### One dev-environment defect found while verifying this phase

`src/lib/data/demo-store-shape.ts`. The demo stores live on `globalThis` so every
Turbopack entry graph shares one copy — which means a long-lived `next dev`
process keeps the object it created *first*. Phase 1 added `settlements` to the
booking store, so every process started before that commit held a store without
it: `STORE.settlements.get(...)` threw inside `withSlaSignal`, and every worker
profile and `/search` render died on the error boundary while the same code was
correct in a fresh process (and in production, where each process starts empty).
Adoption now heals the stored object against the current build's shape. The same
staleness in the *elements* of a store (the demo workforce, built by
`buildWorkforce`) cannot be healed without discarding in-place mutations, so that
case is documented rather than rewritten: a demo-data change still needs a dev
server restart.

## See also

- [booking-settlement.md](booking-settlement.md) — why an instant sale must be **funded** up front
- [booking-scheduling.md](booking-scheduling.md) — the slot model the lead-time rule rides on
- [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) — the phase ordering and what is next
- [BUSINESS-MODEL.md](BUSINESS-MODEL.md) / [REVENUE-STREAMS.md](REVENUE-STREAMS.md) — how this converts into revenue
