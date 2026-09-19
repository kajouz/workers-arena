# WorkersArena — Revenue Streams System

## Overview

### Phase 3 retention operations

The admin retention panel now combines subscription health with an operational renewal action. At-risk workers can be contacted individually through the admin-only **WhatsApp** button; the action sends only through the configured WhatsApp provider (`console` for demo or `whatsapp-cloud` for production), uses the worker's preferred language, and links back to the dashboard. It does not charge the worker and does not send email/SMS.

The `/api/cron/reminders` job also records a deduplicated `expired` subscription lifecycle event when an expired subscription is processed. In production mode it scans Prisma subscriptions and uses `lastReminderSent` as a compare-and-swap claim for the 7/3/1-day and expired windows, so concurrent cron retries do not double-send or inflate churn. Stripe and automatic payment collection remain deferred.

Admins can download a retention CSV from the revenue dashboard and can export the pending OMT/Whish reconciliation queue, including transfer reference, scope, bilingual label, method, amount, currency, and creation time. Pending-renewal cancellation is ownership-checked against the authenticated worker in real mode, so one worker cannot cancel another worker's payment. The reconciliation export is intentionally limited to pending manual payments; settled-payment receipt history remains a later accounting phase.


WorkersArena implements **14 configurable revenue streams** that generate income from the platform. Each stream can be individually enabled/disabled by the admin, with real-time analytics and per-stream configuration.

The revenue system is designed for the **Lebanon/MENA market** and supports multiple payment methods including OMT and Whish.

---

## Architecture

### Data Layer

```
src/lib/data/subscription-plans.ts    ← Plan catalog (admin-editable pricing)
src/lib/data/subscriptions.ts         ← Subscription engine (renewal, trial, invoicing)
src/lib/data/fee-rules.ts             ← Platform fee engine (take rate, snapshots)
src/lib/data/fee-rules-store.ts       ← Fee rule persistence (demo + Prisma)
src/lib/data/lead-market.ts           ← Lead marketplace engine (grading, matching, pricing)
src/lib/data/lead-market-store.ts     ← Lead offer persistence (demo + Prisma)
src/lib/data/lead-market-prisma.ts    ← Prisma adapter for lead offers
src/lib/data/lead-rebate.ts           ← Lead rebate engine (loyalty loop)
src/lib/data/lead-rebate-prisma.ts    ← Prisma adapter for rebates
src/lib/data/lead-rating.ts           ← Lead quality feedback engine
src/lib/data/lead-rating-prisma.ts    ← Prisma adapter for ratings
src/lib/data/credit-ledger.ts         ← Platform credit ledger (append-only)
src/lib/data/credit-ledger-prisma.ts  ← Prisma adapter for credits
src/lib/data/purchases.ts             ← Paid upgrades (verification, featured, emergency)
src/lib/data/revenue-settings.ts      ← Revenue stream configs (credits, tokens, etc.)
src/lib/data/referral.ts              ← Referral program engine
src/lib/data/worker-roi.ts            ← Worker ROI dashboard engine
src/lib/data/earnings.ts              ← Earnings statement engine
src/lib/data/lead-quality-analytics.ts← Lead quality analytics engine
src/lib/pricing/smart-pricing.ts      ← Dynamic lead pricing (demand, holidays, rush hour)
src/lib/data/plan-catalog-overrides.ts← Admin-editable plan pricing overrides
```

### UI Layer

