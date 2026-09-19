# WorkersArena — Business Model & Revenue Growth Plan

[← Back to docs index](README.md)

> Status: living document. Update whenever pricing, revenue streams, or the payments roadmap change (a companion to `docs/PRODUCT.md` §3 and `docs/PAYMENTS.md`).

---

## 1. Executive summary

WorkersArena is a **two-sided marketplace** for home & commercial services (profiles in EN/AR, **USD $** pricing, **Beirut** as the served city — see `docs/MULTI-COUNTRY-AND-QUALITY-PLAN.md` §2 for how a second country is added):

- **Supply side:** professional workers (plumbers, electricians, cleaners, AC technicians…) who list profiles, prices, certifications, working hours, and availability, and take **bookings** with quotes + optional deposits.
- **Demand side:** customers who search, browse, favorite, review, and book workers.
- **B2B side:** companies (builders, cleaning firms) who buy **advertising** across 8 formats.

**Today's revenue engine has multiple live streams:** worker subscription fees ($15–$199/month) that gate **visibility**, platform fees (4–12% take rate) on completed jobs, a lead marketplace ($5–$35 per lead), credit purchases, paid verification ($9–$19), featured/emergency add-ons ($9–$49), and a referral program. Advertising is now **purchasable end-to-end in demo mode** — `createCampaign` gates the campaign behind a hosted checkout and it only goes ACTIVE once the payment webhook confirms (`confirmCampaignPayment`, `docs/PAYMENTS.md` → ad-campaign purchases); connecting a real gateway is the remaining P0 step.

**The core thesis of this plan:** the biggest revenue upside is not raising subscription prices — it is (a) turning on **live payments** so the existing monetizable surfaces actually collect money, and (b) layering a **take rate on the booking marketplace** + **self-serve paid ads** on top of the subscription base. Order of magnitude: even a 5–8% platform fee on paid bookings plus paid campaign activation converts the two dormant revenue engines into recurring income.

---

## 2. Current business model (as implemented)

### 2.1 Worker subscriptions — the primary live revenue stream

Four tiers (USD/month, `PLAN_CATALOG` in `src/lib/data/subscription-plans.ts`; mirrored in `src/components/home/plans.tsx`):

| Plan | Price/mo | Annual (9mo) | Leads/mo | Key Perks |
|---|---|---|---|---|
| **Starter** | $15 | $135 | 3 | Profile, search listing |
| **Growth** | $39 | $351 | 10 | + Featured, verification |
| **Pro** | $99 | $891 | 25 | + Priority, analytics, emergency |
| **Business** | $199 | $1,791 | Unlimited | + reduced 4% platform fee, team mgmt |

**Category-adjusted pricing** — trades are classified by average job value:
- **Low-value** (cleaning, gardening, pest control): 0.5× multiplier → Starter $7.50/mo
- **Mid-value** (plumbing, electrical, carpentry): 1.0× multiplier → Starter $15/mo
- **High-value** (HVAC, satellite, mechanic): 1.5× multiplier → Starter $22.50/mo

**Phase 1 trial policy** — new workers receive 30 days on Starter/Growth, 14 days on Pro, and Business is an assisted trial by default. Eligibility is server-side and once per worker; a lapse never reopens a trial.

**Annual billing** — pay for 9 months, get 12 (25% discount, 3 months free).

Mechanics that make this model work:

- **Visibility gating (the "paywall"):** expired subscription → worker removed from public search (`filtersToWhere` excludes `EXPIRED` subs; demo `isSubscriptionActive`). Search visibility is the workers' #1 KPI, so expiry is a natural, high-converting upsell trigger.
- **Renewal nudges:** 7/3/1-day reminder notifications + cron engine (`src/lib/notifications/reminders.ts`), "expiring" status banner on the dashboard, and a renewal dialog (`renew-dialog.tsx`) that supports plan switching.
- **Invoicing:** every renewal mints an `INV-*` invoice shown on the worker dashboard.
- **Admin-editable:** all prices, quotas, and features configurable via `/admin/revenue-settings`.

**Observation:** this is a classic freemium-to-paid **"sell visibility"** model, comparable to Yelp-style lead-gen listings. ARPU is capped by what a solo worker will pay for visibility; the ceiling is low relative to transaction revenue.

### 2.2 Platform fee / take rate — the headline revenue lever

The fee engine stamps an **immutable snapshot** at accept-with-quote:

