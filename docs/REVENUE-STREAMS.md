# WorkersArena — Revenue Streams System

## Overview

WorkersArena implements **12 configurable revenue streams** that generate income from the platform. Each stream can be individually enabled/disabled by the admin, with real-time analytics and per-stream configuration.

The revenue system is designed for the **Lebanon/MENA market** and supports multiple payment methods including Wish and OMT.

---

## Architecture

### Data Layer

```
src/lib/data/revenue-settings.ts   ← Central config store (in-memory, upgradeable to DB)
src/app/api/admin/revenue-settings/route.ts  ← Admin API (GET/PUT/POST)
src/app/api/credits/*/route.ts     ← Credit system APIs
src/app/api/tokens/*/route.ts      ← Token system APIs
src/app/api/commission-tier/route.ts  ← Commission tier API
src/app/api/saas/tools/route.ts    ← SaaS marketplace API
src/app/api/promoted/*/route.ts    ← Promoted profiles API
src/app/api/payouts/tiers/route.ts ← Payout tier API
src/app/api/background-checks/*/route.ts  ← Background check API
```

### UI Layer

```
src/components/admin/revenue-settings.tsx    ← Admin dashboard (12 streams)
src/components/dashboard/worker-revenue-tools.tsx  ← Worker dashboard (6 tabs)
src/components/dashboard/credit-balance.tsx  ← Lead credits card
src/components/dashboard/token-wallet.tsx    ← Application tokens card
src/components/dashboard/commission-tier.tsx ← Commission tier card
src/components/dashboard/promoted-campaign.tsx  ← Promoted profiles card
src/components/dashboard/saas-marketplace.tsx  ← SaaS tools card
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/revenue-settings` | GET | Fetch all stream configs + analytics |
| `/api/admin/revenue-settings` | PUT | Update stream enable/disable + settings |
| `/api/admin/revenue-settings` | POST | Bulk update multiple streams |
| `/api/credits/balance` | GET | Worker's credit balance |
| `/api/credits/packages` | GET | Available credit packages |
| `/api/tokens/balance` | GET | Worker's token balance |
| `/api/tokens/packages` | GET | Available token packages |
| `/api/commission-tier` | GET | Worker's commission tier + all tiers |
| `/api/saas/tools` | GET | Available SaaS tools |
| `/api/promoted/click` | POST | Track ad click for promoted profiles |
| `/api/payouts/tiers` | GET | Payout tier thresholds |
| `/api/background-checks/types` | GET | Available background check types |

---

## Revenue Streams (12 Total)

### 1. Pay-Per-Lead Credits 💳

**What it is:** Workers buy credits to send quotes/messages to customers. Each lead costs 1 credit.

**How it works:**
- Workers purchase credit packages (10, 30, 65, or 130 credits)
- Each credit costs $1.15–$2.50 depending on package size
- Credits are spent when a worker responds to a customer inquiry
- Larger packages include bonus credits (e.g., +15 bonus on 65 credits)

**Packages:**

| Package | Credits | Price | Per Credit | Bonus |
|---------|---------|-------|-----------|-------|
| Starter | 10 | $25 | $2.50 | — |
| Popular | 30 | $50 | $1.67 | — |
| Value | 65 | $90 | $1.38 | +15 bonus |
| Pro | 130 | $150 | $1.15 | +30 bonus |

**Admin Configuration:**
- Enable/disable the stream
- Set package pricing
- Configure credit expiration rules
- Set refund policies

**Worker Dashboard:** "Lead Credits" card with balance, purchase history, and "Buy More" button.

---

### 2. Application Tokens 🎟️

**What it is:** Workers spend virtual tokens to apply for jobs posted by companies.

**How it works:**
- Workers earn tokens through activity (completing bookings, getting reviews)
- Workers can also purchase token packages
- Each job application costs tokens
- Tokens expire after 90 days if unused

**Earning Tokens (Free):**
- Complete a booking: +2 tokens
- Get a 5-star review: +1 token
- Monthly activity bonus: +5 tokens

**Purchase Packages:**

