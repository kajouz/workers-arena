# WorkersArena — Enhancement Plan (Features & Workflow)

> **Living document.** The prioritized plan for *what to improve next*, on two axes — **features** (new capabilities) and **workflow** (how customers, workers, and admins move through the product). It is the companion to the state-of-the-art docs: [PRODUCT.md](PRODUCT.md) (what exists + the P0/P1/P2 roadmap), [BUSINESS-MODEL.md](BUSINESS-MODEL.md) (revenue), [selection-workflow.md](selection-workflow.md) (how selection works today), [booking-scheduling.md](booking-scheduling.md) (booking milestones), and [booking-take-rate.md](booking-take-rate.md) (take-rate sketch). Update it as items ship: tick `[x]` and move them into PRODUCT.md's inventory in the same change.

**Status legend** — 💡 new idea · 🔜 designed/sketched, not built · 🟡 partial (demo-mode or boundary gap) · ✅ shipped.

---

## 1. Baseline — what's already shipped (the launchpad)

The platform is further along than the roadmap's checkbox state suggests:

- ✅ **Booking M1–M4 complete** (both adapters): request → respond (quote ± deposit) → deposit checkout/webhook → reminder cron → reschedule → cancel with the 24h refund-policy window → inProgress/completed/noShow transitions; customer + worker UIs, `/bookings` lookup, admin funnel + dispute view, full audit + notification trail. See [booking-scheduling.md](booking-scheduling.md) and [selection-workflow.md](selection-workflow.md).
- ✅ **Payments infrastructure** (simulated/Stripe-gated): deposit Payment rows, idempotent checkout minting, webhook confirm, provider refunds, `WA-YYYY-NNNNN` invoices for signed-in customers, campaign purchase path (create → checkout → ACTIVE) with admin refunds + credit-note voiding + `campaignRefunded` email, all Prisma-backed in real mode. The admin campaign **Refund button is now a two-step confirm** (`RefundDialog` in `src/components/dashboard/refund-dialog.tsx`, extracted from the admin dashboard): step 1 collects the refund reason (Continue disabled until non-empty), step 2 shows an irreversible-action summary — **campaign name, amount (formatted), and the exact reason** — with Back (preserves the reason, no action) and a single "Confirm refund · $amount" commit button that fires `refundCampaignAction`; Cancel/Esc/overlay discard with no side effects, and the dialog locks while the provider refund is in flight. Mirrors the plan-change confirm pattern so an irreversible money action needs a deliberate commit. i18n `admin.refund*` keys EN+AR; component tests in `tests/refund-dialog.test.tsx` (two-step happy path, Back-preserves-reason, cancel-never-fires).
- ✅ **Monetization foundations**: worker subscriptions (incl. annual plans), self-serve ads (PENDING→ACTIVE gate), admin revenue cards (net-collected campaign totals), booking-funnel admin card.
- ✅ **Platform**: 4-role auth (demo + Auth.js), EN/AR i18n + RTL, notifications (inbox + email/SMS/push/WhatsApp seams), activity feed with `ACTION_CODES`, cron engines, E2E + prisma chain tests, `db:smoke`.

**Still-open boundaries documented in the existing docs** (these are the first places to look for "what's next"): live payments (P0), the rest of the W2 repo seam, `/company` invoices list + ad rotation still demo-store, review-moderation queue, OAuth linking, and the whole mobile plan.

---

## 2. Workflow enhancements — make the journeys better

Improvements to how customers, workers, and admins *move through* the product. Ordered by leverage.

### 2.1 Discovery phase (customer picks on better signals)

- [x] **Response rate + "Free this week" on search cards & profiles** — ✅ shipped (W1). `responseRate` (from `computeResponseRate` / shared `responseRateFromCounts`) and `availableThisWeek` (from `hasFreeSlotsThisWeek`, a 7-day AVAILABLE-slot window) are stamped on the `Worker` type by both adapters — demo via `withDemoSignals` in `repo.ts`, prisma via the batched `stampWorkerSignals` in `prisma-repo.ts` — and rendered as chips on `WorkerCard` + the `ProfileHero` meta row (i18n keys `worker.responseRate` / `worker.freeThisWeek` EN+AR). Unit tests + a `db:smoke` section assert the stamps against the live DB. *Why: customers select on responsiveness and availability, not just rating.*
- [ ] **💡 Price benchmarks per category + city** — a "typical quote for a leaking sink in Riyadh: SAR X–Y" line on profiles/search, computed from accepted quotes (`Booking.quote` where status in confirmed/inProgress/completed). *Why: anchors expectations and cuts quote-shock declines at the response phase.* Small.
- [ ] **🟡 Verified-purchase-weighted reviews** — `verifiedPurchase` exists on `Review` but isn't enforced or weighted; fold it into the P0 review-moderation queue (approve/reject, flag spam). Medium.