```
src/components/home/plans.tsx                    ← Public pricing page
src/components/dashboard/renew-dialog.tsx        ← Subscription renewal dialog
src/components/dashboard/upgrade-dialog.tsx      ← Paid upgrades dialog
src/components/dashboard/credit-balance.tsx      ← Credit balance card
src/components/dashboard/worker-dashboard.tsx    ← Worker dashboard (main)
src/components/dashboard/worker-roi-dashboard.tsx← ROI dashboard
src/components/dashboard/worker-roi-card.tsx     ← ROI summary card
src/components/dashboard/earnings-statement.tsx  ← Earnings statement
src/components/dashboard/portfolio-manager.tsx   ← Portfolio builder
src/components/dashboard/referral-card.tsx       ← Referral program card
src/components/dashboard/network-banner.tsx      ← Offline/online banner
src/components/mobile/proof-photo-capture.tsx    ← Camera proof-of-work
src/components/mobile/mobile-onboarding.tsx      ← Mobile onboarding flow
src/components/admin/fee-rules-panel.tsx         ← Fee rules admin editor
src/components/admin/promotions-panel.tsx        ← Promotions admin editor
src/components/admin/lead-market-panel.tsx       ← Lead marketplace admin
src/components/admin/lead-quality-panel.tsx      ← Lead quality analytics
src/components/dashboard/analytics-dashboard.tsx ← Worker analytics
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/credits/balance` | GET | Worker's credit balance |
| `/api/credits/packages` | GET | Available credit packages |
| `/api/credits/purchase` | POST | Initiate credit purchase (OMT/Whish) |
| `/api/admin/revenue-settings` | GET | Fetch all stream configs + analytics |
| `/api/admin/revenue-settings` | PUT | Update stream enable/disable + settings |
| `/api/dev/seed-lead-market` | POST | Seed demo lead marketplace data |
| `/api/dev/seed-production` | POST | Seed production database |
| `/api/cron/recurring` | POST | Materialize recurring job occurrences |

---

## Revenue Streams (14 Total)

### 1. Worker Subscriptions 💳

**What it is:** Monthly/annual subscription plans that gate visibility and unlock features.

**Current Pricing (admin-editable):**

| Plan | Monthly | Annual (9mo) | Leads/mo | Key Perks |
|------|---------|-------------|----------|-----------|
| **Starter** | $15 | $135 | 3 | Profile, search listing |
| **Growth** | $39 | $351 | 10 | + Featured, verification |
| **Pro** | $99 | $891 | 25 | + Priority, analytics, emergency |
| **Business** | $199 | $1,791 | Unlimited | + reduced 4% platform fee, team mgmt |

**Category-Adjusted Pricing:**
- Low-value trades (cleaning, gardening): 0.5× → Starter $7.50/mo
- Mid-value trades (plumbing, electrical): 1.0× → Starter $15/mo
- High-value trades (HVAC, mechanic): 1.5× → Starter $22.50/mo

**Phase 1 trial policy:** 30 days free for Starter/Growth, 14 days for Pro, and Business is assisted by default. Eligibility is checked server-side once per worker; an expired plan cannot be used to reclaim a trial.

**Key Mechanics:**
- **Visibility gating**: expired subscription → worker removed from public search
- **Renewal reminders**: 7d, 3d, 1d before expiry
- **Upgrade/downgrade preview**: the renewal dialog shows the monthly difference before the worker commits; it labels the selection as an upgrade, downgrade, or unchanged plan
- **Category-consistent charging**: manual OMT/Whish instructions, renewal invoices, and subscription records use the same admin-edited plan price × trade multiplier in both demo and Prisma paths
- **Invoicing**: every confirmed renewal mints an invoice with the exact charged amount
- **Admin-editable**: all prices, quotas, and features configurable via `/admin/revenue-settings`

---

### 2. Platform Fee (Take Rate) 💹

**What it is:** A percentage fee collected on every completed job.

**Current Rates (admin-editable):**

| Plan Tier | Rate | Min | Max |
|-----------|------|-----|-----|
| Free | 12% | $5 | $300 |
| Starter | 9% | $5 | $300 |
| Growth | 7% | $5 | $300 |
| Pro | 5% | $5 | $300 |
| Business | **4% reduced rate** | $5 | $300 |

**Key Mechanics:**
- Applied at **accept-with-quote** (immutable snapshot)
- Collected at **booking completion**
- Admin can set per-category, per-promotion overrides
- Fee snapshot is auditable (`PlatformFeeSnapshot` model)

---

### 3. Lead Marketplace 🎯