| Package | Tokens | Price | Popular |
|---------|--------|-------|---------|
| Basic | 20 | $15 | — |
| Standard | 60 | $30 | ✅ |
| Premium | 125 | $50 | +25 bonus |

**Admin Configuration:**
- Enable/disable the stream
- Set token costs per action
- Configure earning rules
- Set expiration periods

**Worker Dashboard:** "Application Tokens" card with balance, earn/spend history, and "Buy More" button.

---

### 3. Sliding Commissions 💹

**What it is:** A percentage fee that decreases as a worker's lifetime billings grow.

**How it works:**
- All workers start at Bronze tier (15% commission)
- As lifetime billings increase, workers move to lower-commission tiers
- Lower commission = more take-home pay for workers
- Incentivizes long-term platform engagement

**Commission Tiers:**

| Tier | Lifetime Billings | Commission Rate | Worker Keeps |
|------|-------------------|----------------|--------------|
| Bronze | $0+ | 15% | 85% |
| Silver | $5,001+ | 12% | 88% |
| Gold | $15,001+ | 10% | 90% |
| Platinum | $50,001+ | 7% | 93% |

**Admin Configuration:**
- Enable/disable sliding commissions
- Adjust tier thresholds
- Modify commission rates per tier
- Set grace periods for tier changes

**Worker Dashboard:** "Commission Tier" card showing current tier, progress bar to next tier, lifetime billings, and all tier comparisons.

---

### 4. Background Check Fees 🔍

**What it is:** One-time onboarding fee for worker vetting/screening.

**How it works:**
- Workers pay a fee to undergo background verification
- Checks include identity, criminal record, and trade certification
- Verified workers get a "Verified" badge on their profile
- Badge increases customer trust and booking rates

**Check Types:**

| Check | Description | Fee |
|-------|-------------|-----|
| Identity Verification | Government ID validation | $15 |
| Criminal Record | Background screening | $25 |
| Trade Certification | Skill verification | $35 |
| Full Package | All checks combined | $60 |

**Admin Configuration:**
- Enable/disable the stream
- Set pricing per check type
- Configure verification partners
- Set badge display rules

**Worker Dashboard:** Available in "Premium Tools" tab under WorkerRevenueTools.

---

### 5. Instant Payout Fees ⚡

**What it is:** Charge for same-day fund transfers to workers.

**How it works:**
- Standard payouts are free but take 3-5 business days
- Workers can pay a fee for instant same-day transfer
- Fee is a percentage of the payout amount
- Minimum payout amount applies

**Pricing:**

| Payout Size | Instant Fee | Standard |
|-------------|-------------|----------|
| $10-$50 | $2.50 (flat) | Free |
| $50-$200 | 5% | Free |
| $200+ | 4% | Free |

**Admin Configuration:**
- Enable/disable instant payouts
- Set fee percentages
- Configure minimum/maximum payout amounts
- Set instant payout cutoff times

---

### 6. SaaS Subscriptions 🛠️

**What it is:** Premium tools (invoicing, CRM, analytics) available as monthly subscriptions.

**How it works:**
- Workers can subscribe to premium tool bundles
- Tools include invoicing, CRM, advanced analytics, priority support
- Monthly subscription with tiered pricing
- Free trial available (14 days)

**Subscription Tiers:**

| Tier | Price/Month | Features |
|------|-------------|----------|
| Basic | $19 | Invoicing, basic analytics |
| Professional | $49 | CRM, advanced analytics, priority support |
| Enterprise | $99 | All features, API access, custom branding |

**Admin Configuration:**
- Enable/disable SaaS tools
- Configure subscription tiers
- Set feature access per tier
- Manage trial periods

**Worker Dashboard:** "SaaS Marketplace" card in the "Tools" tab with available subscriptions.

---

### 7. Promoted Profiles 📈

**What it is:** CPC bidding for search visibility — workers pay to appear higher in search results.

**How it works:**
- Workers set a daily budget and max CPC bid
- Their profile appears in "Promoted" slots in search results
- They pay only when someone clicks their profile
- Performance tracked with impressions, clicks, CTR

