# Platform Fee Rules — configurable take rate + immutable snapshots

[← Back to docs index](README.md)

> **Status: ✅ implemented.** `src/lib/data/fee-rules.ts` (engine) · `src/lib/data/fee-rules-store.ts` (demo store + seam) · `src/lib/data/fee-rules-prisma.ts` (Postgres adapter) · migration `20260914090000_platform_fee_rules` (`FeeRuleSet` + `PlatformFeeSnapshot`) · admin editor at `/admin/revenue-settings` · tests `tests/fee-rules.test.ts`.
>
> This doc **extends** [booking-take-rate.md](booking-take-rate.md) (the original M5 take rate) — that fee is now the *default rule* of this engine.

---

## 1. Why

The take rate was one hard-coded constant: `PLATFORM_FEE_RATE_BPS = 700`, min $5, max $300, Enterprise exempt. That is a single price for the whole platform — it cannot express a plan ladder, category pricing, emergency work, or a promotional rate, and changing it was a deploy.

The engine keeps that exact policy as its **default rule set** (so enabling it changed no live fee) and adds what a real pricing system needs:

| Capability | How it is expressed |
|---|---|
| Plan-tier ladder (free → business) | `planTiers[tier].rateBps` |
| Category pricing | `categories[categorySlug].rateBps` |
| Emergency (24/7) jobs | `emergency.rateBps` |
| Promotions / campaigns | `promotions[]` (windowed, scoped, optional code) |
| Flat fee / floor / cap | `fixedMinor` / `minMinor` / `maxMinor` |
| Waived plans | `planTiers[tier].exempt` |
| Referral config | `referral.referrerBonus`, `inviteeBonus`, `monthlyCap`, `lifetimeCap` |
| Lead marketplace | `leadMarket.prices`, `weights`, `reveal`, `rebate` |
| Plan catalog | `planCatalog` (admin-editable pricing) |

Everything is **basis points and minor units** — integer money, no floats.

---

## 2. The two invariants

**Determinism.** The fee is a pure function of `(ruleSet, subtotal, context)`; the resolver never reads the clock (`at` is passed in) and never allocates ids. The worker's `RespondDialog` imports the *same* module as the server, so the preview and the stored value cannot drift.

**Immutability.** An accept stores a `PlatformFeeSnapshot` that carries the **rule version**, the rate, the floor/cap/fixed components, the plan tier, the currency and the timestamp. Later price changes never touch it, and it can be re-derived exactly:

```
fee = min(clamp(round(subtotal × bps / 10 000), min, max) + fixed, subtotal)
```

Round-half-up, then the floor/cap, then the flat component, then a final guard so the platform can never charge more than the job is worth.

---

## 3. Layer precedence

```
default → plan tier → category → emergency → promotion → (exemption short-circuits)
```

- Later layers override earlier ones field-by-field (`mergeFeeRule`), so a category override of `rateBps` keeps the plan's floor/cap.
- **Exemption is checked first and is absolute**: a waived plan ("Business pays no transaction fee") cannot be re-charged by a promotion, and the snapshot records the *plan's* rate with `exempt: true`.
- **The first matching promotion wins** — the list is ordered by the admin, most specific first, so a narrow campaign is never overwritten by a broader one listed later.
- A promotion matches when every scope field it sets matches (`planTier` AND `categorySlug` AND `promoCode`), and its window is open.

> **Floor economics to keep in mind:** the shipped `minMinor` ($5) means any rate below ~6.25% is invisible on a job under $80 — a 4% Business rate on an $80 job charges $5, not $3.20. The admin preview shows this honestly (it renders the floor), and the rule is configurable per tier, so a low rate for small jobs means lowering the floor, not just the percentage.

Plan tier mapping (a **config layer** over the existing `SubscriptionPlan` enum — no enum migration):

| Subscription plan | Monetization tier | Fee rate |
|---|---|---|
| *(none)* | `free` | 12% |
| Basic | `starter` | 9% |
| Professional | `professional` | 7% |
| Premium | `growth` | 5% |
| Enterprise | `business` | 4% (or exempt) |

The **recommended ladder** (12 / 9 / 7 / 5 / 4%) ships as the default rule set. Adopting it is a pricing decision, not a code change.

---

## 4. Where the fee is stamped

Accept-with-quote is still the single stamp point (nothing recomputes a fee later):

| Path | Demo | Prisma |
|---|---|---|
| Worker accepts a request with a quote | `demoRespondToBooking` | `prismaRespondToBooking` |
| Customer accepts a quote made in the booking chat | `demoAcceptChatQuote` | `prismaAcceptChatQuote` |
| Recurring contract accepted (first occurrence + each materialized occurrence) | — | `prismaRespondToRecurring` |

Each site loads the active rule set **before** its transaction, prices the quote, writes `platformFee` / `platformFeeRateBps` (unchanged columns, so every existing surface keeps working) and inserts the snapshot row inside the same transaction. `PlatformFeeSnapshot.bookingId` is `@unique` — one fee per booking, and a retried accept can never double-charge.

Accept **without** a quote stays fee-free and writes no snapshot.