| Plan Tier | Rate | Min | Max |
|-----------|------|-----|-----|
| Free | 12% | $5 | $300 |
| Starter | 9% | $5 | $300 |
| Growth | 7% | $5 | $300 |
| Pro | 5% | $5 | $300 |
| Business | **4% reduced rate** | $5 | $300 |

- Applied at **accept-with-quote** (immutable snapshot)
- Collected at **booking completion**
- Admin can set per-category, per-promotion overrides
- Fee snapshot is auditable (`PlatformFeeSnapshot` model)

### 2.3 Lead marketplace — qualified leads as a product

Customer requests are **graded** (bronze/silver/gold/emergency) and offered to a few matching workers:

| Grade | Price | Trigger |
|-------|-------|---------|
| **Bronze** | 5 credits ($5) | Basic info, no email |
| **Silver** | 9 credits ($9) | Email + category + location |
| **Gold** | 20 credits ($20) | Full profile + photos + signed in |
| **Emergency** | 35 credits ($35) | 24/7 urgent request |

**Matching engine**: weighted scoring (trade 30%, area 12%, city 8%, rating 12%, reviews 6%, response rate 10%, availability 8%, plan tier 6%, emergency 5%, verified 3%)

**Ownership**: exclusive by default (buying revokes rivals), capped at `maxWorkersPerLead`, time-based expiry

**Contact reveal**: hidden → masked → revealed (based on purchase status and plan tier)

**Quality feedback loop**: workers rate leads 1–5 stars → feeds back into per-grade pricing multipliers (0.8×–1.2×) and matching weights

**Lead rebate**: when a bought lead converts to a completed job, the lead's cost is rebated against the platform fee

### 2.4 Credit system — workers buy credits to purchase leads

| Package | Credits | Price | Bonus | Total |
|---------|---------|-------|-------|-------|
| Starter | 10 | $10 | 0 | 10 |
| Popular | 25 | $25 | 5 | 30 |
| Professional | 50 | $50 | 15 | 65 |
| Enterprise | 100 | $100 | 30 | 130 |

- **Payment**: OMT/Whish manual rails (admin confirms → credits granted)
- **Stripe**: planned but not yet connected
- Base credits are priced transparently at $1 each; bonus credits are promotional and displayed separately. Credits are consumed when buying leads.

### 2.5 Lead-quality protection and refunds (Phase 1)

Workers can submit one refund request per purchased lead for invalid contact details, duplicate lead, wrong category/area, customer did not request the service, or unreachable customer. Admins review evidence and approve a full or partial credit refund. Decisions append an adjustment entry to the credit ledger; the original spend is never edited or deleted, and duplicate requests are rejected.

### 2.6 Paid verification — trust as a product

| Tier | Price | What's included |
|------|-------|----------------|
| **Basic** | $9 | ID check only |
| **Professional** | $19 | License + background check |

- 12-month validity
- Badge in search results
- Admin confirms payment → flips `verified` flag

### 2.7 Featured / emergency add-ons

| Add-on | Price | What's included |
|--------|-------|----------------|
| **Featured slot** | $49/category/mo | Homepage featured placement |
| **Emergency marker** | $9/mo | 24/7 urgent job availability |

### 2.8 Referral program — viral growth

- **Referrer bonus**: 25 credits per successful referral
- **Invitee bonus**: 10 credits on signup
- **Monthly cap**: 10 referrals/month
- **Qualifying action**: invitee must complete first booking
- Configurable via `FeeRuleSet.referral` (admin-editable)

### 2.9 Company advertising — built but not monetized

- Campaign builder + company dashboard (impressions / clicks / CTR / budget / spent), 8 ad types (banner, slider, featured card, sponsored search, sponsored category, popup, native, video), placement/category/city targeting, rotation, impression + click tracking (`/api/ads/[id]/click`).
- The demo spend model is effectively **~$10 CPM + $1/click**: `recordImpression` burns $0.01/impression, `recordClick` burns $1/click (`src/lib/data/repo.ts`).
- Campaign creation mints a PENDING advertising invoice (`INV-*`, scope `advertising`) **and** a PENDING payment, then redirects the company to a hosted checkout; the campaign stays **PENDING** (never serves ads — `getActiveAdsFor` only matches ACTIVE) until the webhook flips it to ACTIVE and the invoice to paid (`createCampaign` / `confirmCampaignPayment` in `src/lib/data/campaigns.ts`). With the simulated provider this is a two-click demo; real money needs the P0 gateway.

**Observation:** the purchase gate now exists in code (demo/simulated); the ad product is one P0 step ("live payments") away from collecting real money. The unit model already exists.