**Campaign Settings:**

| Setting | Description |
|---------|-------------|
| Max CPC Bid | Maximum cost per click (e.g., $2.50) |
| Daily Budget | Maximum daily spend (e.g., $25) |
| Target Category | Which search categories to appear in |
| Schedule | Time-of-day and day-of-week targeting |

**Performance Metrics:**
- Impressions (how many times shown)
- Clicks (how many profile visits)
- CTR (click-through rate)
- Total Spent
- Average CPC

**Admin Configuration:**
- Enable/disable promoted profiles
- Set minimum/maximum bid amounts
- Configure ad placement slots
- Set daily budget caps

**Worker Dashboard:** "Promoted Profile" card with campaign stats, settings editor, and performance metrics.

---

### 8. Premium Support 🎧

**What it is:** Priority customer support for workers.

**What's included:**
- Dedicated support queue (faster response times)
- Phone support availability
- Account manager for high-value workers
- Priority dispute resolution

**Pricing:** $29/month

**Admin Configuration:**
- Enable/disable premium support
- Set pricing
- Configure support tiers
- Manage support queue priorities

---

### 9. Insurance Marketplace 🛡️

**What it is:** Connect workers with insurance providers for liability and equipment coverage.

**How it works:**
- Partner with insurance providers
- Workers browse and purchase insurance policies
- Platform earns referral commission
- Policies cover liability, equipment, and workers' comp

**Insurance Types:**

| Type | Coverage | Monthly Premium |
|------|----------|-----------------|
| General Liability | Up to $1M | $45 |
| Equipment Coverage | Up to $10K | $25 |
| Workers' Comp | State-mandated | $60 |

**Admin Configuration:**
- Enable/disable insurance marketplace
- Set referral commission rates
- Configure insurance partners
- Manage policy displays

---

### 10. Training & Certification 📚

**What it is:** Online courses and certifications for worker skill development.

**How it works:**
- Platform offers courses in various trades
- Workers complete courses and earn certifications
- Certifications displayed on worker profiles
- Platform earns course fees

**Course Categories:**
- Safety & Compliance
- Trade Skills (plumbing, electrical, etc.)
- Customer Service
- Business Management

**Admin Configuration:**
- Enable/disable training marketplace
- Set course pricing
- Configure certification requirements
- Manage course content

---

### 11. Equipment Marketplace 🏪

**What it is:** Buy/sell/rent trade equipment between workers.

**How it works:**
- Workers list equipment for sale or rent
- Other workers browse and purchase/rent
- Platform takes a transaction fee
- Includes tools, vehicles, and materials

**Transaction Fees:**
- Sales: 5% of sale price
- Rentals: 10% of rental fee

**Admin Configuration:**
- Enable/disable equipment marketplace
- Set transaction fees
- Configure listing rules
- Manage dispute resolution

---

### 12. White-Label Solutions 🏢

**What it is:** License the WorkersArena platform to other businesses.

**How it works:**
- Other companies can rebrand and deploy the platform
- Includes full source code license
- Ongoing support and updates
- Customization services available

**Pricing:**
- Setup fee: $5,000
- Monthly license: $500
- Customization: $150/hour

**Admin Configuration:**
- Enable/disable white-label offerings
- Set licensing terms
- Configure support tiers
- Manage partner onboarding

---

## Admin Dashboard

### Access Points

1. **Direct URL:** `https://workersarena.com/admin/revenue-settings`
2. **Admin Dashboard Quick Navigation:** "Revenue Streams" button
3. **Mobile Sidebar:** "Revenue Streams" menu item

### Features

- **Overview Cards:** Monthly Revenue, Active Streams, Average Growth
- **Stream List:** All 12 streams with enable/disable toggles
- **Per-Stream Analytics:** Total Revenue, Transactions, Avg. Value, Growth %
- **Settings Panel:** Editable configuration per stream
- **Save Changes:** Bulk update all modified settings
- **Bilingual:** English + Arabic names and descriptions

---

## Worker Dashboard

### Access

Workers access revenue tools from their dashboard at `/dashboard`.

