# WorkersArena — Business Model & Revenue Growth Plan

[← Back to docs index](README.md)

> Status: living document. Update whenever pricing, revenue streams, or the payments roadmap change (a companion to `docs/PRODUCT.md` §3 and `docs/PAYMENTS.md`).

---

## 1. Executive summary

WorkersArena is a **two-sided marketplace** for home & commercial services in the MENA region (profiles in EN/AR, SAR/AED/USD, cities like Riyadh, Jeddah, Dubai):

- **Supply side:** professional workers (plumbers, electricians, cleaners, AC technicians…) who list profiles, prices, certifications, working hours, and availability, and take **bookings** with quotes + optional deposits.
- **Demand side:** customers who search, browse, favorite, review, and book workers.
- **B2B side:** companies (builders, cleaning firms) who buy **advertising** across 8 formats.

**Today's revenue engine is a single live stream:** worker subscription fees ($29–$299/month) that gate **visibility** — an expired subscription makes a worker invisible to public search (`isSubscriptionActive` in `src/lib/data/subscriptions.ts`). Advertising is now **purchasable end-to-end in demo mode** — `createCampaign` gates the campaign behind a hosted checkout and it only goes ACTIVE once the payment webhook confirms (`confirmCampaignPayment`, `docs/PAYMENTS.md` → ad-campaign purchases); connecting a real gateway is the remaining P0 step. Bookings have full payment infrastructure (deposits, checkout, webhooks, refunds, invoices) but **no platform fee is charged** — the marketplace transacts value without taking a cut.

**The core thesis of this plan:** the biggest revenue upside is not raising subscription prices — it is (a) turning on **live payments** so the existing monetizable surfaces actually collect money, and (b) layering a **take rate on the booking marketplace** + **self-serve paid ads** on top of the subscription base. Order of magnitude: even a 5–8% platform fee on paid bookings plus paid campaign activation converts the two dormant revenue engines into recurring income.

---

## 2. Current business model (as implemented)

### 2.1 Worker subscriptions — the only live revenue stream

Four tiers (USD/month, `PLANS` in `src/lib/data/subscriptions.ts`; mirrored in `src/components/home/plans.tsx`):

| Plan | Price/mo | Features |
|---|---|---|
| Basic | $29 | listing, leads |
| Professional | $59 | + boost, verified badge *(marked "popular")* |
| Premium | $119 | + analytics, gallery |
| Enterprise | $299 | + emergency marker, priority support, ads |

Mechanics that make this model work:

- **Visibility gating (the "paywall"):** expired subscription → worker removed from public search (`filtersToWhere` excludes `EXPIRED` subs; demo `isSubscriptionActive`). Search visibility is the workers' #1 KPI, so expiry is a natural, high-converting upsell trigger.
- **Renewal nudges:** 7/3/1-day reminder notifications + cron engine (`src/lib/notifications/reminders.ts`), "expiring" status banner on the dashboard, and a renewal dialog (`renew-dialog.tsx`) that supports plan switching.
- **Invoicing:** every renewal mints an `INV-*` invoice shown on the worker dashboard.

**Observation:** this is a classic freemium-to-paid **"sell visibility"** model, comparable to Yelp/decorilla-style lead-gen listings. ARPU is capped by what a solo worker will pay for visibility; the ceiling is low relative to transaction revenue.

### 2.2 Company advertising — built but not monetized

- Campaign builder + company dashboard (impressions / clicks / CTR / budget / spent), 8 ad types (banner, slider, featured card, sponsored search, sponsored category, popup, native, video), placement/category/city targeting, rotation, impression + click tracking (`/api/ads/[id]/click`).
- The demo spend model is effectively **~$10 CPM + $1/click**: `recordImpression` burns $0.01/impression, `recordClick` burns $1/click (`src/lib/data/repo.ts`).
- Campaign creation mints a PENDING advertising invoice (`INV-*`, scope `advertising`) **and** a PENDING payment, then redirects the company to a hosted checkout; the campaign stays **PENDING** (never serves ads — `getActiveAdsFor` only matches ACTIVE) until the webhook flips it to ACTIVE and the invoice to paid (`createCampaign` / `confirmCampaignPayment` in `src/lib/data/campaigns.ts`). With the simulated provider this is a two-click demo; real money needs the P0 gateway.

