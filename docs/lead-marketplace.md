# Qualified Lead Marketplace — grading, matching, paid leads and contact reveal

[← Back to docs index](README.md)

> **Status: ✅ implemented.** `src/lib/data/lead-market.ts` (pure engine: grading, pricing, matching, ownership, reveal, §11 rebate) · `src/lib/data/lead-market-store.ts` (demo store + purchase path) · `src/lib/data/lead-market-prisma.ts` (Postgres adapter) · `src/lib/data/lead-rebate.ts` + `lead-rebate-prisma.ts` (§11: what a converted lead gives back) · `src/lib/data/lead-notifications.ts` (offer/lost/expired payloads) · migrations `20260914150000_lead_offers` (`LeadOffer`), `20260914180000_quote_request_is_emergency` (`QuoteRequest.isEmergency`) and `20260914200000_lead_rebate` (`LeadRebate`) · worker board at `/dashboard/leads` · admin panel at `/admin/revenue-settings` · demo fixture `POST /api/dev/seed-lead-market` · tests `tests/lead-market.test.ts`, `tests/lead-market-panel.test.tsx`, `tests/lead-market-prisma.test.ts`.
>
> **Two bugs found while building this, both fixed:** (1) `QuoteRequest.isEmergency` was accepted by the create action but never persisted — both adapters dropped it and the Prisma model had no column, so no posted request could ever grade as an EMERGENCY lead (the flag now rides the request, reaches the marketplace, and the customer's quote dialog can set it); (2) `normalizeFeeRuleSet` silently dropped `leadMarket`, so publishing a take-rate change reset the whole marketplace policy back to the shipped defaults. Both are covered by regression tests.
>
> It **spends** the platform credits introduced by [fee-rules.md §7](fee-rules.md) (the `WorkerCreditEntry` ledger) and prices leads from the same versioned rule set as the take rate, so both monetization levers are configured in one place — and §11 closes the loop: a job whose lead was bought credits that lead's value back as a fee reduction on the job, so buying leads lowers the effective take rate on the work they win.

---

## 1. Why

A `QuoteRequest` used to be one thing: a job post that invited up to three workers. The customer picked the workers; the platform earned only when a job completed.

That leaves the middle of the funnel empty. Most requests land on workers who never see them, and the platform has nothing to sell to a professional who was never invited. The lead marketplace makes the *match* the product:

```
Customer request
      ↓
§7 grade it            bronze / silver / gold / emergency
      ↓
§8 match the pool      weighted signals → the few best workers ONLY
      ↓
§9 offer it            priced in credits, exclusive, expiring
      ↓
Worker buys            credits debited once, rivals withdrawn
      ↓
§10 reveal             the customer's contact details unlock
      ↓
Quote → job            the existing booking pipeline takes over
      ↓
§11 complete the job   the lead's value comes back as a fee rebate
```

The customer experience is unchanged — they still post a request and receive quotes. What changes is that the workers the customer *didn't* think to invite can now pay to compete for it.

**A lead is a commercial asset**, so it is graded, priced, capped, expires, and is owned exclusively once bought.

---

## 2. §7 — Grading

`gradeLead(signals)` scores a request 0–100 and buckets it:

| Grade | Default price | What it means |
|---|---|---|
| **bronze** | 5 credits | A trade is named and little else — "I need a plumber". |
| **silver** | 9 credits | Service, area and real detail known. |
| **gold** | 20 credits | Verified customer, priced service, long description, photos. |
| **emergency** | 35 credits | 24/7 urgent work. Wins outright, however short the text. |

Weights (sum 100) live in `LEAD_GRADE_WEIGHTS`: trade 15 · priced service 15 · location 15 · description 15 (scaled to 120 chars) · signed-in customer 15 · email 10 · preferred time 10 · photos 5 (scaled to 3). Thresholds: silver ≥ 40, gold ≥ 70.

Note how much the signals matter in practice: a bare "I need a plumber" with a city is 30 points (bronze), but add a reachable email and it is 40 — silver. That is the intended economics: the more of the customer the platform can vouch for, the higher the grade, and the honest grade is what the platform sells.

The emergency grade depends on `QuoteRequest.isEmergency`, which is set by the customer's emergency toggle in the quote dialog (for workers who offer 24/7 service) and persists with the request.

The result carries a **breakdown**, so any surface can explain a grade ("why is this gold?") without re-deriving it.

A bare request is a bronze *by construction*: it scores 0, so price, ownership and reveal rules all follow from what the customer actually provided.

## 3. §8 — Matching

`matchLeadCandidates(pool, lead, { weights, maxWorkers, excludeWorkerIds })` ranks the pool and **cuts it to the configured few**.

Two **hard filters** run first, because no weight can compensate for them:

- a different trade (a plumber cannot serve an electrical job),
- an inactive worker, or a non-emergency worker on an emergency lead.

Everything else is weighted, so a strong nearby generalist can outrank a distant specialist:

| Signal | Default weight |
|---|---|
| Trade match | 30 |
| Same area / same city | 12 / 8 |
| Rating (0–5 → 0–1) | 12 |
| Response rate | 10 |
| Availability this week | 8 |
| Review volume (log-scaled) | 6 |
| Plan tier (free → business) | 6 |
| Emergency-capable | 5 |
| Verified identity | 3 |

Ties break on review volume, then rating, then worker id — the order is **deterministic**, so the same pool always yields the same list.

`matchReasonsFor(breakdown)` reports which signals actually earned points, which is what the worker's board shows as *why you were matched*. The board re-runs the same scoring function server-side for the viewing worker, so the explanation is arithmetic rather than a display-side guess.

A **lapsed subscription earns no tier weight** (an expired plan is invisible in search too), so the ranking lever cannot be farmed by letting a plan lapse.

## 4. §9 — Ownership, caps and expiry

| Setting | Default | Meaning |
|---|---|---|
| `maxWorkersPerLead` | 3 | How many matched workers see one request. |
| `offerTtlMinutes` | 120 | How long a matched worker has to buy it. |
| `exclusive` | true | Buying withdraws the competing offers. |

- **Exclusivity** is checked at purchase time (`offersToRevoke`), not at creation, so flipping the setting only affects sales that happen after the change.
- **Expiry is time-based**, computed from `expiresAt` — not a flag that only a cron can flip. `expireLeadOffers()` is the cron twin of the quote SLA sweep (idempotent).
- Workers the customer **invited directly are excluded** from the offer pool on purpose: they already hold a free invite to the same job, so selling them the lead would be charging for something they already have. What the marketplace sells is the match the customer never made.

`LeadOffer` is unique on `(leadId, workerId)`, so re-running a match never duplicates (or re-prices) an offer.

## 5. §10 — Contact reveal

Contact information is monetizable — and a privacy obligation. `contactRevealFor()` resolves one of three states:

| State | What the viewer sees |
|---|---|
| `hidden` | Nothing. |
| `masked` | Phone keeps its last two digits; email keeps its first character and domain. |
| `revealed` | The real value. |

Order matters, and it is enforced in one function so no surface can be the leaky one:

1. **booked** → `afterBooking` (the customer chose this worker, so consent is real),
2. not purchased → `beforePurchase` (default `masked` — enough to recognise, not enough to cold-call a list),
3. purchased on a free plan → `afterPurchaseFreeTier` (default `masked` — **the tier lever**: hold free workers at a partial reveal until they subscribe),
4. otherwise → `afterPurchase` (default `revealed`).

The decision happens **server-side**, before the payload leaves the server: the worker's board never receives a phone number it may not show. `leadBoardItemFor()` builds each row through that policy, and the client re-fetches after a purchase rather than unmasking anything locally.

## 6. The money path

`purchaseLeadOffer(offerId, workerId)` is ordered so that a refusal at any earlier step leaves no trace:

```
offer exists AND belongs to this worker
        ↓   (never leak someone else's offer)
still live (status offered AND inside its window)
        ↓
debit the credit ledger      idempotent by offerId — a retry cannot double-charge
        ↓                        and an insufficient balance is a refusal, never a negative row
offer → purchased            status CAS
        ↓
revoke rivals                only when the lead is exclusive (§9)
        ↓
record the reveal            the state the buyer now has (§10)
        ↓
audit entry                  LEAD_PURCHASED
```

Credits come from the **append-only platform credit ledger** (`WorkerCreditEntry`, [fee-rules.md §7](fee-rules.md)) — granted by campaigns, admin adjustment, or (in production) a top-up. The balance is always *derived* from the rows, never stored. 1 credit = $1 by convention.

## 7. §11 — The lead rebate: what a lead gives back when it converts

A bought lead is a bet: the worker pays credits to reach a customer and only earns if the job happens. The rebate closes the loop — **when a job whose lead was bought completes, the platform credits the lead's own value back as a fee reduction on that job**, so the effective take rate on the work it won falls by exactly what the lead cost:

```
7% of $300 = $21 fee · gold lead cost $20
→ rebate $20 → the platform keeps $1, the worker nets $299
```

The pricing is pure (`leadRebateFor`, `src/lib/data/lead-market.ts`):

```
rebate = min(fee × pctBps / 10 000, lead cost, ceiling)
```

Three bounds make it safe, and `limitedBy` records which one bit:

| `limitedBy` | Meaning |
| --- | --- |
| `disabled` | the policy is off — the stamped fee is charged in full |
| `no-lead` | the job had no fee, or the worker did not buy this lead |
| `fee` | the share of the fee (`pctBps`; default 100% of the fee) |
| `lead-cost` | the lead's own price — a rebate can never be a profit on the lead |
| `ceiling` | the configured per-job cap |

The platform can therefore never pay out more than it earned on the job, and attribution is never a guess: the **purchased `LeadOffer`** is the proof (the offer records the worker and the lead), and the `Booking.quoteRequestId` is the join. A direct booking — or a lead the worker did not pay for — rebates nothing.

**Where it lands.** The rebate rides the *same* earnings row as net pay (one `EARNING` per booking, `@@unique([bookingId])`), so a payout statement reconciles and a redelivered or concurrent completion cannot rebate twice. In real mode the whole derivation is resolved **inside the completion transaction** — the offer is read with the same client that credits the money — and an append-only `LeadRebate` row (`bookingId` unique, migration `20260914200000_lead_rebate`) records what the lead cost, the fee it reduced, the share and ceiling that limited it, and the rule version in force, so any rebate can be re-derived after the policy changes. `Booking.leadRebateMinor` is denormalized for display only; the row remains the audit record.

**Surfaces.** The worker's booking row shows the effective fee (stamped fee − rebate) beside the quote; the lead board marks a lead that has already paid for itself; and `/admin/revenue-settings` → Lead marketplace carries the on/off switch, the share and the ceiling, plus the granted-rebate audit and summary.

## 8. Surface area

**Worker — `/dashboard/leads`**

- Credit balance, and what it buys.
- Three tabs: **Available** (live, best match first), **Purchased**, **History**.
- Each live row shows the grade, the lead number, the job, the locked price, the match score, *why* they were matched, and a live countdown.
- Each purchased row shows the customer's details **as far as the policy allows**.
- The dashboard's credit card links here; `/api/credits/balance` reports the real ledger numbers.

**Admin — `/admin/revenue-settings` → Lead marketplace**

- Prices per grade, `maxWorkersPerLead`, offer window, exclusivity.
- The four contact-reveal rules, including the free-plan row.
- The ten matching weights.
- The audit: recent offers (grade, match, price, status) and the credit ledger, plus an admin adjustment form.
- **Publishing appends a new rule version** — an offer already created keeps the price it was quoted at.

**Notifications** reuse the existing `lead` type (no enum migration): `lead-offer`, `lead-offer-lost` (an exclusive purchase withdrew your offer), `lead-offer-expired`.

## 9. Demo mode

`POST /api/dev/seed-lead-market` (demo-only, 404 in production) posts four requests of deliberately different grades through the **real** `createQuoteRequest` seam, so distribution grades, matches and offers them exactly as production would; it also grants the demo worker credits so a purchase can be exercised end to end. It is idempotent on its marker email.

## 10. What is not built yet

- **Promo-code redemption at purchase** — the ledger and code scoping exist ([fee-rules.md](fee-rules.md) §7), but the marketplace does not yet accept a code that discounts a lead.
- **Credit top-up checkout** — `/api/credits/packages` is a catalog; there is no purchase flow into the ledger (credits arrive by grant/adjustment today).
- **Buyer refunds** — an admin can claw credits back with an adjustment row, but there is no consumer-facing dispute path for a lead whose customer never replied.
- **Worker preferences** (categories, budget floor, do-not-disturb windows) — the matcher reads the worker row, not declared preferences.
- **Lead quality feedback** — nothing yet feeds "this lead was junk" back into a worker's pricing or the grader's weights.
- **A rebate timeline on the lead board** — the total a lead has given back is shown, but not the individual rebates behind it.

## 11. Related

- [fee-rules.md](fee-rules.md) — the versioned rule set the prices/weights/rebate policy live in, and the credit ledger lead purchases debit.
- [booking-take-rate.md](booking-take-rate.md) — the take rate the rebate reduces.
- [multi-candidate-quotes.md](multi-candidate-quotes.md) — the `QuoteRequest`/`Booking` auction layer a bought lead converts into.
- [PRIVACY-COMMUNICATION-FLOW.md](PRIVACY-COMMUNICATION-FLOW.md) — the platform's other contact-privacy mechanism (masked calling).
- [BUSINESS-MODEL.md](BUSINESS-MODEL.md) — where lead revenue sits in the model.
- [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) — the party-pair map this adds a Worker ⇄ platform flow to.