### Tab Navigation

| Tab | Icon | Content |
|-----|------|---------|
| Overview | TrendingUp | 2×2 grid of all 4 active cards |
| Credits | Coin | Full Lead Credits card + packages |
| Tokens | Zap | Full Token Wallet + packages |
| Commission | Percent | Full Commission Tier + progress |
| Tools | Box | SaaS Marketplace |
| Promote | Megaphone | Full Promoted Campaign management |

### Interactive Features

- **Buy More** buttons expand package selection grids
- **Edit** buttons open configuration modals
- **Pause/Play** toggles for promoted campaigns
- **Progress bars** show tier advancement
- **Stats grids** display balance, transactions, and growth

---

## Payment Integration (Lebanon Market)

### Supported Payment Methods

| Method | Type | Processing Time |
|--------|------|-----------------|
| Wish | Mobile Wallet | Instant |
| OMT | Money Transfer | 1-2 hours |
| Credit Card | Visa/Mastercard | Instant |
| Bank Transfer | Wire Transfer | 1-3 days |

### Currency Support

- **Primary:** USD (United States Dollar)
- **Secondary:** LBP (Lebanese Pound)
- **Exchange Rate:** Dynamic, fetched from API

---

## Configuration Guide

### Enabling a Revenue Stream

1. Navigate to `/admin/revenue-settings`
2. Find the stream in the list
3. Toggle the enable switch ON
4. Configure stream-specific settings
5. Click "Save Changes"

### Disabling a Revenue Stream

1. Navigate to `/admin/revenue-settings`
2. Find the stream in the list
3. Toggle the enable switch OFF
4. Click "Save Changes"

**Note:** Disabling a stream does not affect existing transactions or balances. Workers can still use purchased credits/tokens until depleted.

---

## Analytics & Reporting

### Per-Stream Metrics

- **Total Revenue:** Cumulative earnings from this stream
- **Transactions:** Number of transactions processed
- **Average Value:** Mean transaction amount
- **Growth:** Month-over-month percentage change

### Dashboard Analytics

- **Monthly Revenue:** Total across all active streams
- **Active Streams:** Count of enabled streams (X/12)
- **Average Growth:** Mean growth rate across streams

---

## Future Enhancements

### Planned Features

1. **Real-Time Dashboard:** Live metrics with WebSocket updates
2. **Revenue Forecasting:** AI-powered revenue predictions
3. **A/B Testing:** Test different pricing strategies
4. **Dynamic Pricing:** Adjust prices based on demand
5. **Loyalty Program:** Reward long-term workers with bonuses
6. **Referral System:** Earn credits for referring new workers
7. **Invoice Generation:** Auto-generate invoices for subscriptions
8. **Tax Reporting:** Automated tax document generation

### Integration Roadmap

- **Stripe:** Full payment processing integration
- **SendGrid/Resend:** Transactional email delivery
- **Meilisearch:** Advanced search for equipment marketplace
- **Liveblocks:** Real-time collaboration features
- **Sentry:** Error tracking and performance monitoring

---

## Troubleshooting

### Common Issues

**Stream not appearing in admin dashboard:**
- Check if the stream is enabled in `revenue-settings.ts`
- Verify the admin user has proper permissions
- Clear browser cache and reload

**Worker can't purchase credits:**
- Ensure the credits stream is enabled
- Check if payment method is configured
- Verify worker account is verified

**Commission tier not updating:**
- Check lifetime billings calculation
- Verify tier thresholds in settings
- Wait for next billing cycle (monthly)

**Promoted profile not showing:**
- Check daily budget hasn't been exhausted
- Verify CPC bid is competitive
- Ensure campaign is active (not paused)

---

## Support

For technical support or questions about the revenue system:

- **Documentation:** This file (`docs/REVENUE-STREAMS.md`)
- **Admin Dashboard:** `/admin/revenue-settings`
- **Worker Dashboard:** `/dashboard` → Revenue Tools tabs
- **API Documentation:** See individual route files in `src/app/api/`

---

*Last updated: August 2026*
*Version: 1.0.0*