**What it is:** Workers buy qualified leads (customer requests) to compete for jobs.

**Lead Grades & Pricing:**

| Grade | Price | Trigger |
|-------|-------|---------|
| **Bronze** | 5 credits ($5) | Basic info, no email |
| **Silver** | 9 credits ($9) | Email + category + location |
| **Gold** | 20 credits ($20) | Full profile + photos + signed in |
| **Emergency** | 35 credits ($35) | 24/7 urgent request |

**Matching Engine:**
- Weighted scoring (trade 30%, area 12%, city 8%, rating 12%, reviews 6%, response rate 10%, availability 8%, plan tier 6%, emergency 5%, verified 3%)
- Limited distribution (max 3 workers per lead)
- Exclusive ownership (buying revokes rivals)
- Time-based expiry (2-hour window)

**Contact Reveal:**
- Before purchase: masked (partial phone/email)
- After purchase (paid plan): revealed (full contact)
- After purchase (free plan): masked (tier lever)
- After booking: revealed (customer consent)

**Quality Feedback Loop:**
- Workers rate leads 1–5 stars after purchase
- Ratings feed into per-grade pricing multipliers (0.8×–1.2×)
- Ratings influence matching weights
- Admin dashboard shows quality trends

**Phase 2 demand pricing:**
- Qualified-lead distribution applies smart pricing for rush hour, weekends, seasonal demand, holidays, local supply/demand, and emergency dispatch.
- Emergency requests add a bounded 1.5× dispatch factor; all results are clamped to 0.7×–2.0×.
- The combined multiplier and reason are stored on each offer with its locked credit price; existing offers are never repriced.

---

### 4. Platform Credits 💰

**What it is:** Workers buy credits to purchase leads.

**Credit Packages (admin-editable):**

| Package | Credits | Price | Bonus | Total |
|---------|---------|-------|-------|-------|
| Starter | 10 | $10 | 0 | 10 |
| Popular | 25 | $25 | 5 | 30 |
| Professional | 50 | $50 | 15 | 65 |
| Enterprise | 100 | $100 | 30 | 130 |

**Payment Methods:**
- OMT (admin-confirmed)
- Whish (admin-confirmed)
- Stripe (planned)

**Key Mechanics:**
- Base credits are transparently priced at $1 each; bonus credits are promotional and shown separately
- Credits consumed when buying leads
- Credit refund requests are admin-reviewed for invalid contact, duplicate, wrong category/area, not requested, or unreachable leads; approvals append ledger adjustments
- Append-only ledger (`WorkerCreditEntry`)
- Admin can adjust balances manually

---

### 5. Lead Rebates 🔄

**What it is:** When a bought lead converts to a completed job, the lead's cost is rebated against the platform fee.

**How it works:**
- `rebate = min(fee × pctBps/10000, lead cost, ceiling)`
- Default: 100% of fee share, no ceiling
- Recorded in `LeadRebate` model (append-only)
- Shown on worker booking row and lead board

**Example:**
- 7% of $300 = $21 fee
- Gold lead cost $20
- Rebate $20 → platform keeps $1, worker nets $299

---

### 6. Paid Verification 🔍

**What it is:** One-time fee for worker identity verification.

**Tiers:**

| Tier | Price | What's included |
|------|-------|----------------|
| **Basic** | $9 | ID check only |
| **Professional** | $19 | License + background check |

**Key Mechanics:**
- 12-month validity
- Badge in search results
- Admin confirms payment → flips `verified` flag
- Purchasable via OMT/Whish

---

### 7. Featured Slot 📈

**What it is:** Monthly add-on for homepage featured placement.

**Pricing:** $49/category/mo

**Key Mechanics:**
- Homepage featured section visibility
- Purchasable via OMT/Whish
- Admin confirms payment → flips `featured` flag

---

### 8. Emergency Marker 🚨

**What it is:** Monthly add-on for 24/7 urgent job availability.

**Pricing:** $9/mo