**Observation:** the purchase gate now exists in code (demo/simulated); the ad product is one P0 step ("live payments") away from collecting real money. The unit model already exists.

### 2.3 Bookings & deposits — full payment rails, zero take rate

- Customers request bookings on AVAILABLE slots; workers accept with a **quote** and optional **deposit**; PENDING_PAYMENT → checkout (Stripe / simulated / PayPal / MyFatoorah / bank-transfer / cash per `docs/PAYMENTS.md`) → webhook → CONFIRMED + PAID.
- M4 policy: refunds with a 24h cancellation-policy window; `WA-YYYY-NNNNN` invoices for signed-in customers.
- **No platform fee, no commission, no escrow margin** anywhere in the flow (there is no `commission`/`fee`/`take rate` concept in the codebase).

**Observation:** this is the largest unmet opportunity. The marketplace already routes real (or simulated) money for deposits and quotes; adding a platform fee at accept/confirm is a data-model + one calculator change, and it converts the app from "directory with subscriptions" to a **transactional marketplace**.

### 2.4 Supporting monetizable surfaces (currently free)

- **Leads** — included in every plan; not metered or sold.
- **Verification** — free badge via admin review queue; no paid tiers.
- **Featured workers** section on the homepage (`getFeaturedWorkers`) — data flag, not a purchasable slot.
- **Emergency marker** — Enterprise-only feature flag, not sold as a la carte.
- **Favorites, reviews, analytics** — free.

---

## 3. Unit economics sketch (illustrative)

| Levers | Today | With plan |
|---|---|---|
| Paying workers | subscription renewals | same + upgrades |
| ARPU (worker) | $29–299/mo (mix ≈ $60–80) | +10–20% via annual/upsell |
| Ads revenue | **$0** (no live purchase) | budget × activation rate |
| Booking take rate | **$0** | 5–10% of job value |
| Live payment readiness | P0 pending | prerequisite for all of the above |

The two "zero" rows are the plan's headline: they are both fully scaffolded in code and blocked only by **live payments** (P0).

---

## 4. Gaps & weaknesses (why revenue is under-leveraged)

1. **No live payments** (`docs/PRODUCT.md` §3.1 P0) — subscriptions, ads, and deposits all run simulated/demo. Until a real gateway collects money, every other improvement is theoretical.
2. **No take rate** — the marketplace settles bookings free of charge; the platform monetizes only the lead, not the transaction.
3. **Ads purchasable in demo, not live** — the checkout gate is wired (create → pay → ACTIVE via webhook) but runs on the simulated provider; collecting real money needs the P0 gateway, and there is still no budget pacing, CPM/CPC tiers, or auction.
4. **Single revenue stream** — 100% of revenue depends on worker subscription willingness-to-pay; susceptible to churn and price sensitivity in the informal-services labor market.
5. **No annual plans** — monthly-only billing leaves ARPU and prepaid cash flow on the table.
6. **Leads are unbundled** — free leads are a subsidy; in the industry, qualified service leads are the highest-value unit companies pay for.
7. **Trust/verification not monetized** — a paid verification ladder (ID, license, background check) is a natural high-margin product in the region (migrant-worker trust gap).
8. **Deposits are not escrow** — the platform routes deposits but doesn't hold them for completion milestones (larger jobs), missing both a trust feature and a margin/float opportunity.

---

## 5. Revenue improvement roadmap

### 5.1 Quick wins (0–1 month) — no new payment rails required

- **Annual billing** — add yearly plans at ~2-months-free (e.g., $290/yr Pro vs 12×$59) via the existing renewal action; extend `renewSubscriptionAction` + plans UI. *Impact: +10–15% ARPU, better cash flow, lower churn.*
- **Paid plan-upgrade prompts at the exact moment of pain** — the "expired → hidden from search" event already exists; add an upgrade modal when a worker hits lead/boost/analytics limits. *Impact: conversion lift on the existing funnel.*
- **Sell featured-worker slots** — expose `isFeatured` as a purchasable monthly add-on per category/city with a price (e.g., $49/category/mo), reusing the subscription billing path. *Impact: new SKU, zero new infra.*
- **La carte emergency marker** — sell the Enterprise "emergency" flag as a per-month add-on. *Impact: incremental ARPU from mid-tier workers.*

### 5.2 Medium term (1–3 months) — requires the P0 payments wave

