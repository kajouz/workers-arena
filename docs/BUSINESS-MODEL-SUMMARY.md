# WorkersArena — Business Model, Revenue & Improvement Plan

> Last updated: September 17, 2026

---

## 1. Existing Business Model

WorkersArena is a **bilingual Arabic RTL / English LTR** local-services marketplace focused on **Beirut, Lebanon**, using **USD** as the primary currency. It connects customers seeking services with workers/professionals, companies, and suppliers.

### Revenue Architecture (Current State)

| # | Revenue Stream | Status | Monthly Potential |
|---|---------------|--------|-------------------|
| 1 | **Worker Subscriptions** | ✅ Live | $15–$199/worker |
| 2 | **Platform Fee (Take Rate)** | ✅ Built & wired | 4–12% of booking GMV |
| 3 | **Lead Marketplace** | ✅ Built & wired | $5–$35 per lead |
| 4 | **Credit Purchases (Lead Credits)** | ✅ Built, OMT/Whish only | $10–$100 per package |
| 5 | **Company Advertising** | ⚠️ Built, needs gateway | $100–$5,000/campaign |
| 6 | **Lead Rebates** | ✅ Built (loyalty loop) | Reduces fee by lead cost |
| 7 | **Promotions Engine** | ✅ Built | Campaign-driven credit bonuses |
| 8 | **Paid Verification** | ✅ Built, OMT/Whish only | $9–$19/worker |
| 9 | **Featured / Emergency Add-ons** | ✅ Built, OMT/Whish only | $9–$49/worker |
| 10 | **Referral Program** | ✅ Built | 25 referrer + 10 invitee credits |
| 11 | **Worker ROI Dashboard** | ✅ Built | Visibility tool |
| 12 | **Earnings Statement** | ✅ Built | Worker financial transparency |
| 13 | **Lead Quality Analytics** | ✅ Built | Admin feedback loop |
| 14 | **Smart Pricing** | ✅ Built | Demand-based lead multipliers |

---

## 2. Detailed Revenue Streams

### 2.1 Worker Subscriptions (LIVE — the only cash-collecting stream)

Four tiers, USD/month (admin-editable via plan catalog):

| Plan | Monthly | Annual (9mo) | Key Perks |
|------|---------|-------------|-----------|
| **Starter** | $15 | $135 | Profile, search listing, 3 leads/mo |
| **Growth** | $39 | $351 | + Featured placement, 10 leads/mo, verification |
| **Pro** | $99 | $891 | + Priority matching, analytics, 25 leads/mo, emergency |
| **Business** | $199 | $1,791 | + Fee exemption, unlimited leads, team management |

**Category-adjusted pricing** — trades are classified by average job value:
- **Low-value** (cleaning, gardening, pest control): 0.5× multiplier → Starter $7.50/mo
- **Mid-value** (plumbing, electrical, carpentry): 1.0× multiplier → Starter $15/mo
- **High-value** (HVAC, satellite, mechanic): 1.5× multiplier → Starter $22.50/mo

**30-day free trial** — new workers get their first month free on any plan. The trial is auto-applied during onboarding.

**Annual billing** — pay for 9 months, get 12 (25% discount, 3 months free).

- **Visibility gating**: expired subscription → worker removed from public search
- **Payment methods**: OMT/Whish manual (admin-confirmed) + Stripe (planned)
- **Renewal reminders**: 7d, 3d, 1d before expiry
- **Admin-editable**: plan prices, lead quotas, features, and category multipliers are all configurable via `/admin/revenue-settings`

### 2.2 Platform Fee / Take Rate (BUILT — collects on every completed job)

The fee engine stamps an **immutable snapshot** at accept-with-quote:

| Plan Tier | Rate | Min | Max |
|-----------|------|-----|-----|
| Free | 12% | $5 | $300 |
| Starter | 9% | $5 | $300 |
| Growth | 7% | $5 | $300 |
| Pro | 5% | $5 | $300 |
| Business | 4% (or exempt) | $5 | $300 |

- Applied at **accept-with-quote** (immutable snapshot)
- Collected at **booking completion**
- Enterprise plans can be set fully exempt
- Admin can set per-category, per-promotion overrides
- Fee snapshot is auditable (`PlatformFeeSnapshot` model)

### 2.3 Lead Marketplace (BUILT — workers buy qualified leads)

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