**Key Mechanics:**
- Shows "Available 24/7" badge
- Receives emergency lead offers
- Purchasable via OMT/Whish
- Admin confirms payment → flips `emergency` flag

---

### 9. Referral Program 🤝

**What it is:** Earn credits by referring other workers.

**Rewards:**

| Action | Reward |
|--------|--------|
| Referrer (successful referral) | 25 credits |
| Invitee (signup) | 10 credits |
| Monthly cap | 10 referrals |
| Lifetime cap | Unlimited |
| Qualifying action | Invitee completes first booking |

**Key Mechanics:**
- Unique referral code per worker
- Configurable via `FeeRuleSet.referral` (admin-editable)
- Credits granted on qualifying action

---

### 10. Smart Pricing 📊

**What it is:** Dynamic lead price multiplier based on demand and context.

**Multipliers:**

| Factor | Multiplier |
|--------|-----------|
| Rush hour (6–9 AM, 5–8 PM) | +15% |
| Weekend (Sat–Sun) | +10–20% |
| Summer (AC jobs) | +25% |
| Winter (plumbing jobs) | +15% |
| Holidays (Ramadan, Eid) | +30–35% |
| High demand (few workers available) | Up to 2.0× |
| Low demand (many workers available) | Down to 0.7× |

**Clamped to [0.7, 2.0] range.**

---

### 11. Company Advertising 📢

**What it is:** CPC/CPM campaigns for businesses.

**Status:** Built, needs gateway for live payments.

**Pricing (demo):**
- CPM: $10
- CPC: $1

**Key Mechanics:**
- Campaign creation with budget, targeting, creative
- Impression + click tracking
- Payment infrastructure exists (checkout → webhook → activate)

---

### 12. Worker Analytics 📈

**What it is:** Comprehensive spending analytics, ROI calculations, and conversion tracking.

**Metrics:**
- Views, leads, completed jobs, GMV
- Conversion rate, avg job value
- Rating, response rate
- Performance insights with actionable recommendations

**Dashboard:** `/dashboard/analytics`

---

### 13. Earnings Statement 📄

**What it is:** Monthly breakdown of completed jobs, fees, rebates, and net payouts.

**Metrics:**
- Completed jobs count
- GMV (gross merchandise value)
- Platform fees deducted
- Lead rebates applied
- Net earnings
- Per-job detail

**Dashboard:** `/dashboard/earnings`

---

### 14. Lead Quality Analytics 📊

**What it is:** Admin dashboard for monitoring lead quality trends.

**Metrics:**
- Weekly rating trends
- Per-grade statistics
- Conversion rates
- Price multiplier impact
- Worker feedback distribution

**Dashboard:** `/admin/analytics/lead-quality`

---

### 15. Subscription Retention Operations 📉

**What it is:** An admin-facing subscription-health snapshot that supports manual renewal outreach without pretending that payment automation exists.

**Live metrics:**
- Active and expired subscription counts
- Subscriptions expiring within 30 days
- Current retention and churn ratios
- At-risk workers ordered by soonest expiry

The snapshot is calculated from the adapter's current worker rows, uses an injectable clock for boundary-safe tests, and is suitable for prioritizing admin WhatsApp renewal messages. Trial starts, manual renewals, and admin plan changes now also append `SubscriptionEvent` rows through the demo/Prisma lifecycle seam, so the six-month cohort table reports measured event counts and worker-level trial conversion. Lifetime value and historical transition totals remain blank until enough production history exists and are not treated as financial reporting yet.

**Dashboard:** `/admin` → Retention & Churn

---

## Admin Dashboard

### Access Points

1. **Direct URL:** `https://workers-arena.vercel.app/admin`
2. **Revenue Settings:** `/admin/revenue-settings`

### Features

- **Fee Rules Editor:** Plan-tier ladder, category pricing, promotions
- **Lead Marketplace Config:** Grade prices, matching weights, contact reveal
- **Credit Packages:** Enable/disable, adjust pricing
- **Promotions Panel:** Campaign creation, credit bonuses
- **Lead Quality Analytics:** Rating trends, conversion rates
- **Pending Payments:** OMT/Whish confirmation queue
- **Audit Trail:** All changes logged with admin attribution