### 2.2 Request phase (fix the structural weakness)

- [ ] **💡 Multi-candidate "request quotes from up to 3 workers"** — today the customer commits to ONE worker and restarts from scratch on a decline. Let a customer invite up to 3 workers to quote the same job; each responds with a quote; the customer picks a winner. **Designed** — [multi-candidate-quotes.md](multi-candidate-quotes.md): a new `QuoteRequest` job container whose invited workers ARE its `Booking` rows (`QUOTING`/`QUOTED`, slot-less), the winner claims a slot through the existing CAS, losers auto-DECLINE. **The single highest-leverage workflow change — converts a lottery into a marketplace.** Large (but reuses the Booking rails — no new payments logic).
- [ ] **💡 Request SLA (nudge + auto-expire)** — a `REQUESTED` booking can sit forever, silently hurting both sides. Nudge the worker at N hours; auto-decline at M hours (slot frees back to AVAILABLE — the mechanics already exist in `cancelBooking`). *Why: less dead air, fewer stale slots.* Small–medium.
- [ ] **💡 Guest phone OTP** — guests are phone-keyed with no verification; a one-time OTP raises trust enough that workers stop declining "anonymous" requests, and it de-risks M3 deposits for guests. Medium.

### 2.3 Response & negotiation phase

- [ ] **💡 Counter-offers / per-booking chat thread** — quotes are one-shot today. Add a counter-offer action or (better) the P1 **customer ⇄ worker chat** keyed on `Booking.id`, so negotiation happens in the audit trail instead of WhatsApp. Medium–large.
- [ ] **💡 Customer confirms completion** — workers self-mark COMPLETED today. Let the customer confirm (or auto-confirm after a grace window) — the most credible trust fix, and it cleans up fake-COMPLETED noise that pollutes the funnel, ratings, and no-show stats. Small–medium.

### 2.4 Trust & transparency