- **Live payments end-to-end (P0, prerequisite)** — Stripe first (subscription auto-renew via Stripe billing, ad campaign prepayment, booking deposits), then MyFatoorah/Tap/STC Pay for the MENA consumer base. *Impact: unlocks every row below.*
- **Booking take rate (the headline lever)** — add a `platformFee` (percent + minimum, e.g., 5–8% or SAR 10 floor) applied at **accept-with-quote** and collected at confirm; split-amount presentation ("you receive X, platform fee Y") in the customer + worker UIs; fee waived/absorbed on enterprise subscription (a tier perk). Add the field to `Booking` + invoice line item. *Impact: recurring % of GMV — the single largest new stream.*
- **Deposit as escrow for large jobs** — hold the deposit until job completion (the M4 `transitionBooking(completed)` already exists); release on completion, refund per policy otherwise. Sell "protected payment" as a trust feature; collect the platform fee at release. *Impact: trust-led conversion + take rate on larger jobs.*
- **Self-serve paid ads** — campaign creation requires prepayment: budget → checkout → webhook activates the campaign (status flips `paused`→`active`); add CPM/CPC tiers and a minimum budget; keep the existing $10 CPM/$1 CPC model as the default tier. *Impact: second B2B revenue stream.*
- **Paid verification tiers** — Basic (ID check) / Professional (license + background check) with a badge in search; price ~$9–19/check, valid 12 months; admin queue already exists. *Impact: high-margin trust product; raises conversion of premium subs.*

### 5.3 Strategic (3–12 months) — growth & differentiation

- **Leads marketplace** — metered lead credits for companies + workers on free/basic tiers (e.g., $5–15 per qualified lead with city/category match); the contact-card reveal is the enforcement point. *Impact: monetizes demand directly; strong in MENA where phone leads are the currency.*
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

- **Price sensitivity on supply side** — informal workers are cost-sensitive; keep Basic cheap and let visibility + booking volume justify upgrades. A take rate must be offset by demonstrable booking volume (advertise "jobs, not just views").
- **Regulatory (MENA)** — VAT on platform fees and subscriptions (Saudi 15%, UAE 5%); escrow/money-holding rules if deposits are held (partner with a licensed payment facilitator or hold via the gateway, not the platform's own account).
- **Refund exposure** — the 24h cancellation-policy window already protects the worker's deposit; the platform fee should be refundable with the booking to avoid customer backlash, or charged only at completion.
- **Payment method mix** — cash-on-delivery remains dominant in the region; "cash booking" should still carry a platform fee (collected digitally after the job, e.g., wallet/card top-up) or a reduced fee, otherwise take rate misses most transactions.
- **Two-sided cold start** — monetization levers must not tax the demand side early; customers should stay free so the network effect compounds (fee is charged to supply/companies, not bookers).

---

## 7. Implementation map (what exists vs. what's needed)

| Capability | Code exists | Live payments | Notes |
|---|---|---|---|
| Worker subscription + renewal | ✅ `subscriptions.ts`, `renew-dialog.tsx` | 🔜 P0 | annual plans = config + UI |
| Subscription reminders | ✅ `reminders.ts` + cron | — | |
| Ads: builder, rotation, tracking | ✅ `campaign-builder.tsx`, `repo.ts` | 🔜 P0 | prepayment = campaign activation gate |
| Booking deposit/quote payment | ✅ M3 seam + `PAYMENTS.md` | 🔜 P0 | take-rate fee = new field + calculator |
| Booking refunds (policy) | ✅ M4 `bookingCancelRefundDue` | ✅ (simulated) | |
| Invoices (sub/ad/booking) | ✅ `Invoice` model | 🔜 P0 | |
| Featured / emergency sell | ✅ data flags | — | purchasable add-ons = new SKUs |
| Verification tiers | ✅ admin queue | — | paid ladder = new pricing |
| Leads metering | ⚠️ leads exist, no credits | — | credits engine needed |
| Mobile app monetization | ✅ `mobile-architecture.md` | 🔜 | dispatch + in-app pay |

**Recommended sequencing:** 1) P0 live payments → 2) booking take rate (headline) → 3) self-serve paid ads → 4) annual plans + featured/emergency SKUs (quick wins, can ship in parallel with 1) → 5) verification tiers + leads marketplace → 6) strategic bets (escrow, dispatch, B2B seats).