### 2.9 Bookings & deposits — full payment rails, zero take rate (partially addressed)

- Customers request bookings on AVAILABLE slots; workers accept with a **quote** and optional **deposit**; PENDING_PAYMENT → checkout (Stripe / simulated / PayPal / MyFatoorah / bank-transfer / cash per `docs/PAYMENTS.md`) → webhook → CONFIRMED + PAID.
- M4 policy: refunds with a 24h cancellation-policy window; `WA-YYYY-NNNNN` invoices for signed-in customers.
- **Platform fee is now charged** (4–12% depending on plan tier) — the marketplace takes a cut on every completed job.

### 2.10 Supporting monetizable surfaces (now monetized)

- **Leads** — sold per grade (5–35 credits) with quality feedback loop.
- **Verification** — paid tiers ($9 basic, $19 professional) via OMT/Whish.
- **Featured workers** section on the homepage (`getFeaturedWorkers`) — purchasable add-on ($49/category/mo).
- **Emergency marker** — purchasable per-month add-on ($9/mo).
- **Favorites, reviews, analytics** — free (retention tools).
- **Worker ROI dashboard** — shows marketplace spend efficiency.
- **Earnings statement** — monthly breakdown of fees, rebates, net earnings.
- **Lead quality analytics** — admin dashboard for rating trends.
- **Smart pricing** — dynamic lead multipliers based on demand/holidays.
- **Portfolio builder** — workers showcase completed jobs with photos.
- **Mobile app** — camera proof-of-work, share sheet, local notifications, onboarding.

---

## 3. Unit economics sketch (illustrative)

| Levers | Today | With plan |
|---|---|---|
| Paying workers | subscription renewals | same + upgrades |
| ARPU (worker) | $15–199/mo (mix ≈ $40–60) | +10–20% via annual/upsell |
| Ads revenue | **$0** (no live purchase) | budget × activation rate |
| Booking take rate | **4–12%** of job value | same + category overrides |
| Lead marketplace | **$5–35/lead** | + smart pricing multipliers |
| Live payment readiness | P0 pending (Stripe) | prerequisite for card payments |

The "Stripe pending" row is the plan's remaining gap: subscriptions, credits, and ad campaigns all run on OMT/Whish manual rails; collecting real card money needs the P0 gateway.

---

## 4. Gaps & weaknesses (why revenue is under-leveraged)

1. **No live payments** (`docs/PRODUCT.md` §3.1 P0) — subscriptions, ads, and deposits all run on OMT/Whish manual admin-confirmed rails. Until a real gateway collects money, every other improvement requires manual admin work.
2. **Ads purchasable in demo, not live** — the checkout gate is wired (create → pay → ACTIVE via webhook) but runs on the simulated provider; collecting real money needs the P0 gateway, and there is still no budget pacing, CPM/CPC tiers, or auction.
3. **No escrow** — the platform routes deposits but doesn't hold them for completion milestones (larger jobs), missing both a trust feature and a margin/float opportunity.
4. **Single payment method** — OMT/Whish only; card-paying customers/workers in Lebanon and the broader MENA region are underserved.

---

## 5. Revenue improvement roadmap

### 5.1 Quick wins (0–1 month) — shipped on the Lebanon OMT/Whish manual rails (no Stripe)

> **Status: all quick wins are implemented** — the Lebanon-first launch collects them through the **OMT / Whish MANUAL methods** (no gateway keys): the purchase mints a signed `/payments/manual` instructions page, the worker pays an OMT agent / Whish app with the reference, and an **admin confirms receipt** from the `/admin` pending-payments card, which activates the capability (docs/PAYMENTS.md → "Lebanon launch").