- [x] **Disclose the cancellation/refund policy before booking** — ✅ shipped. The `BOOKING_CANCEL_REFUND_WINDOW_MS` policy (from `bookingCancelRefundDue`) is now shown as a shield-note card on the BookingDialog details step and as a compact note on the customer booking row whenever a deposit is at stake — both with the hours interpolated from the shared constant so the copy can never drift from the logic. i18n keys `booking.cancelPolicyTitle/Body/Row` (EN + AR). *Why: prevents refund disputes and builds trust.*
- [ ] **💡 Customer-facing dispute view** — the admin dispute view (`/admin/bookings/[number]`) reconstructs the timeline; customers currently have no equivalent. A read-only timeline on the customer `/bookings` row ("what happened and when") closes the loop. Small–medium.
- [x] **Admin worker-management audit — ✅ shipped** — a dedicated card on `/admin` (`WorkerManagementTable` in `src/components/dashboard/worker-management-table.tsx`, fed by `getAllWorkers` — stamped by both adapters) listing every worker with a **Plan column** (colored badge per tier, Enterprise gets the emerald fee-waived treatment via `isPlanFeeExempt`) and a **Status column** (Active / Expiring soon / Expired), plus Enterprise audit chips (N live · M expired — live = fee-waived AND searchable), a name/category/city **search box** + **plan-tier sort** (mirroring the /search UX), a **fee-waived switch**, a per-row **View search result** deep link (Enterprise rows → `/search?feeWaived=1&q=<name>` — proving the exemption surfaces; other rows → plain `?q=<name>`), and — the latest — **URL-persisted audit state**: the admin page server-parses `/admin?wm=<query>&sort=<planAsc|planDesc|name>&feeWaived=1` into initial props (the search page's pattern, no `useSearchParams`/Suspense) and the client syncs every change back via `router.replace` (defaults omitted), so an audit view is shareable and survives reloads. i18n `admin.*` keys EN+AR; tests in `tests/worker-management-table.test.tsx` (16 — incl. the URL round-trip via a mocked `useRouter`). **CSV export**: the control row's **Export CSV** button downloads the *current* filtered/sorted view (name + city, category, plan, status — localized like the table, RFC-4180 quoted, filename `worker-management-<date>.csv`), so the offline audit always matches what the admin is looking at. **Inline plan change**: the Plan cell is an invisible select overlaid on the plan badge — choosing a new tier **stages it in a confirm dialog** ("Change {name}'s plan from {from} to {to}? The {to} plan is {price}/month.", prices from the same PLANS catalog the badges render), and only the dialog's **Apply** fires `changeWorkerPlanAction` (admin-only server action → seam `changeWorkerPlan` → demo mutation / `prismaChangeWorkerPlan` upsert, shared `applyPlanChange` pure logic); **Cancel / Esc / overlay / X discard the stage with no action** — an accidental tier change can never alter a subscription instantly. The dialog is **keyboard-first end to end**: Radix `onOpenAutoFocus` focuses the Apply button on open (so the primary action needs zero tabbing), Enter on that focus commits via native button activation, and Esc closes through the same guarded `onOpenChange` (locked while in flight) — asserted in the component test with `@testing-library/user-event` keyboard interactions (focus-on-open, `{Enter}` commits with the right args, `{Escape}` cancels with the row untouched). On Apply it toasts "Plan updated" and refreshes the page. An **expired subscription is reactivated** for one monthly period so the correction takes effect in public search (the expired status hides the worker); an active one keeps its expiry; no invoice (a correction, not a purchase). Every change is **audited** — the seam logs `ADMIN_PLAN_CHANGED` (new ACTION_CODES entry) to the activity feed with the acting admin's identity (`actorId` = the real session user id, the ActivityLog FK — the action threads it from `session.id`) and bilingual from → to copy ("Platform Admin changed Bilal Mansour's plan: Enterprise → Premium" / "من … إلى …" in AR), rendered in Recent activity under the Worker filter with a Plan badge — the same trail refunds and verification decisions leave. Covered by `db:smoke` (M5 section: tier swap on bilal + reactivation of expired tariq → visible in search, the `ADMIN_PLAN_CHANGED` row asserted against the live ActivityLog with the seeded admin's FK, seeded rows + audit entries restored), the demo-seam audit unit test (`tests/plan-change-audit.test.ts`), component tests (select value per row, action args, no-op on unchanged plan), and the **E2E smoke** (dev + production-build passes: demote bilal Enterprise → Premium via the /admin select, assert the audit feed entry, his profile drops the fee-waived badge, and a fresh SSR render of `/search?feeWaived=1` no longer contains him — then revert and assert both surfaces surface him again). *E2E assertion note: the demo WORKERS store is in-memory and Next keeps route-handler vs server-component module instances separate, so `/api/workers` (which the /search client refetches on mount) would show the stale plan in demo mode — the E2E asserts where the change is deterministic (the /admin table, the profile badge, and the SSR render, all server-component context); in real mode all surfaces read the same DB.* *Why: admins can fix a mis-tiered subscription in one click from the audit row — no separate page, no support ticket, and every tier correction leaves an explainable trail.*

---

## 3. Feature enhancements — capabilities to build

### 3.1 Monetization (highest revenue leverage)

- [x] **Booking take rate — ✅ shipped per [booking-take-rate.md](booking-take-rate.md)** — the headline lever in BUSINESS-MODEL §5.2: `computePlatformFee` (7% bps, SAR 5/$5 min, SAR 300/$300 cap, Enterprise exemption via `isPlanFeeExempt`) + `platformFee`/`platformFeeRateBps` columns on `Booking` + migration `20260812075914_booking_platform_fee`, fee stamped at accept-with-quote inside the tx (both adapters — demo reads the worker's plan, prisma reads it in-tx), "you receive X · platform fee Y" live preview in the RespondDialog (waived line for exempt plans) + the "includes platform fee · worker receives" transparency line on the customer booking row, the fee/waived line in the confirmation email (renderBookingEmail — booking-take-rate §7.4), a `feeWaivedOnly` search filter (narrow to Enterprise workers — same FEE_EXEMPT_PLANS source as the card badge, wired through both adapters + /search UI + URL param), fee-waiver hints at the point of checkout (profile CTA in ContactCard + the BookingDialog summary step, both using the same keys as the badge/booking row), i18n keys EN+AR, tests (unit calc, adapter stamps incl. the exempt path, prisma mapper, db:smoke assertion, chain/email parity demo+prisma, search filter demo+where translation). Revenue visibility: the /admin **Platform fees** card (`getPlatformFeeStats` — gross / refunded / net / avg per booking over 30 days, shared `tallyPlatformFeeStats` in both adapters, live Booking rows in real mode, db:smoke cross-checks the adapter against a direct SQL sum).
- [x] **Worker payouts — ✅ shipped per [payouts.md](payouts.md)** — net earnings (`quote − platformFee`) credit a `WorkerLedgerEntry` **inside the completion transition tx** (idempotent via `@@unique([bookingId])`, both adapters); `getWorkerBalance` / `requestPayout` / `decidePayout` / `getWorkerPayouts` / `getPendingPayouts` seams; the worker dashboard **Payouts** card (available/pending balance, withdraw dialog capped at available − pending, history) and the /admin **Pending payouts** queue (approve → settled debit, reject → voided); signed minor-unit ledger with per-entry `balanceAfter` audit; EN/AR i18n + demo tests + db:smoke lifecycle. *Why: closes the worker earning loop the take rate opens — jobs → net earnings → withdrawable balance.*
- [ ] **🔜 Live payments (P0, prerequisite for real revenue)** — Stripe first: subscription auto-renew, deposit checkouts, campaign prepayment. The provider seam (`src/lib/payments/`), webhook, and simulated fallback already exist — real money needs `STRIPE_SECRET_KEY` wiring end-to-end, then MyFatoorah/Tap for the MENA consumer base. *Unlocks every monetization row below.*
- [ ] **💡 Sell featured slots + emergency a la carte** — `featured`/`emergency` are data flags today; make them purchasable add-ons (e.g., $49/category/mo, $9/mo emergency) on the existing subscription billing path. New SKUs, zero new infra.
- [ ] **💡 Paid verification tiers** — Basic (ID) / Professional (license + background check), ~$9–19/check, 12-month validity, badge in search; the admin review queue already exists. High-margin trust product for the region.
- [ ] **💡 Leads marketplace** — meter lead credits for free/basic tiers (the contact-card reveal is the enforcement point); the roadmap's "lead pipeline" (new → contacted → quoted → won/lost) makes leads measurable and sellable.

### 3.2 Close the documented boundaries

- [ ] **🟡 Wire `/company` invoices list + ad rotation to prisma** — `getInvoices` (the minted `WA-*` purchase invoices never render on the company list in real mode) and `getActiveAdsFor` (rotation stays demo-store) are the two documented real-mode gaps in [PAYMENTS.md](PAYMENTS.md). A real-mode purchase should be *visible* end-to-end.
- [ ] **🟡 W2 rest of the repo seam** — cities, suggestions, analytics, and all mutations (reviews, leads, subscriptions, campaigns, ads, notifications, activity, verification) still run on the demo dataset; add the trigram search index + Redis for hot queries.
- [ ] **🟡 OAuth user linking + email verification + password reset** — Google sign-in lacks the `signIn` upsert; the FK constraint is documented in ARCHITECTURE.md.
- [ ] **🟡 Cloudinary uploads** — gallery/certifications/portfolio/company logos/blog covers via the `Media` model (currently placeholder data).
- [ ] **🟡 Production hardening** — argon2, Redis rate limiting, CSP, Sentry, structured logging, CI (typecheck + tests + E2E on PR), ESLint/Prettier.
- [ ] **🟡 Admin review-moderation queue** — approve/reject + `verifiedPurchase` + spam reporting (P0 checklist item; also feeds §2.1's weighted reviews).

### 3.3 Growth & retention

- [ ] **💡 Referral + promo codes** (`Referral`/`PromoCode` models exist) — worker referral credits (month free), customer booking-fee discounts after N jobs.
- [ ] **💡 Blog + Help center + support tickets** (`BlogPost`/`HelpArticle`/`Ticket` models exist) with an admin ticket view.
- [ ] **💡 Invoice PDFs + VAT line items** (`Invoice.pdfUrl`) — Saudi 15% / UAE 5% tax-ready invoices; invoice-history portal.
- [ ] **💡 Advanced analytics** — search → profile → lead → booking conversion funnels, cohort tables, CSV/PDF export, per-worker earnings.
- [ ] **💡 Map search view** — browse workers on OpenStreetMap with a radius filter (the embed + geodata already exist).

### 3.4 Differentiation / AI (P2)

- [ ] **💡 AI review moderation** (`Review.aiFlags`), **AI profile assistance** (bio/pricing/category suggestions), **AI concierge** ("find me an emergency plumber in Riyadh tonight"), **video profiles**, **trust-program tiers** (ID/license/background-check badges), **progressive subscription gating**, **more locales** (Urdu/Hindi/Filipino/French — the `Language` model supports it).

### 3.5 Mobile (already fully planned)

- [ ] **🔜 PWA hardening → Capacitor → store launch** — the entire strategy, architecture, parity matrix, rollout phases, and store checklist live in [mobile-architecture.md](mobile-architecture.md) and PRODUCT.md §5. Sequencing: offline shell + deep links → Capacitor shell + FCM/APNs providers → store launch (TestFlight + internal testing).

---

## 4. Prioritized execution plan (next 90 days)

| Wave | Theme | Items | Outcome |
|---|---|---|---|
| **W1 — Trust signals (wk 1–2)** | Workflow quick wins | §2.1 response-rate + free-this-week chips · §2.4 disclose cancellation policy · §2.2 request SLA | Customers select on responsiveness; fewer stale requests |
| **W2 — Money (wk 3–6)** | Revenue rails | §3.2 `/company` invoices + ad rotation on prisma · §3.1 live payments (Stripe) · §3.1 take rate (booking-take-rate.md) | Marketplace collects a fee; purchases visible end-to-end |
| **W3 — Marketplace (wk 7–10)** | Trust & negotiation | §2.3 customer-confirms-completion + counter-offers · §2.2 multi-candidate requests · §2.1 weighted reviews + moderation queue | Selection stops being a lottery; ratings become trustworthy |
| **W4 — Growth (wk 11–13)** | Acquisition & support | §3.3 referrals + promo codes · blog/help/tickets · §3.2 hardening + CI · PWA offline shell | Self-serve acquisition, support, and mobile readiness |

**Sequencing logic:** W1 is nearly free (the signals already exist) and improves the funnel immediately. W2 is the revenue engine — the take-rate sketch is complete and waiting, and it's blocked only by the live-payments wave that precedes it. W3 is the trust layer that makes the marketplace credible enough to charge for. W4 compounds growth and starts the mobile path. All waves keep customers free — fees are charged to supply/companies, not bookers (BUSINESS-MODEL §6).

## 5. Success measures

- **Workflow:** leads → booking conversion, request-response time (median), request auto-expiry rate, decline rate, cancellation rate, completed-job rate, rating trust (verified-purchase share).
- **Features:** take-rate revenue, GMV, deposit acceptance rate, activated campaigns, MRR/ARPU/renewal rate, referral signups.

## 6. Files touched (for the W1 quick wins — the fastest path to value)

| Change | Files |
|---|---|
| `responseRate` + `availableThisWeek` on `Worker` | `src/lib/data/types.ts` (✅ shipped W1) |
| Availability check (AVAILABLE slot in next 7d) | `src/lib/data/booking-ui.ts` — `hasFreeSlotsThisWeek` + `responseRateFromCounts` |
| Stamp on reads (demo + prisma) | `src/lib/data/repo.ts` (`withDemoSignals`), `src/lib/data/prisma-repo.ts` (`stampWorkerSignals` — batched) |
| UI chips | `src/components/shared/worker-card.tsx`, `src/components/worker/profile-hero.tsx` |
| i18n | `src/lib/i18n/translations/en.ts` + `ar.ts` (`worker.responseRate` / `worker.freeThisWeek`) |
| Tests | `tests/booking-ui.test.ts` (unit) + `tests/search.test.ts` (seam stamps) + `db:smoke` W1 section |
| Cancel-policy disclosure | `src/components/worker/booking-dialog.tsx` (details step) + `src/components/bookings/booking-row.tsx` + `booking.cancelPolicy*` keys (✅ shipped) |

---

**Related docs:** [PRODUCT.md](PRODUCT.md) · [selection-workflow.md](selection-workflow.md) · [booking-scheduling.md](booking-scheduling.md) · [booking-take-rate.md](booking-take-rate.md) · [BUSINESS-MODEL.md](BUSINESS-MODEL.md) · [PAYMENTS.md](PAYMENTS.md) · [mobile-architecture.md](mobile-architecture.md)