**Feedback loop** (§12): workers rate leads 1–5 stars → feeds back into:
- Per-grade pricing multipliers (low quality → 0.8× discount, high quality → 1.2× surcharge)
- Matching weight adjustments (quality signal influences candidate ranking)

### 2.4 Lead Rebates (BUILT — loyalty loop)

When a bought lead converts to a completed job:
- The lead's cost is **rebated against the platform fee**
- `rebate = min(fee × pctBps/10000, lead cost, ceiling)`
- Recorded in `LeadRebate` model (append-only, auditable)
- Shown on worker booking row and lead board

### 2.5 Credit System (BUILT — workers buy credits to purchase leads)

| Package | Credits | Price | Bonus | Total |
|---------|---------|-------|-------|-------|
| Starter | 10 | $25 | 0 | 10 |
| Popular | 25 | $50 | 5 | 30 |
| Professional | 50 | $90 | 15 | 65 |
| Enterprise | 100 | $150 | 30 | 130 |

- **Payment**: OMT/Whish manual rails (admin confirms → credits granted)
- **Stripe**: planned but not yet connected
- Credits are consumed when buying leads (1 credit = $1)
- Admin can adjust credit packages via `/admin/revenue-settings`

### 2.6 Company Advertising (BUILT — not yet monetized)

- Campaign creation with budget, targeting (city/category), and creative
- CPM/CPC pricing ($10 CPM, $1 CPC in demo)
- Payment infrastructure exists (checkout → webhook → activate)
- **Missing**: real gateway connection (Stripe/OMT for companies)

### 2.7 Paid Verification (BUILT — OMT/Whish only)

| Tier | Price | What's included |
|------|-------|----------------|
| **Basic** | $9 | ID check only |
| **Professional** | $19 | License + background check |

- 12-month validity
- Badge in search results
- Admin confirms payment → flips `verified` flag

### 2.8 Featured / Emergency Add-ons (BUILT — OMT/Whish only)

| Add-on | Price | What's included |
|--------|-------|----------------|
| **Featured slot** | $49/category/mo | Homepage featured placement |
| **Emergency marker** | $9/mo | 24/7 urgent job availability |

### 2.9 Referral Program (BUILT)

- **Referrer bonus**: 25 credits per successful referral
- **Invitee bonus**: 10 credits on signup
- **Monthly cap**: 10 referrals/month
- **Lifetime cap**: unlimited
- **Qualifying action**: invitee must complete first booking
- Configurable via `FeeRuleSet.referral` (admin-editable)

### 2.10 Worker ROI Dashboard (BUILT)

Shows per-month: leads bought, quotes sent, jobs won, GMV, platform fees, subscription cost, total marketplace spend, and the resulting multiple.

### 2.11 Earnings Statement (BUILT)

Monthly breakdown: completed jobs, GMV, fees, rebates, net earnings, per-job detail.

### 2.12 Lead Quality Analytics (BUILT)

Admin dashboard: weekly trends, per-grade stats, conversion rates, price multiplier impact.

### 2.13 Smart Pricing (BUILT)

Dynamic lead price multiplier based on:
- **Rush hour** (6–9 AM, 5–8 PM): +15%
- **Weekend** (Sat–Sun): +10–20%
- **Seasonal** (AC in summer +25%, plumbing in winter +15%)
- **Holidays** (Ramadan, Eid, Christmas): +30–35%
- **Supply/demand ratio**: adjusts based on available workers vs. pending leads
- **Clamped** to [0.7, 2.0] range

---

## 3. Worker Revenue Model

### How Workers Earn

```
Customer books job → Worker accepts with quote → Job completes
                                                    ↓
                                          Platform fee deducted (4–12%)
                                          Lead rebate applied (if bought lead)
                                          Net earnings = GMV − effective fee
                                          Withdrawal to OMT/Whish
```

### Revenue Per Worker Per Month (Estimated)

| Metric | Starter | Growth | Pro |
|--------|---------|--------|-----|
| Avg jobs/month | 5 | 12 | 25 |
| Avg job value | $80 | $150 | $200 |
| GMV | $400 | $1,800 | $5,000 |
| Platform fee (9%/7%/5%) | $36 | $126 | $250 |
| Subscription cost | $15 | $39 | $99 |
| Leads purchased (5/mo) | $25 | $45 | $100 |
| **Net earnings** | **$324** | **$1,590** | **$4,551** |
| **ROI (earnings / spend)** | **6.0×** | **17.1×** | **23.0×** |