- ✅ **Annual billing** — yearly plans at 3-months-free (annual = 9 paid months for 12) via `renewSubscriptionAction` (`period` param + plan picker in the renew dialog). *Impact: +25% ARPU, better cash flow, lower churn.*
- ✅ **Category-adjusted pricing** — low-value trades pay 0.5×, high-value pay 1.5×. *Impact: lower barrier for cleaning/gardening, higher ARPU from HVAC/mechanic.*
- ✅ **Plan-specific free trials** — Starter/Growth 30 days, Pro 14 days, and Business assisted by default. *Impact: reduces conversion friction while protecting high-value access.*
- ✅ **Paid plan-upgrade prompts** — the worker dashboard's **upgrade dialog** (`src/components/dashboard/upgrade-dialog.tsx`) offers verification tiers, the Featured slot, and the Emergency marker inline, with the OMT/Whish method picker.
- ✅ **Sell featured-worker slots** — `isFeatured` is a purchasable monthly add-on ($49/category/mo): `purchaseUpgradeAction` (worker) → pending manual payment → admin `confirmManualPaymentAction` flips the flag.
- ✅ **À la carte emergency marker** — the "emergency" flag is a purchasable per-month add-on ($9/mo) through the same purchase rail.
- ✅ **Paid verification tiers** — Basic (ID check, $9) / Professional (license + background check, $19), 12-month validity, badge in search.
- ✅ **Credit purchases** — workers can buy platform credits through OMT/Whish to fund lead purchases.
- ✅ **Lead marketplace** — qualified leads with grading, matching, exclusivity, contact reveal, and quality feedback loop.
- ✅ **Platform fee (take rate)** — 4–12% on every completed job, with immutable snapshots.
- ✅ **Lead rebates** — when a bought lead converts, the lead's cost is rebated against the platform fee.
- ✅ **Referral program** — 25 credits for referrer, 10 for invitee, configurable via admin.
- ✅ **Smart pricing** — dynamic lead multipliers based on demand, holidays, rush hour.
- ✅ **Worker ROI dashboard** — leads bought, jobs won, GMV, fees, subscription cost, multiple.
- ✅ **Earnings statement** — monthly breakdown of completed jobs, fees, rebates, net payouts.
- ✅ **Lead quality analytics** — admin dashboard for rating trends and conversion rates.
- ✅ **Portfolio builder** — workers showcase completed jobs with before/after photos.

### 5.2 Medium term (1–3 months) — requires the P0 payments wave

