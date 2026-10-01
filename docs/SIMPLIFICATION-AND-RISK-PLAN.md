# WorkersArena — Business Simplification, Revenue Growth & Bug/Risk Elimination Plan

> Source: *WorkersArena QA Audit v1.0 (2026-09-29)* cross-read with `BUSINESS-MODEL.md`, `REVENUE-STREAMS.md`, `fee-rules.md`.
> Status: **proposal for decision** — nothing here is implemented yet. Numbers marked *(assumption)* must be validated with real data before they are locked.
> Date: 2026-10-01

---

## 0. The diagnosis in five lines

1. **Too many revenue knobs, one cash stream.** 14 "streams" are documented, but `BUSINESS-MODEL.md` itself states subscriptions are *the only cash-collecting stream*. Everything else depends on an admin manually confirming OMT/Whish payments.
2. **Pricing is a matrix, not a price.** 4 plans × 3 category multipliers × monthly/annual × plan-specific trials × plan-specific take rates (12/9/7/5/4%) × plan-specific lead quotas × lead grades × smart-pricing multipliers × rebates × promo bonuses. Workers cannot predict what they will pay; support and QA cannot either.
3. **The money that matters (take rate on jobs) is the easiest to leak.** If customer and worker can agree off-platform after seeing a profile, the 4–12% fee is never earned.
4. **Collection is manual.** Every deposit, credit pack, ad campaign, verification and add-on waits for an admin click. That caps revenue at admin throughput and is the biggest operational risk.
5. **Production is not yet equal to demo.** Google sign-in can break (BUG-06), some writes still hit demo stores in production (BUG-07), rate limiting is per-instance, uploads are not real. These are revenue-blocking *and* trust-blocking.

**Principle for everything below:** fewer prices, money collected before value is delivered, every cash path automated or reconciled, every change behind a flag with a rollback.

---

## Part A — Simplify the business model

### A1. Collapse 14 streams into 4 revenue pillars

| Pillar | What it contains | Why |
|---|---|---|
| **1. Transaction fee** (core) | Take rate on completed, platform-paid jobs | Scales with value delivered; workers only pay when they earn → lowest adoption risk |
| **2. Worker plan** (recurring) | Free / Pro / Business (3 plans, was 4 + Free) | Predictable MRR; one page to explain |
| **3. Leads & credits** (demand) | Credit packs, graded leads, lead refunds | Pay-per-opportunity for workers who don't want a plan |
| **4. Visibility & trust add-ons + Ads** | Verification, Featured, Emergency, 8 ad formats | Sold as one "Promote" catalogue with one checkout |

**Park (do not delete; hide behind flags until pillars 1–3 are stable):** Promotions engine, lead rebates, smart-pricing multipliers & lead-quality weight feedback, category-adjusted subscription multipliers, referral credit mechanics, AI moderation/concierge, extra locales, Meilisearch.
These add configuration surface and QA load but no proven revenue. Re-enable one at a time once there is data to justify it.

### A2. One simple pricing sheet

**Plans (workers)** *(prices = assumption, starting from current catalogue)*

| | Free | Pro | Business |
|---|---|---|---|
| Monthly | $0 | $29 | $99 |
| Annual (pay 10, get 12) | – | $290 | $990 |
| Search listing | Yes, ranked after paying | Yes + priority | Yes + priority + team seats |
| Leads | Buy with credits only | 15 included/mo | 50 included/mo |
| Take rate on platform jobs | 10% | 6% | 4% |
| Trial | – | 30 days, once per worker | Sales-assisted |

Changes vs today: merge Starter/Growth/Pro → **Pro** (they differ only by small perks), remove **category multipliers** (replace by the existing fee floor/cap, which already protects low-value trades), **one trial rule** (30 days, once), 3 take-rate values instead of 5.
*Validate:* run the current worker base through the new sheet; no cohort's payment should rise > 25% without a visible benefit, and no cohort should pay less than its current contribution margin.

**Fee rule (single sentence for workers):** "You pay X% of a job's value, minimum $5, maximum $300, only on jobs paid through WorkersArena."