### Platform Revenue Per Worker Per Month

| Stream | Starter | Growth | Pro |
|--------|---------|--------|-----|
| Subscription | $15 | $39 | $99 |
| Take rate | $36 | $126 | $250 |
| Lead credits | $12.50 | $22.50 | $50 |
| **Total platform revenue** | **$63.50** | **$187.50** | **$399** |

---

## 4. Pending Issues & Corrections

### Critical (P0)

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 1 | **Stripe not connected** | Credit purchases, ad campaigns, and subscriptions can't collect automatically | Manual OMT/Whish only |
| 2 | **Subscription auto-renewal via Stripe** | Churn prevention relies on manual admin confirmation | Needs Stripe Billing |
| 3 | **Booking deposits not escrowed** | Money flows directly, no protection | M4 holds deposits but no escrow release |
| 4 | **No production database seeding** | New workers see empty marketplace | Need seed script for production |

### Important (P1)

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 5 | **Credit purchase UI incomplete** | Package selection works but no Stripe checkout | Only OMT/Whish |
| 6 | **Lead rating → pricing feedback loop not wired to admin panel** | Admin can't see rating-driven price changes | Engine built, UI partial |
| 7 | **No email notifications for lead offers** | Workers don't know when matched | `lead-notifications.ts` built but not triggered |
| 8 | **ROI dashboard needs real data** | Currently shows demo data only | Needs production worker seeding |
| 9 | **Earnings statement doesn't show payouts** | `payoutsMinor` always 0 | Need to wire ledger withdrawals |

### Nice-to-have (P2)

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 10 | **No gamification/achievements** | Missed retention | API stubs exist |
| 11 | **No SaaS marketplace** | Missed B2B revenue | API stubs exist |
| 12 | **No background check monetization** | Missed trust premium | Types exist, not wired |
| 13 | **No company CRM** | Missed B2B expansion | Not started |
| 14 | **No milestone payments** | Missed escrow for large jobs | Not started |

---

## 5. Implementation Plan

### Phase 1: Fix Foundation (Week 1–2)

| Task | Effort | Impact |
|------|--------|--------|
| Connect Stripe for credit purchases | 2 days | Unlocks automatic top-ups |
| Wire Stripe Billing for subscription auto-renew | 3 days | Reduces churn 30–50% |
| Fix earnings statement payout tracking | 1 day | Accurate worker financials |
| Seed production database with demo workers | 1 day | Marketplace feels alive |
| Wire lead offer email notifications | 1 day | Workers engage with leads faster |
| Add credit purchase UI with Stripe checkout | 2 days | Workers can buy without admin |

### Phase 2: Revenue Optimization (Week 3–4)

| Task | Effort | Impact |
|------|--------|--------|
| Admin panel: show rating-driven price multipliers | 1 day | Visibility into feedback loop |
| Connect Stripe for company ad campaigns | 2 days | B2B revenue stream live |
| Add subscription upgrade/downgrade flow | 2 days | ARPU growth |
| Implement escrow for booking deposits | 3 days | Trust → higher job values |
| Add per-category fee overrides UI | 1 day | Admin pricing flexibility |

### Phase 3: Growth Features (Week 5–8)

| Task | Effort | Impact |
|------|--------|--------|
| Paid verification ladder (ID → license → background) | 4 days | New revenue stream |
| Company CRM / lead routing subscription | 5 days | B2B ARR |
| Gamification (badges, streaks, leaderboards) | 3 days | Retention |
| Push notification improvements | 2 days | Engagement |

### Phase 4: Scale (Month 3+)

| Task | Effort | Impact |
|------|--------|--------|
| MENA payment gateways (MyFatoorah, Tap, STC Pay) | 5 days | Regional expansion |
| Multi-city expansion (Tripoli, Sidon) | 2 days | TAM growth |
| Milestone payments for large jobs | 5 days | Higher GMV |
| Company advertising self-serve portal | 5 days | B2B self-serve |
| Mobile app (Capacitor) monetization | Ongoing | Highest-intent channel |

---

## 6. Revenue Improvement Plan

### 6.1 Short-term Revenue Lift (0–3 months)