- **Live payments end-to-end (P0, prerequisite)** — Stripe first (subscription auto-renew via Stripe billing, ad campaign prepayment, booking deposits), then MyFatoorah/Tap/STC Pay for the MENA consumer base. *Impact: unlocks every row below.* **Lebanon-first note:** the launch country already collects on the **OMT/Whish manual rails** (deposits, campaign prepayment, renewals, and the §5.1 upgrades — admin-confirmed, no gateway keys); Stripe/MENA gateways remain the scale play for card-paying markets.
- **Deposit as escrow for large jobs** — hold the deposit until job completion (the M4 `transitionBooking(completed)` already exists); release on completion, refund per policy otherwise. Sell "protected payment" as a trust feature; collect the platform fee at release. *Impact: trust-led conversion + take rate on larger jobs.*
- **Self-serve paid ads** — campaign creation requires prepayment: budget → checkout → webhook activates the campaign (status flips `paused`→`active`); add CPM/CPC tiers and a minimum budget; keep the existing $10 CPM/$1 CPC model as the default tier. The checkout now accepts OMT/Whish (the company's "Pay now" picker) with admin-confirmed activation as the manual twin of the webhook. *Impact: second B2B revenue stream.*

### 5.3 Strategic (3–12 months) — growth & differentiation

- **Pay-at-completion / milestone payments** — for jobs > threshold, hold a % until completion with photo/checklist verification; platform fee at milestone release. *Impact: raises average job value and take rate.*
- **Priority emergency dispatch** — paid "reach me in 30 min" placement (the 24/7 emergency marker pattern) with push notifications to top-rated nearby workers. *Impact: premium B2C product; high willingness-to-pay.*
- **Company CRM / lead-gen subscription** — recurring seats for companies with lead routing, campaign pacing alerts, and market-pricing insights (anonymized rate reports per city/category). *Impact: B2B ARR with expansion revenue.*
- **Referral & loyalty** — worker referral credits (month free) and customer booking loyalty (fee discount after N jobs) to compound both sides of the network. *Impact: CAC reduction, retention.*
- **More locales/cities** — Urdu/Hindi/Filipino/French (schema already locale-paired) to grow the supply pool; new cities unlock new featured-slot and lead inventory. *Impact: TAM expansion.*
- **Mobile monetization** (`docs/mobile-architecture.md`) — push-driven emergency dispatch + in-app payment friction is where high-frequency consumers transact; the PWA→Capacitor path already exists. *Impact: conversion on the highest-intent channel.*

### 5.4 KPI dashboard to run the model

- GMV (booking value settled per month), take rate, platform-fee revenue.
- Subscription: MRR, ARPU, renewal rate (7/3/1-day reminder → renewal lift), plan-mix share.
- Ads: activated campaigns, spend pacing vs budget, CPM/CPC realized, ad-attributed signups.
- Marketplace health: leads→booking conversion, deposit acceptance rate, cancellation rate (refund exposure), completed-job rate, NPS/rating.

---

## 6. Risks & considerations

- **Price sensitivity on supply side** — informal workers are cost-sensitive; keep Starter cheap and let visibility + booking volume justify upgrades. A take rate must be offset by demonstrable booking volume (advertise "jobs, not just views").
- **Regulatory (MENA)** — VAT on platform fees and subscriptions (Saudi 15%, UAE 5%); escrow/money-holding rules if deposits are held (partner with a licensed payment facilitator or hold via the gateway, not the platform's own account).
- **Refund exposure** — the 24h cancellation-policy window already protects the worker's deposit; the platform fee should be refundable with the booking to avoid customer backlash, or charged only at completion.
- **Payment method mix** — cash-on-delivery remains dominant in the region; "cash booking" should still carry a platform fee (collected digitally after the job, e.g., wallet/card top-up) or a reduced fee, otherwise take rate misses most transactions.
- **Two-sided cold start** — monetization levers must not tax the demand side early; customers should stay free so the network effect compounds (fee is charged to supply/companies, not bookers).

---

## 7. Implementation map (what exists vs. what's needed)

| Capability | Code exists | Live payments | Notes |
|---|---|---|---|
| Worker subscription + renewal | ✅ `subscriptions.ts`, `renew-dialog.tsx` | ✅ OMT/Whish manual | annual = 9 for 12, admin-confirmed |
| Subscription reminders | ✅ `reminders.ts` + cron | — | |
| Ads: builder, rotation, tracking | ✅ `campaign-builder.tsx`, `repo.ts` | ✅ OMT/Whish manual | prepayment = activation gate |
| Booking deposit/quote payment | ✅ M3 seam + `PAYMENTS.md` | ✅ OMT/Whish manual | take-rate fee = new field + calculator |
| Booking refunds (policy) | ✅ M4 `bookingCancelRefundDue` | ✅ (simulated / manual) | refunds route through the paying provider |
| Invoices (sub/ad/booking) | ✅ `Invoice` model | ✅ (manual rails) | |
| Featured / emergency sell | ✅ `purchases.ts` + upgrade dialog | ✅ OMT/Whish manual | purchasable add-ons, admin-confirmed |
| Verification tiers | ✅ `purchases.ts` + admin card | ✅ OMT/Whish manual | paid ladder live |
| Credit purchases | ✅ `credit-balance.tsx` + OMT/Whish | ✅ OMT/Whish manual | workers buy credits to fund leads |
| Lead marketplace | ✅ `lead-market.ts` + board | ✅ OMT/Whish manual | grading, matching, exclusivity, reveal |
| Lead rebates | ✅ `lead-rebate.ts` | ✅ (on completion) | loyalty loop: lead cost → fee reduction |
| Platform fee (take rate) | ✅ `fee-rules.ts` + snapshots | ✅ (on completion) | 4–12% per plan tier, immutable |
| Referral program | ✅ `referral.ts` + card | ✅ (credits) | 25 referrer / 10 invitee credits |
| Smart pricing | ✅ `smart-pricing.ts` | — | demand/holiday/seasonal multipliers |
| Worker ROI dashboard | ✅ `worker-roi.ts` + page | — | spend efficiency visibility |
| Earnings statement | ✅ `earnings.ts` + page | — | monthly fee/rebate/earnings breakdown |
| Lead quality analytics | ✅ `lead-quality-analytics.ts` | — | admin rating trends dashboard |
| Portfolio builder | ✅ `portfolio-manager.tsx` | — | before/after project photos |
| Mobile app | ✅ `mobile-architecture.md` | ✅ | Capacitor, push, camera, share |
| **Lebanon launch (OMT/Whish)** | ✅ providers + `/payments/manual` + admin queue | ✅ | service country (Beirut, USD) + manual rails |
| **Stripe integration** | ⚠️ not connected | ❌ | prerequisite for card payments |
| Mobile app monetization | ✅ `mobile-architecture.md` | 🔜 | dispatch + in-app pay |

**Recommended sequencing (updated for the Lebanon launch):** the revenue quick wins — annual plans, category pricing, trial, featured/emergency SKUs, paid verification, credit purchases, lead marketplace, take rate, rebates, referrals — **shipped first on the OMT/Whish manual rails** (steps 4–5 above, now live without a gateway). Remaining: 1) Stripe/MENA gateways for card markets → 2) escrow for large jobs → 3) company advertising self-serve → 4) strategic bets (dispatch, B2B seats, milestone payments).

---

*Last updated: September 17, 2026*