**Known gap (unchanged by this wave):** selecting a winner on a multi-candidate quote request (`QuoteRequest`) does not stamp a fee in either adapter — the winner becomes a slot-bound request and the fee is only stamped on a later quoted accept. Treat this as a follow-up; the engine makes it a two-line call.

---

## 5. Admin flow (`/admin/revenue-settings`)

1. Edit the baseline rule and/or any tier (rate %, min $, max $, fixed $, waiver).
2. The panel shows, per tier, **what a sample $80 job costs and what the worker receives** — computed with the same `computeFee` the server stores.
3. "Publish new version" appends version N+1, deactivates the previous row, and logs a `FEE_RULES_UPDATED` activity entry with the acting admin.
4. The panel lists the recent **versions** and the recent **fee snapshots** (fee, tier, rate, rule version, quote, net, date) — the audit trail of what was actually charged.

Validation is server-side (zod + `normalizeFeeRuleSet`): rates are clamped to 0–100%, negatives are impossible, `max ≥ min`, and unknown tiers or malformed promotions are dropped. A hand-edited jsonb payload cannot charge an absurd rate.

---

## 6. Files

| File | Role |
|---|---|
| `src/lib/data/fee-rules.ts` | pure engine: types, defaults, `resolveFeeRule`, `computeFee`, `priceJob`, `buildFeeSnapshot`, `normalizeFeeRuleSet`, `tierRateTable` |
| `src/lib/data/fee-rules-store.ts` | mode-aware store: active rule set, versions, snapshots, `saveFeeRuleSet`, `priceQuoteForSnapshot` |
| `src/lib/data/fee-rules-prisma.ts` | Postgres adapter: rows ⇄ domain, append-only version insert, snapshot insert payload |
| `src/lib/data/booking-ui.ts` | `computePlatformFee` / `isPlanFeeExempt` now delegate to the engine (constant-based callers keep working) |
| `src/app/actions/fee-rules.ts` | admin server actions (publish rules; promotion write path) |
| `src/components/admin/fee-rules-panel.tsx` | the admin editor + preview + audit lists |
| `src/lib/data/credit-ledger.ts` + `credit-ledger-prisma.ts` | the append-only platform credit ledger + `applyPromotionCreditGrant` |
| `src/components/admin/promotions-panel.tsx` | the campaign editor, economics preview, snapshot attribution and grant list |
| `prisma/schema.prisma` + `20260914090000_platform_fee_rules` | `FeeRuleSet`, `PlatformFeeSnapshot` |
| `src/lib/data/subscription-plans.ts` | Plan catalog (admin-editable pricing, category multipliers, trial) |
| `src/lib/data/referral.ts` | Referral program config (referrer/invitee bonuses, caps) |
| `src/lib/data/lead-market.ts` | Lead marketplace config (grade prices, matching weights, reveal policy) |

> **Deploy note:** apply the migration before shipping the code (`npx prisma migrate deploy`). The snapshot write is part of the accept transaction, so a missing table fails the accept rather than silently dropping the fee.

---

## 7. Promotions (§24) — campaigns, attribution and credit bonuses

`/admin/revenue-settings` → **Promotion campaigns** (`src/components/admin/promotions-panel.tsx`). A campaign fixes the platform's rate for a window, optionally scoped:

| Field | Effect |
|---|---|
| Rate / min / max / fixed / waive | the take rate while the campaign applies |
| Window (start → end) | bounded, either side optional (open-ended) |
| Plan tier | only jobs priced at that tier |
| Category | only that service category |
| Promo code | only when that code is presented |
| Bonus credits | platform credits granted on plan purchase/renewal inside the window |
| Live / Paused | pause a campaign without deleting it |

**Ordering is precedence** — the first matching campaign wins, so the most specific one goes first. The panel previews each campaign's economics on a sample $80 job using the same `computeFee` the server charges, and prefills unset fields from the live rule set so a re-rate-only campaign keeps the platform floor instead of silently sending `min = 0`.

**Attribution is read from the snapshots.** "Priced 3 quotes · $18.00 fee on $600.00 of work" is an aggregate over `PlatformFeeSnapshot` rows stamped with that `promotionId` — the same immutable record the money came from, so attribution can never disagree with what was charged. The recent-quote list shows each priced job (fee, quote, rate, date), and paused campaigns stay visible with their history.

### Credit bonuses are real (the §20 seed)

`bonusCredits` is not a decoration: `src/lib/data/credit-ledger.ts` is an **append-only platform credit ledger** (`WorkerCreditEntry`, migration `20260914120000_worker_credit_ledger`) whose balance is always *derived* from its entries, never stored. A worker who buys or renews a plan while a campaign runs gets the credits, recorded once per worker per campaign (`(workerId, promotionId)` unique — a re-confirmed payment cannot double-grant). The grant rides both purchase-confirm paths (demo `demoConfirmPurchase`, real `prismaConfirmPurchase`), and a bonus can never break the purchase it rides on.

Deliberate scope limits, so nothing here is a facade:

- A grant requires an **unscoped-or-plan-scoped, code-less** campaign — a category campaign is about job pricing, and codes have no redemption field in the purchase flow yet.
- The tier that counts is the **purchased** plan (buying Basic under a Starter campaign earns the Starter bonus).
- **Spending** credits: the **lead marketplace** ([lead-marketplace.md](lead-marketplace.md)) debits this ledger when a worker buys a lead (`spendCredits`, idempotent by `offerId`, with the purchase refused rather than half-completed when the balance is short). Featured placement, ads and §21 cash-job fee settlement are the remaining debits this ledger is the account for; the `/api/credits/*` endpoints in `revenue-settings.ts` are still only a package *catalog*.

Publishing campaigns replaces the whole list in one new rule-set version, so the version every old snapshot points at still resolves.

---

## 8. Referral config

The referral program configuration lives inside the versioned rule set (`FeeRuleSet.referral`), following the same pattern as `leadMarket` and `planCatalog`:

| Field | Default | Meaning |
|---|---|---|
| `referrerBonus` | 25 | Credits granted to the referrer on qualifying action |
| `inviteeBonus` | 10 | Credits granted to the invitee on signup |
| `monthlyCap` | 10 | Max referrals per referrer per month (0 = unlimited) |
| `lifetimeCap` | 0 | Max total referrals per referrer (0 = unlimited) |
| `qualifyingAction` | `"firstBooking"` | What the invitee must do to trigger the referrer's bonus |

**Admin editing:** the referral config is editable via the same fee-rules admin panel as the take rate, promotions, and lead marketplace. Publishing a change appends a new rule version, so old snapshots keep working.

---

## 9. Lead marketplace config

The lead marketplace configuration lives inside the versioned rule set (`FeeRuleSet.leadMarket`):

| Field | Default | Meaning |
|---|---|---|
| `prices.bronze` | 5 | Credits for a bronze lead |
| `prices.silver` | 9 | Credits for a silver lead |
| `prices.gold` | 20 | Credits for a gold lead |
| `prices.emergency` | 35 | Credits for an emergency lead |
| `maxWorkersPerLead` | 3 | How many workers see one lead |
| `offerTtlMinutes` | 120 | How long an offer stays buyable |
| `exclusive` | true | Buying revokes rivals |
| `reveal.beforePurchase` | masked | What non-buyers see |
| `reveal.afterPurchase` | revealed | What buyers see |
| `reveal.afterPurchaseFreeTier` | masked | What free-plan buyers see |
| `reveal.afterBooking` | revealed | What booked workers see |
| `weights` | (see §8) | Matching signal weights |
| `rebate.enabled` | true | Whether rebates are active |
| `rebate.pctBps` | 10000 | Share of fee to rebate (basis points) |
| `rebate.maxMinor` | null | Per-job rebate ceiling |

**Admin editing:** all lead marketplace settings are editable via `/admin/revenue-settings` → Lead marketplace. Publishing a change appends a new rule version.

---

## 10. Plan catalog config

The subscription plan catalog lives inside the versioned rule set (`FeeRuleSet.planCatalog`):

| Plan | Label (EN) | Label (AR) | Monthly Price | Leads/mo | Fee Exempt |
|------|-----------|-----------|---------------|----------|------------|
| basic | Starter | مبدأية | $15 | 3 | No |
| professional | Growth | نمو | $39 | 10 | No |
| premium | Pro | احترافي | $99 | 25 | No |
| enterprise | Business | أعمال | $199 | Unlimited | Yes |

**Category-adjusted pricing:**
- Low-value (cleaning, gardening): 0.5×
- Mid-value (plumbing, electrical): 1.0×
- High-value (HVAC, mechanic): 1.5×

**Annual billing:** 9 months paid for 12 months (25% discount).

**Trial period:** 30 days free on any plan.

---

## 11. Next steps this unlocks

- Per-category and emergency pricing are already resolvable — an admin can set them today.
- **Cash jobs** (§21): the snapshot is payment-method agnostic, so a cash settlement flow can invoice `platformFee` from the same record — and spend credits against it.
- **Lead pricing** (§7–§10): ✅ shipped — [lead-marketplace.md](lead-marketplace.md) prices each grade from THIS rule set (`FeeRuleSet.leadMarket`) and debits the platform credit ledger on purchase, so one versioned configuration governs the take rate and the marketplace together.
- **Lead rebate** (§11): ✅ shipped — a job whose lead was BOUGHT credits the lead's value back as a fee reduction on that job (`FeeRuleSet.leadMarket.rebate`), so the effective take rate on the work a lead wins falls by what the lead cost. Priced by `leadRebateFor`, applied inside the completion transaction, bounded by the fee, and recorded append-only per booking ([lead-marketplace.md §7](lead-marketplace.md)).
- **Referral config** (§12): ✅ shipped — `referrerBonus`, `inviteeBonus`, `monthlyCap`, `lifetimeCap` are part of the versioned rule set, admin-editable via the same panel.
- **Emergency / B2B pricing** (§13–§15): price those products through `priceJob` with a different rule set id, and every charge inherits the same snapshot + audit guarantees.
- **Promo code redemption** (§24): `promoCode` scoping and the credit ledger are live; the customer/worker-facing code entry + redemption accounting is the remaining half.

---

*Last updated: September 17, 2026*