| Strategy | Expected Impact |
|----------|----------------|
| **Connect Stripe** for subscriptions + credits | +40% conversion from manual payment friction |
| **Tiered lead pricing** (already built, tune thresholds) | +15% lead marketplace revenue |
| **Credit package upsell** (show "most popular" + savings) | +25% average credit purchase |
| **Subscription upgrade prompts** (when worker hits limits) | +20% ARPU migration |
| **Lead expiry urgency** (countdown + "3 workers viewing") | +30% lead purchase rate |

### 6.2 Medium-term Revenue Expansion (3–6 months)

| Strategy | Expected Impact |
|----------|----------------|
| **Paid verification** ($9–$19 per tier) | $5–$20K/month at 100 workers |
| **Company advertising self-serve** | $2–$10K/month at 20 advertisers |
| **Referral program** (credit bonuses) | -30% CAC, +20% organic growth |
| **Escrow for large jobs** (trust → higher values) | +25% average job value |
| **Seasonal promotions** (Ramadan, back-to-school) | +40% seasonal GMV |

### 6.3 Long-term Revenue Moats (6–12 months)

| Strategy | Expected Impact |
|----------|----------------|
| **Company CRM subscription** ($99–$499/month) | B2B ARR, high retention |
| **Data/analytics premium** (market rate reports) | High-margin, low-cost |
| **Multi-city expansion** (Tripoli, Sidon, Jounieh) | 3–5× TAM |
| **Mobile app** (Capacitor + push notifications) | Highest-intent channel |
| **Supplier marketplace** (materials, tools) | New revenue vertical |
| **Insurance partnerships** (worker liability) | Commission revenue |
| **Training/certification marketplace** | High-margin digital goods |

### 6.4 Revenue Projections (Conservative)

| Month | Workers | Subs Rev | Take Rate Rev | Lead Rev | Ads Rev | Total |
|-------|---------|----------|---------------|----------|---------|-------|
| 1 | 50 | $1,500 | $1,800 | $500 | $0 | $3,800 |
| 3 | 150 | $5,000 | $7,000 | $2,500 | $1,000 | $15,500 |
| 6 | 400 | $14,000 | $20,000 | $8,000 | $4,000 | $46,000 |
| 12 | 1,000 | $35,000 | $55,000 | $25,000 | $12,000 | $127,000 |

### 6.5 Key Metrics to Track

| Metric | Target | Current |
|--------|--------|---------|
| Monthly Recurring Revenue (MRR) | $30K by month 6 | $0 (manual payments) |
| Average Revenue Per Worker (ARPU) | $120/month | ~$15 (subscription only) |
| Lead marketplace GMV | $8K/month | $0 (no production data) |
| Worker retention (monthly) | >85% | Unknown |
| Lead purchase conversion | >40% | Unknown |
| Time to first job (new worker) | <7 days | Unknown |
| Customer NPS | >50 | Unknown |

---

## 7. Architecture Summary

### Tech Stack
- **Frontend**: Next.js 15, React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API routes, Server Actions
- **Database**: PostgreSQL (Prisma ORM)
- **Auth**: NextAuth.js v5 (demo cookie mode)
- **Payments**: OMT/Whish manual rails (live), Stripe (planned)
- **Deployment**: Vercel (auto-deploy from GitHub)
- **Mobile**: Capacitor (PWA → native, Android + iOS)

### Data Models (Monetization)
- `WorkerCreditEntry` — append-only credit ledger
- `LeadOffer` — marketplace offers per worker per lead
- `LeadRebate` — rebate audit trail per booking
- `LeadRating` — worker feedback on purchased leads
- `FeeRuleSet` — versioned fee configuration
- `PlatformFeeSnapshot` — immutable fee audit per booking
- `WorkerLedgerEntry` — earnings/withdrawals ledger
- `Subscription` — worker subscription with plan, period, expiry
- `PlanCatalogOverrides` — admin-editable plan pricing

### Test Coverage
- **97 test files / 1,371+ tests** (all passing)
- Covers: fee rules, lead market, credit ledger, ROI engine, earnings, ratings, analytics

---

## 8. Deployment Notes

- **Production URL**: https://workers-arena.vercel.app
- **Database**: PostgreSQL at `localhost:5432/workers_arena_v2` (local) + Vercel Postgres (production)
- **Migrations**: All applied (including lead offers, rebates, ratings, fee rules, credit ledger)
- **CI/CD**: GitHub Actions → Vercel auto-deploy
- **Mobile**: Capacitor 8 (Android + iOS) with push notifications, camera, geolocation, share sheet
- **Build**: `next build` passes clean with zero errors and zero warnings