**Credits:** keep $1 = 1 credit, drop bonus-credit complexity to a single published bonus ladder (e.g. 10% at $50, 20% at $100). Lead prices: **two grades** (Standard $5–9, Urgent/Emergency $20–35) instead of four plus multipliers. Keep the 1–5 star lead rating and one-click refund request for invalid contacts (it protects trust), but pause automatic price/matching feedback.

**Promote catalogue (one page, one checkout):** Verified Basic $9 · Verified Pro $19 · Featured $49/category/month (**limited inventory, e.g. 5 slots per category/city** → scarcity) · Emergency badge $9/mo · Ads: start with 3 formats (sponsored search, featured, banner), add others only when sold out.

### A3. Make the take rate hard to bypass (protects pillar 1)

- Reveal real contact only after a **deposit is paid**; before that, masked call/WhatsApp (already built).
- Position the **guarantee** (`guarantee.md`) as the reason to pay on-platform: refund/dispute protection only for platform-paid jobs.
- Worker side: **rebate/earned-fee waiver for the first N on-platform jobs** instead of discounts on plans — rewards the behaviour we want.
- Detect leakage: track *contact reveals → completed on-platform jobs* per worker; flag workers with high reveals and near-zero completions to account management.
- Keep instant booking (fixed price, deposit = price) as the default path for fixed-price services: fully funded before the job starts.

### A4. Simplify the collection workflow

Today: customer/worker/company pays an agent → admin confirms → system activates. Target:

1. **One payment service** for all revenue types (subscription, credits, deposit, ad, add-on) with the same states: `CREATED → PENDING → CONFIRMED → REFUNDED`, same webhook/idempotency, same ledger.
2. **Automate at least one rail end-to-end** (card via a gateway that is actually available in the operating country — decision needed, see §D). Keep OMT/Whish as an *assisted* rail with: a pending-payments SLA (e.g. 4 business hours), reference-code auto-matching where the provider offers a statement/CSV import, and admin bulk-confirm.
3. **Single admin inbox** "Needs my action": pending payments, payout requests, refunds, verifications, review moderation, disputes — ordered by age with SLA colors. Today these live on ~30 pages.
4. **Auto-approve rules** with caps for low-risk items (e.g. payout < $X for workers with ≥ N clean jobs; lead refunds for duplicates detected automatically); humans review exceptions only.

---

## Part B — Generate more revenue with minimal risk

Ranked by (impact × confidence) ÷ risk. Every item ships behind a flag and as an A/B or staged rollout.

| # | Lever | Expected effect | Risk control |
|---|---|---|---|
| 1 | **Light up automated card payments** (deposit, plans, credits, ads) | Removes the admin bottleneck; unlocks diaspora/abroad customers and company ad spend | Sandbox → 5% traffic → full; keep OMT/Whish as fallback; reconciliation canary must stay $0.00 |
| 2 | **Deposit-first booking by default** (instant booking where price is published) | Higher completed-job GMV on-platform, fewer no-shows, harder to bypass | Only for fixed-price services; clear refund policy; monitor cancel/dispute rate |
| 3 | **Annual prepay push** (pay 10 get 12, shown at renewal reminders 7/3/1 d) | Cash up front, lower churn | Pro-rate refunds policy; cap discount |
| 4 | **Free → Pro conversion funnel**: show "you missed N leads / ranked below M competitors" in dashboard, trial then auto-prompt | Moves free-listed workers to MRR | Don't hide the free listing; nudge only |
| 5 | **Limited-inventory Featured slots** + waitlist | Higher price per slot, scarcity | Hard cap enforced server-side; 30-day cancel |
| 6 | **Open ads to companies via the same checkout** (3 formats first, ROI dashboard already exists) | New B2B revenue with no worker-side cost | Pre-pay only (balance first, then spend); admin creative review before ACTIVE |
| 7 | **Lead → job conversion** (pipeline statuses new/contacted/quoted/won/lost; reminder to quote within SLA) | Workers see ROI → buy more credits; more fees | Pure UX, minimal money risk |
| 8 | **Invoice PDFs with VAT-ready lines** | Unlocks B2B/company customers and accountants; reduces support | Generated from existing numbered invoice rows |
| 9 | **Supply-side density**: concentrate on top 6 categories in the 2–3 cities with the most demand before expanding | Better match rate → more completed jobs | Use existing demand-growth/SEO docs; stop adding trades |
| 10 | **Price tests** on one variable at a time (Pro $29 vs $35; Featured $49 vs $59) | Finds willingness to pay | 2-week windows, guardrail on conversion drop > 15% |