---

## Worker Dashboard

### Revenue Tools

| Tab | Content |
|-----|---------|
| **Overview** | 2×2 grid of main cards |
| **Lead Credits** | Balance, purchase history, "Buy More" |
| **Commission** | Tier progress, lifetime billings |
| **Analytics** | Spending history, ROI, conversion |
| **Alerts** | Low balance, expiry warnings |
| **Referrals** | Code, earnings, leaderboard |
| **Earnings** | Monthly statement, net payouts |
| **ROI** | Leads bought, jobs won, multiple |
| **Portfolio** | Before/after photos, project showcase |
| **Rewards** | Badges, streaks, challenges |

---

## Payment Integration (Lebanon Market)

### Supported Payment Methods

| Method | Type | Processing Time |
|--------|------|-----------------|
| OMT | Money Transfer | 1-2 hours (admin confirmed) |
| Whish | Mobile Wallet | Instant (admin confirmed) |
| Stripe | Credit Card | Instant (planned) |

### Currency Support

- **Tenant currency:** USD (United States Dollar)
- **FX:** the exchange-rate seam (`src/lib/currency.ts`) remains a stub for a future country tenant

---

## Configuration Guide

### Enabling a Revenue Stream

1. Navigate to `/admin/revenue-settings`
2. Find the stream in the list
3. Toggle the enable switch ON
4. Configure stream-specific settings
5. Click "Save Changes"

### Updating Subscription Plans

1. Navigate to `/admin/revenue-settings`
2. Edit plan prices, quotas, and features
3. Publish new version (creates audit trail)
4. Workers see updated prices on next renewal

### Configuring Lead Marketplace

1. Navigate to `/admin/revenue-settings` → Lead marketplace
2. Set grade prices (credits)
3. Adjust matching weights
4. Configure contact reveal policy
5. Set rebate rules (enabled, share, ceiling)
6. Publish new version

---

## Analytics & Reporting

### Per-Stream Metrics

- **Total Revenue:** Cumulative earnings from this stream
- **Transactions:** Number of transactions processed
- **Average Value:** Mean transaction amount
- **Growth:** Month-over-month percentage change

### Worker Metrics

- **ROI Multiple:** earnings ÷ marketplace spend
- **Lead Conversion:** leads bought → jobs won
- **Effective Take Rate:** (subscription + fees) ÷ GMV

---

## Phase 2 Status (payment automation deferred)

- ✅ Rating-driven and smart demand multipliers are visible in the admin lead-offer audit.
- ✅ Emergency requests receive a bounded dispatch premium and retain their locked price/reason.
- ✅ Lead refunds support full or partial credit decisions with admin notes.
- ✅ Subscription retention snapshot is now derived from current worker subscriptions, including 30-day expiry risk ordering.
- ✅ Persist subscription lifecycle events for trial starts, manual renewals, and admin plan changes; aggregate cohort retention and trial conversion in the admin panel.
- 🟡 Add expiry/cancellation cron events and sufficient production history before publishing LTV or transition reporting.
- 🔜 Subscription upgrade/downgrade UX and escrow remain the next non-Stripe revenue improvements.
- ⏸️ Stripe and automatic company campaign billing remain deferred by product decision.

## Future Enhancements

### Planned Features

1. **Stripe Integration:** Full payment processing for subscriptions + credits
2. **MENA Gateways:** MyFatoorah, Tap, STC Pay for regional expansion
3. **Escrow for Large Jobs:** Hold deposits until completion
4. **Company Self-Serve Portal:** Campaign creation without admin
5. **Multi-City Expansion:** Tripoli, Sidon, Jounieh
6. **Mobile Monetization:** In-app purchases, push-driven dispatch

---

*Last updated: September 19, 2026*
*Version: 3.0.0*
*Streams: 14 configured (10 live, 4 built, pending gateway)*