**Do not do (yet):** new revenue streams, new ad formats, new locales, AI features, native-app monetization — each adds surface area before the core pillars are collecting automatically.

### Revenue KPIs (weekly review)

Collected revenue by pillar · on-platform job completion rate (reveals→completed) · effective take rate (fees collected ÷ GMV) · free→Pro conversion · trial→paid · monthly churn · lead→job conversion · ARPU · pending-payment age (p50/p95) · refund + dispute rate · unbacked-credit canary (must be $0.00).

---

## Part C — Plan to eliminate bugs and risks

### C1. Bug register → owner order (from the audit §7)

| Priority | Item | Action | Done when |
|---|---|---|---|
| **P0** | BUG-06 Google OAuth missing User FK | Add Auth.js `signIn` callback that upserts `User` (idempotent by email), link Account, backfill orphan sessions | Production-mode Google login + book + review works; e2e test added |
| **P0** | BUG-07 Demo-store writes in production | Finish W2 repo-seam flip for suggestions, analytics, review/lead mutations; add a guard that **throws in production if a demo store is touched** | `db:smoke` covers each path; no demo-store import reachable when `DEMO_MODE=false` |
| **P0** | Live checkout decision | Choose rail (§D); implement webhook signature + idempotency + replay protection | Real payment → CONFIRMED with zero admin action; canary stays $0.00 |
| **P0** | Production-mode run of the 4 role scripts (audit §5) | Execute against a seeded DB, log in a QA sheet | All ★ steps pass in production mode, not just demo |
| **P1** | Rate limiting per-instance | Move limiter to Redis (Upstash) for auth, OTP, lead, review, payment endpoints | Limits hold across 2+ instances in a test |
| **P1** | Media uploads are static | Cloudinary/S3 signed uploads, type/size/EXIF-strip checks, moderation queue | Worker can upload a real gallery image in production |
| **P1** | BUG-01/02/04/12 RTL & phone cluster | Replace physical CSS classes with logical ones; add ESLint rule so the ratchet only goes down; one-row mobile card; wrap/stack 11 tables | `rtl-ratchet` = 0, 375px Arabic visual pass clean |
| **P1** | BUG-10 Meilisearch | Delete integration (recommended) or wire + e2e it | One search path in production |
| **P1** | Reschedule (customer-facing) | Verify/implement with slot CAS + notifications | Booking test chain green |
| **P2** | BUG-03, 05, 08, 09 | Keyboard hints; trim homepage; verify iOS safe-area on device; route all pricing through `formatPrice` before any 2nd country | Mobile device pass done |
| **P2** | Invoice PDFs; support ticket admin queue; blog/help authoring | See Part B #8; build minimal queue UI for existing models | Tickets have status + SLA |
| – | BUG-11, BUG-13 | Expected / already mitigated | No action |

### C2. Risk register (beyond listed bugs)

| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| **Money integrity** (credit without cash, double-confirm, refund > paid) | Med / Critical | Keep settlement engine invariant; add property tests (random event orders); daily reconciliation job + alert if canary ≠ $0.00; webhook idempotency keys; refunds cannot exceed captured |
| **Admin bottleneck / fraud via manual confirmation** | High / High | Two-person rule above a threshold, audit log on every confirm, auto-match references, SLA dashboard (Part A4) |
| **Take-rate bypass** | High / High | Part A3 |
| **Secrets/keys** (VAPID, payment, DB) | Low / Critical | Boot-time `check:*` gates already exist; add secret scanning in CI and rotation runbook |
| **Authorization gaps in API routes** | Med / High | Test matrix: every route × every role must return 401/403 as expected (generated from the route list); fail CI on new unguarded route |
| **Privacy / PII** (masked numbers, guest bookings, OTP) | Med / High | Retention limits, data-deletion endpoint (also needed for app stores), mask in logs/Sentry, audit-log access to reveals |
| **Single-region DB, backups untested** | Low / Critical | Weekly restore drill from `BACKUP-STRATEGY.md`; documented RPO/RTO; PITR on managed Postgres |
| **Cron jobs silently failing** (reminders, expiry, wallet, retries) | Med / Med | Heartbeat per cron with alert on missed run; dead-letter for failed notifications |
| **Notification provider failure** (SMS/WhatsApp/email) | Med / Med | Delivery ledger already exists; add fallback channel order and cost cap |
| **Scope creep** (parked features re-enabled) | High / Med | Feature-flag register with owner and sunset date; no new flag without a metric |
| **Doc/code drift** (docs claim "Working", code is demo) | High / Med | Regenerate audit each release; docs gate in `test:all` already exists — extend to check status tables |
| **Single-country assumptions** (USD, Lebanon) | Low now / Med later | Freeze at one tenant until pillars are stable; CountryConfig seam before the second |

### C3. Quality gates (so bugs stop coming back)

1. **Release ladder:** `typecheck` → `lint:ci` → `vitest` → `test:e2e` (dev + prod build) → nightly `db:smoke` → **production-mode role-script smoke** (new, automated with Playwright against a seeded Postgres).
2. **Demo/production parity test:** run the same journey in both modes and diff outcomes; fail if a write path differs.
3. **Money tests are blocking:** settlement, fee snapshot, refund and payout chains must be green on every PR touching `src/lib/**/money|payments|settlement`.
4. **Staged rollout:** feature flag → staff → 5% → 25% → 100%, with automatic rollback on error-rate or canary breach (Sentry already wired).
5. **Definition of done** for any bug: failing test first, fix, test green, entry in the audit's bug table updated.
6. **Weekly bug triage** with severity SLA: Critical (money/auth/data loss) 24 h · High 7 d · Medium next sprint · Low backlog.

---

## Part D — Phased roadmap

| Phase | Weeks | Goal | Deliverables | Exit criteria |
|---|---|---|---|---|
| **0 – Decide** | 0–1 | Lock the model | Approve §A2 pricing sheet; choose payment rail; freeze new features; park list flagged | Written decisions in this doc; flags created |
| **1 – Make it real** | 1–4 | Production = demo | BUG-06, BUG-07, Redis limiter, uploads, production role-script pass | All P0 closed; production smoke green |
| **2 – Collect automatically** | 3–7 | Cash without admin | Gateway live for deposits/plans/credits; unified payment service; admin "needs action" inbox; reconciliation alert | ≥ 80% of payments confirmed with no human; canary $0.00 for 14 days |
| **3 – Simplify live pricing** | 6–10 | One price sheet | Migrate to Free/Pro/Business with grandfathering (existing workers keep price 90 days); remove category multipliers; two lead grades | Support tickets about pricing ↓; ARPU not down |
| **4 – Grow** | 9–16 | More revenue per visit | Deposit-first default, free→Pro funnel, annual push, limited Featured slots, ads for companies on the same checkout, invoice PDFs | KPI targets in Part B met on two consecutive months |
| **5 – Polish & expand** | 16+ | UX and mobile | RTL/phone cluster, mobile phase M0 leftovers, store launch | rtl-ratchet 0, device pass, store submission |

**Decisions needed from you**

1. **Payment rail:** which gateway can legally and practically serve the target country (Stripe is not available for Lebanese merchants; Tap / MyFatoorah / a regional PSP or a foreign entity may be required)? This is the single biggest unlock.
2. **Plan structure:** approve Free/Pro/Business, or keep four plans?
3. **Grandfathering policy** for existing paying workers.
4. **Which parked features** (if any) have real customer demand and should stay live.

---

## Appendix — What stays unchanged (already strong)

Settlement engine and $0.00 canary · immutable fee snapshots · CAS slot reservation · masked numbers + emergency bypass · bilingual/RTL foundation · review moderation + verified-purchase · 175+ vitest suites, E2E ladder and nightly DB smoke. The plan builds on these rather than replacing them.
