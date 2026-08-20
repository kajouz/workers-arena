# WorkersArena — Product & Features Plan

[← Back to docs index](README.md)

> **Living document.** This file is the single source of truth for what the product *is*, what it *could become*, and how we get there (web + mobile). Update it as features ship — every checklist item should reflect reality, not aspiration. See [How to keep this document fresh](#7-how-to-keep-this-document-fresh).

---

## 1. Product overview

**WorkersArena** is a bilingual (English LTR / Arabic RTL) marketplace SaaS where customers find, compare, and hire trusted professional workers — plumbers, electricians, AC technicians, carpenters, and 20+ trades — while workers grow their business with paid subscriptions and companies advertise to a qualified audience.

- **Platform:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma · PostgreSQL
- **Current maturity:** production-ready web demo (embedded dataset, `DEMO_MODE=true`) with a complete PostgreSQL schema and a documented seam (`src/lib/data/repo.ts`) for flipping to real data
- **Markets:** Gulf (KSA/Emirates) + Morocco dataset today; Arabic RTL first-class
- **Mobile:** PWA foundation shipped (manifest + service worker + web push); native iOS/Android planned (see §6)

### Status legend

| Mark | Meaning |
|---|---|
| ✅ | Implemented & tested (web) |
| 🟡 | Partial — works in demo mode but needs production wiring (real DB/payments/upload) |
| 🔜 | Schema/architecture ready, UI/API not built yet |
| 💡 | Proposed idea — not started |
| 📱 | Mobile-relevant (see §6 parity matrix) |

---

## 2. Current feature inventory (as of v1.0)

### 2.1 Bilingual platform & UX
- ✅ **i18n EN/AR with full RTL** — server-side detection (`wa_locale` cookie → `Accept-Language`), one-click switch, logical CSS everywhere, Arabic font (Cairo) + Inter, dictionary parity enforced by test
- ✅ **Dark mode** — SSR from `wa_theme` cookie (no flash, no hydration warnings), persisted toggle
- ✅ **Responsive web app** — mobile-first layout, installable PWA (manifest + PNG/maskable icons + app shortcuts), service worker registered on every page
- ✅ **Accessibility** — Radix primitives, aria labels, `role=status` loading states, focus rings
- ✅ **Toasts, skeletons, micro-interactions** — Framer Motion entrances, hover states throughout

### 2.2 Search & discovery
- ✅ **Fuzzy search** with Arabic normalization (tashkeel stripping, alef/hamza/ta-marbuta/ya unification)
- ✅ **Autocomplete suggestions** (`/api/search/suggest`) — categories, workers, cities
- ✅ **Filters** — category, city, area, min rating, price band, min experience, verified / featured / emergency / open-now / availability
- ✅ **7 sort modes** — relevance, rating, reviews, price ↑/↓, experience, **nearest** (haversine to city center)
- ✅ **W1 trust signals** — search cards + profiles show the worker's **response rate** (share of answered requests, computed from bookings) and a **"Free this week"** availability chip (an AVAILABLE slot exists in the next 7 days), stamped by both adapters (demo + prisma) — see [docs/ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) §2.1
- ✅ **Search analytics** — `SearchLog` model + admin search-trends card
- End-to-end selection flow (discovery → request → worker response → execution): **[docs/selection-workflow.md](selection-workflow.md)** — the 4 phases, exact files/functions, trust guarantees, sequence diagram

### 2.3 Worker profiles
- ✅ Gradient cover art, bilingual name/tagline/bio, gallery
- ✅ Services & pricing (`ServiceItem`), certifications, working hours
- ✅ **Service-area map** (OpenStreetMap embed), contact card (call / WhatsApp deep link / email / website / socials)
- ✅ Rating distribution, review form (adds + notifies worker), related workers
- ✅ **QR code, share, favorite** (persisted zustand), JSON-LD schema, view tracking

### 2.4 Dashboards & roles (4 roles)
- ✅ **Customer** — search, profiles, reviews, favorites, leads
- ✅ **Worker dashboard** — stats, views chart, subscription status + **renewal dialog**, verification banner (submit/resubmit), invoices, notifications
- ✅ **Admin dashboard** — KPIs, revenue chart, category bars, plan donut, top workers, search trends, **verification queue + approve/reject**, alerts, **live activity feed**, **verification funnel**, full activity history (`/admin/activity`), push-subscription manager (`/admin/push-subscriptions`)
- ✅ **Company dashboard** — ad campaigns (create via `campaign-builder`), impressions / clicks / CTR, budgets, invoices, 8 ad types

### 2.5 Advertising
- ✅ **8 ad formats** — banner, slider, featured card, sponsored search, sponsored category, popup, native, video
- ✅ Sponsored slots on homepage + footer, placement/category/city targeting, rotation, impression + click tracking (`/api/ads/[id]/click`)
- ✅ **Self-serve ad purchasing** — campaigns start PENDING and only go ACTIVE after the checkout/webhook confirms (`createCampaign` + `confirmCampaignPayment`, `docs/PAYMENTS.md`); demo/simulated today, real gateway wiring pending

### 2.6 Auth & security
- ✅ Demo cookie sessions (4 roles) — zero-infra navigation
- ✅ **Auth.js v5** (Credentials + Google OAuth), JWT sessions, role/hue stamped into session, `getSession()` seam delegates to `auth()` when real mode
- ✅ PBKDF2 password hashing (demo-grade; swap to argon2 in prod), `timingSafeEqual` verify
- ✅ Role-guarded pages, sanitization on user input, in-memory rate limiter, CSRF-cookie posture, `poweredByHeader: false`
- ✅ **Email/Phone/WhatsApp verification** — OTP generation, 6-digit input, cooldown timer, status badges, rate limiting (3 per 10 min)
- 🟡 **OAuth user linking** — Google sign-in lacks a `signIn` callback that upserts the User row (FK constraint documented in `docs/ARCHITECTURE.md`)

### 2.7 Payments & billing
- ✅ **Modular gateway architecture** (`docs/PAYMENTS.md`): Stripe · PayPal · MyFatoorah · Tap · bank transfer · cash
- ✅ **Lebanon-first payments** — OMT and Whish manual providers (agent-based, admin-confirmed)
- ✅ **Multi-currency support** — LBP, USD, SAR, EUR, GBP with exchange rate caching
- 🟡 **Live integration** — schemas for `Payment`/`Invoice`/`Subscription` (minor units, statuses, provider refs) are ready; no live checkout yet
- ✅ Demo renewal flow generates invoices + notifications (deterministic, test-covered)

### 2.8 Notifications (multi-channel)
- ✅ In-app inbox (dual adapter: demo file store / Prisma `Notification`)
- ✅ **4 outbound channels** — email (console/SMTP/Resend), SMS (console/Twilio), push (console/web-push+VAPID), WhatsApp (console/Meta Cloud API) — lazy-loaded providers, never throw
- ✅ **Subscription lifecycle reminders** — 7 / 3 / 1 day reminders, then expiry → deactivation + admin alert + audit log (`/api/cron/reminders`)
- ✅ **Web Push subscriptions** — register/unregister, dual owner stamping (demo `ownerId` vs real `userId` FK), admin manager, prune cron (`/api/cron/push-prune`)
- ✅ **Admin activity feed** — structured `ACTION_CODES`, `ActivityLog` FK to actor, retention cron (`/api/cron/activity-prune`)

### 2.9 UI/UX improvements
- ✅ **Loading states** — button spinners, search progress bar, 10 skeleton variants (card, avatar, image, table, chart, list)
- ✅ **Empty states** — 11 illustrated components for search, favorites, forum, reviews, bookings, notifications, documents, errors
- ✅ **Micro-interactions** — animated heart with burst particles, press-scale, fade-in, staggered lists, slide indicators, animated numbers
- ✅ **Bottom tab navigation** — mobile 5-tab bar with animated indicator, badge support, safe area insets
- ✅ **Dark mode polish** — radial gradient background, enhanced elevation shadows, smooth 250ms theme transition
- ✅ **Onboarding tooltips** — step-by-step guided tour with spotlight overlay, progress bar, localStorage persistence
- ✅ **Touch targets** — 44px minimum for all interactive elements (WCAG 2.5.5)
- ✅ **Reduced motion** — respects prefers-reduced-motion media query

### 2.10 Production features
- ✅ **Geolocation Near Me** — Haversine distance calculation, 11 city coordinates, 6 radius presets (2-100km), location permission handling
- ✅ **Worker earnings dashboard** — monthly chart, transaction history, payout methods (OMT/Whish/Bank), withdrawal flow
- ✅ **Dispute resolution** — 6 categories, 2-step form, evidence upload, status tracking, timeline view
- ✅ **Performance audit** — Lighthouse helper with Core Web Vitals (LCP/FID/CLS/INP/TTFB/FCP) monitoring and scoring
- ✅ **SEO audit** — 20+ checks: meta tags, structured data, headings, images, links, accessibility
- ✅ **Arabic translations** — 150+ new keys for verification, earnings, disputes, near-me, SEO content, analytics
- ✅ **SEO city pages** — dynamic /cities/[city] routes with JSON-LD, breadcrumbs, trade grid, local content
- ✅ **Analytics** — Plausible + GA4 integration with privacy consent banner and event tracking
- ✅ **CI/CD pipeline** — GitHub Actions with lint, typecheck, tests, build, E2E, Lighthouse audit, Vercel deploy

### 2.11 Platform / infra
- ✅ REST APIs (workers, categories, search suggest, notifications, ads, push, health, forum), Server Actions
- ✅ SEO — sitemap, robots, JSON-LD, metadata/OG, manifest, city landing pages with structured data
- ✅ `output: standalone` for Docker, isolated E2E dist dirs, demo stores gitignored
- ✅ **Testing** — 958+ vitest tests + 19 Playwright E2E tests: search engine, i18n parity, notifications, subscriptions, verifications, auth, HTML nesting, **E2E hydration smoke** (dev + prod matrices, hydration-error guard, interactive flows), PWA offline features, offline queue replay, analytics queue
- ✅ **WCAG 2.1 AA audit tools** — client-side accessibility auditor with score calculation
- ✅ **Voice commands** — EN/AR voice navigation with 15+ built-in commands
- ✅ **Keyboard shortcuts** — global shortcuts for navigation and actions
- ✅ **Print-friendly styles** — optimized CSS for printing pages
- ✅ **Social media sharing** — Facebook, Twitter, LinkedIn, Email share buttons
- ✅ **QR codes** — worker profile QR codes with download
- ✅ **CSV/PDF/JSON export** — analytics data export in multiple formats
- ✅ **Bulk operations** — admin bulk actions with confirmation dialogs
- ✅ **Drag & drop uploads** — file upload with validation
- ✅ **Enhanced infinite scroll** — Intersection Observer based hooks
- ✅ **Lazy loading** — images, videos, content with skeleton fallbacks
- ✅ **Route prefetching** — prefetch on hover with batch support
- ✅ **Enhanced SW** — periodic background sync for fresh content
- ✅ **Sentry integration** — error tracking with optional @sentry/nextjs
- ✅ **Real-time analytics** — live dashboard with BroadcastChannel
- ✅ **Meilisearch** — advanced search with typo tolerance
- ✅ **Email service** — SendGrid/Resend integration with weekly digests
- ✅ **Forum** — Q&A with voting, categories, answers
- ✅ **Premium badges** — verified, pro, enterprise tiers
- ✅ **WhatsApp integration** — instant contact with pre-filled messages
- ✅ **Portfolio gallery** — before/after photos with lightbox
- ✅ **Help center** — FAQ, articles, support tickets
- ✅ **Referral system** — referral codes with rewards tracking
- ✅ **Promo codes** — discount code input with validation
- ✅ **Certificate verification** — worker certificates with details dialog
- ✅ **Availability calendar** — visual calendar with time slots
- ✅ **Price comparison** — side-by-side worker comparison
- ✅ **Real-time messaging** — chat window with typing indicators
- ✅ **Offline forms** — IndexedDB queue with auto-retry
- ✅ **OCR document verification** — Tesseract.js for client-side OCR
- 🟡 **Production swap steps documented** in `docs/ARCHITECTURE.md` (repo seam → Prisma, Redis, Cloudinary, Sentry)

### 2.10 Data model (ready, mostly unused by UI)
The Prisma schema ships **40+ models**. Fully used by UI: `User`, `Worker`, `Category`, `City`, `Area`, `Subscription`, `Invoice` (demo), `Review`, `Favorite`, `Lead`, `Notification`, `PushSubscription`, `ActivityLog`, `SearchLog`, `Advertisement`, `AdCampaign`, `Company`, `ServiceItem`, `Certification`, `WorkingHour`, `PortfolioItem`, `WorkerView`, NextAuth tables.
**Schema-ready, no UI/API yet:**
- 🔜 `BlogPost` + `HelpArticle` — blog & help center
- 🔜 `Ticket` — support tickets
- 🔜 `Referral` + `PromoCode` — growth loops
- 🔜 `Media` — Cloudinary-backed media library
- 🔜 `Setting`, `Language` — runtime config & future locales
- 🔜 Review moderation fields (`status`, `verifiedPurchase`, `aiFlags`)

---

## 3. Improvement roadmap — Web

> The prioritized enhancement plan (features + workflow, waves W1–W4) lives in **[docs/ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md)** — tick items there and here as they land.

Priorities are tagged **P0** (blocking production launch), **P1** (high product value), **P2** (differentiation / AI).

### 3.1 P0 — Production foundations
- [x] **Flip the repo seam to Prisma — W1: catalog reads** — `getCategories`, `getWorkerBySlug`, `getWorkers` (search), `getFeaturedWorkersList`, `getRelated` query the schema via `src/lib/data/prisma-repo.ts` when `DEMO_MODE=false` + `DATABASE_URL` (see docs/ARCHITECTURE.md §10). Mappers unit-tested + smoke-tested against local Postgres.
- [ ] **Flip the repo seam to Prisma — W2: rest** — suggestions, analytics, and all mutations (reviews, leads, subscriptions, notifications, activity, verification) still run on the demo dataset. Add trigram search index + Redis for hot queries. *(Cities are wired — see ENHANCEMENT-PLAN §3.2; campaigns/ads already prisma-backed.)*
- [ ] **Live payments (Stripe first)** — checkout session → `Payment` + `Invoice` rows → webhook → subscription/`AdCampaign` activation. Then PayPal/MyFatoorah/Tap.
- [ ] **Cloudinary uploads** — worker gallery, certifications, portfolio, company logos, blog covers (`Media` model).
- [ ] **OAuth user linking** — `signIn` callback upserts `User` so Google sessions stamp real FKs (closes the documented constraint).
- [x] **Email verification + password reset** flows.
- [x] **Production hardening** — argon2 hashing, Redis rate limiting, CSP headers, Sentry error monitoring, structured logging, CI (typecheck + tests + E2E on PR), ESLint/Prettier.
- [ ] **Admin moderation queue for reviews** — approve/reject, verified-purchase flag, spam reporting.

### 3.2 P1 — Core marketplace value
- [ ] **Booking & scheduling** — worker calendars, time slots, customer booking requests, confirm/cancel, reminders (biggest gap today: leads are manual). **Data model applied** — migration `20260810084347_booking_scheduling` (BookingSlot/Booking/BookingEvent) + demo seed rows. **M1 core shipped** — demo adapter (`src/lib/data/bookings.ts`) with createBookingRequest/respondToBooking (slot reservation, overlap guard, events, notifications), server actions (`src/app/actions/bookings.ts`), booking notification types (`20260810085511_booking_notification_types`), tests. **Customer UI shipped** — BookingDialog (service → slot → details steps), ServicePicker, SlotPicker, shared BookingStatusBadge, `/bookings` page (session email + guest phone lookup), full `booking.*` i18n keys EN/AR + the missing `notifications.types` booking labels (see [docs/booking-customer-ui.md](booking-customer-ui.md)). **Worker UI shipped (M1 complete)** — `BookingsPanel` (Requests/Upcoming/Past tabs + counts + empty states) on `/dashboard`, worker `BookingRow`, `RespondDialog` (accept with quote prefilled from `priceMin` + deposit toggle | decline with reason), and the static "96%" replaced by a **computed response rate** (`computeResponseRate`). The full request→respond loop is now interactive on both sides. **M2 availability shipped** — `generateSlots` from the weekly `WorkingHour` template (idempotent, overlap-safe, 24/7 emergency handling) + `AvailabilityPanel` on the dashboard (next-7-days slot list, block/unblock toggles, generate button, legend). **W2 shipped** — the whole booking seam on Prisma (`prisma.$transaction` + row-lock CAS): create/respond/generate/block + transition/cancel. **M4 ops shipped** — the reminder cron ("job starts tomorrow", `Booking.lastReminderSent` CAS stamp) and the lifecycle (inProgress/completed/noShow transitions + cancellation with slot freeing, reason/actor stored, events + notifications), with worker-side action buttons on the dashboard panel. **Customer lookup wired (W2 complete)** — `prismaGetCustomerBookings` serves the `/bookings` page in real mode (email case-insensitive + phone separator-normalized, verified by `db:smoke`). **M3 deposits shipped** — accept-with-deposit creates a `Payment` row linked by `booking.paymentId`; checkout goes through the provider seam (`src/lib/payments/` — Stripe when keys are set, signed simulated provider otherwise); `POST /api/payments/webhook` (or the `/api/payments/simulate` callback) flips the booking to CONFIRMED + payment to PAID with a `bookingPaid` notification; a worker cancel refunds the deposit. The customer `/bookings` page shows a Pay-deposit card wired to `payBookingAction`. Remaining: M4 reschedule, invoices. See [docs/booking-scheduling.md](booking-scheduling.md).
- [x] **Multi-candidate request-quotes** — a customer invites up to 3 workers to quote one job and picks a winner, reusing the `Booking` model (each invited worker is a slot-less `QUOTING`/`QUOTED` booking; the winner claims a slot through the existing CAS). **Shipped end-to-end** — `QuoteRequest` model + `QUOTING`/`QUOTED` statuses + nullable `Booking.startAt/endAt` (migration `20260814080745_multi_candidate_quotes`), demo + prisma adapters, seams + server actions (`createQuoteRequestAction`/`submitQuoteAction`/`selectQuoteAction`), the quote-SLA expiry in `/api/cron/requests`, the "Get quotes" dialog on worker profiles, the customer `/bookings` quote tab with the accept-quote slot picker, the worker dashboard bid UI, i18n EN/AR, unit + mapper tests + a `db:smoke` section. Design: **[docs/multi-candidate-quotes.md](multi-candidate-quotes.md)**.
- [x] **Customer ⇄ worker chat** — per-booking negotiation thread (`BookingMessage`, migration `20260815090000_booking_chat`) with quote sharing and a WhatsApp deep-link fallback, rendered on the customer row, worker dashboard rows and the admin dispute view (see ENHANCEMENT-PLAN §2.3).
- [ ] **Lead pipeline** — statuses (new → contacted → quoted → won/lost), negotiation thread, lead analytics per worker.
- [ ] **Deposits / escrow** — pay a booking deposit; refund policy; dispute flow (trust layer for a marketplace).
- [ ] **Blog + Help center** (`BlogPost`/`HelpArticle`), support tickets (`Ticket`) with admin view.
- [ ] **Growth loops** — referral program (`Referral`), promo codes (`PromoCode`) with usage caps, subscription/annual discounts.
- [ ] **Invoice PDFs** (`Invoice.pdfUrl`), invoice history portal, VAT/tax-ready line items.
- [x] **Advanced analytics** — conversion funnels (search → profile → lead → booking), cohort tables, CSV/PDF export, per-worker earnings.
- [x] **Map search view** — browse workers on a map (OpenStreetMap), radius filter.
- [x] **Multi-currency with live FX** — per-city currency display + settlement currency.
- [ ] **Worker onboarding wizard** — guided multi-step profile setup with completion scoring (drives `Worker.completion`).

### 3.3 P2 — Differentiation & AI
- [ ] **AI review moderation** — `Review.aiFlags` from an inference service (spam/fake detection, sentiment).
- [ ] **AI profile assistance** — generate bios, service pricing suggestions, smart category recommendations.
- [ ] **AI assistant / concierge** — "find me an emergency plumber in Riyadh tonight" chat.
- [ ] **Video profiles & portfolios** (existing `VIDEO` ad type patterns apply to workers).
- [x] **Trust program** — verified-identity tiers (ID, license, background check), badges visible in search + profile.
- [ ] **Progressive subscription gating** — premium tiers unlock more leads, priority placement, analytics depth.
- [ ] **Push/webhook integrations for companies** — real-time campaign pacing alerts.
- [ ] **More locales** — Urdu/Hindi/Filipino/French (schema is locale-paired; `Language` model supports it).

### 3.4 PWA hardening (prerequisite for mobile strategy)
- [x] **Offline shell** — `public/sw.js` is now a full app-shell service worker: versioned precache of the shell (root, manifest, icons), **network-first navigations** that fall back to the cached shell then a bilingual `/offline.html` page, and **stale-while-revalidate** caching of static assets (content-hashed chunks can never go stale). `/api/*` data is never cached — the shell works offline, live data only online. Registered from the root layout, so any page installs it.
- [x] **Installable** — manifest (`src/app/manifest.ts`) now declares `id`, `scope`, `display: standalone` + `display_override`, **PNG icons at 192/512 + a maskable 512** (generated from the SVG by `npm run pwa:icons` into `public/icons/`), and **`dir`/`lang` read from the `wa_locale` cookie** so an Arabic visitor's installed app is RTL. iOS polish: `apple-touch-icon` 180² + `appleWebApp` metadata + `viewport-fit: cover`.
- [x] **App shortcuts** — manifest `shortcuts` deep-link to `/search`, `/bookings`, `/dashboard`, `/company` (long-press on Android).
- [x] **Push notification click-through** — `notificationclick` focuses an existing tab and navigates it to the payload's deep link, or opens a window. (Web share-target remains a 🔜 idea — see §7.)
- [x] **Precached content pages** — featured worker profiles and all 21 category search pages are precached at install so the most-visited content works fully offline, not just the shell. Manifest auto-generated at build time from `src/lib/data/workers.ts` and `src/lib/data/search.ts` via `scripts/generate-sw-precache.mjs` (`npm run precache:sw` / `prebuild` hook).
- [x] **Runtime profile cache** — recently-visited `/workers/*` pages are saved to a bounded LRU cache (`MAX_PROFILES = 20`). When offline, the profiles cache is checked before the shell, so recently-browsed workers work fully offline.
- [x] **Background sync for search** — when a search page is served from cache while offline, a `refresh-search` sync event is registered. On network restore, all precached search URLs are re-fetched and the shell cache updated. Clients can also trigger an immediate refresh via `postMessage`.
- [x] **Offline queue** — leads and reviews submitted while offline are queued in IndexedDB (`workers-arena-offline` database) and replayed to `/api/offline-queue/replay` on reconnect. The service worker registers a `replay-offline-queue` sync event, and the registrar's `online` listener triggers replay directly.
- [x] **Offline analytics** — page-view events are tracked in IndexedDB (`workers-arena-analytics` database) while offline and batch-sent to `/api/analytics/page-view` when back online. A `useTrackView(workerId?)` hook auto-tracks on pathname changes.
- [x] **Storage budgeting** — uses `navigator.storage.estimate()` to monitor disk usage. When free storage drops below 50 MB, cached profiles are evicted aggressively. New profiles are only cached if > 25 MB remains free.
- [x] **Custom install banner** — replaces the browser's default install prompt with an in-app banner that explains offline benefits (browse offline, send requests offline, faster loading, home screen). Respects user dismissal for 7 days.
- [x] **Notification action buttons** — push notifications include "View" and "Dismiss" action buttons for quick deep-linking without opening the notification panel.
- [x] **PWA debug dashboard** — hidden `/debug/pwa` page showing live cache sizes, storage usage, offline queue depth, analytics queue depth, and service worker status.
- [x] **Playwright E2E tests** — browser-based tests for the complete offline flow (service worker registration, precached pages, offline queue, API contract, analytics).
- [x] **Offline category browsing** — `/categories` listing and all `/search?category=…` pages are precached so browsing by trade works fully offline.

---

## 4. Release plan (indicative)

| Wave | Scope | Outcome |
|---|---|---|
| **W1 — Launch-ready** | P0 items 1–4 + payments v1 (Stripe) + CI/ESLint | Real data, real payments, real users sign up |
| **W2 — Marketplace core** | Booking + chat + lead pipeline + deposits | Platform becomes a transactional marketplace, not a directory |
| **W3 — Growth** | Referrals, promos, blog/help, tickets, analytics exports | Self-serve acquisition + support |
| **W4 — Mobile** | PWA hardening → Capacitor app → store launches (see §6) | iOS + Android presence |

---

## 5. Mobile app plan — iOS & Android

### 5.1 Strategy options

| Option | Description | Cost | Native UX | Store presence | Fits us? |
|---|---|---|---|---|---|
| **A. PWA-first** | Harden the existing manifest/SW/push into a fully installable, offline-capable PWA | ~2–4 wks | Good (no native nav) | ❌ No App Store; iOS install via Safari | Yes — do first, it's nearly free |
| **B. Capacitor wrapper** | Wrap the existing Next.js app in a native shell (WKWebView/Android WebView), native push via plugins | ~4–6 wks | Web feel, native shells | ✅ Both stores | **Recommended next step** |
| **C. React Native (Expo)** | Rebuild the UI natively, share the API layer with the web app | ~3–6 months | Best | ✅ | Evaluate after PMF is proven |

**Recommendation:** A → B → C in sequence. Engineering detail for the Capacitor path (project layout, FCM/APNs providers, deep links, store checklist) lives in **[docs/mobile-architecture.md](mobile-architecture.md)**. The web app is already ~80% of a mobile app (responsive, PWA, push, bilingual). Ship the PWA to mobile users now, wrap it with **Capacitor** for App Store / Play Store presence with real native push (FCM + APNs) and offline support, and only invest in a **React Native (Expo)** re-implementation once native UX becomes a growth constraint. This de-risks spend and keeps one codebase for as long as possible.

### 5.2 Architecture (Capacitor path)

```
┌────────────────────────────┐   ┌─────────────────────────────┐
│  iOS app (WKWebView)       │   │  Android app (WebView)      │
│  Capacitor iOS + APNs      │   │  Capacitor Android + FCM    │
└────────────┬───────────────┘   └──────────────┬──────────────┘
             └───────────────┬──────────────────┘
                             ▼
                 Next.js web app (same codebase)
                   - PWA offline shell
                   - existing REST APIs / Server Actions
                             ▼
        Notification seam (src/lib/notifications/providers/)
        └─ add `fcm` (Android) + `apns` (iOS) providers
        └─ keep console/smtp/twilio/web-push providers for web
                             ▼
        Backend: Prisma/PostgreSQL · Stripe · Cloudinary · Redis
```

Key decisions:
- **One codebase, one API** — mobile renders the same Next.js app (Capacitor serves the production build or points at the deployed URL). No API duplication.
- **Native push** — replace web-push for native builds: new `push` providers for **FCM** (Android) and **APNs** (iOS), fed by the existing `pushOwnerStamp` identity model (userId FK). Deep links route to `/workers/[slug]`, `/dashboard`, etc.
- **Auth** — Auth.js JWT works in WebViews; add secure token storage + **biometric unlock** (Capacitor biometrics plugin) over the existing session.
- **Payments** — Stripe Checkout in WebView + **Stripe SDK for in-app purchases** where Apple/Google require it (digital goods) or for Apple/Google Pay wallets.
- **Offline** — service worker app-shell + cached search/profiles (same PWA hardening as §3.4); queue lead messages offline and sync on reconnect.

### 5.3 Feature parity matrix (📱 = shipped on mobile)

| Feature | PWA | Capacitor v1 | Expo/RN (v2) |
|---|---|---|---|
| Search + filters + voice | ✅ 📱 | ✅ 📱 | ✅ 📱 |
| Worker profiles, map, QR, reviews | ✅ 📱 | ✅ 📱 | ✅ 📱 |
| Favorites, share, WhatsApp contact | ✅ 📱 | ✅ 📱 | ✅ 📱 |
| Push notifications (leads, reviews, renewals) | ✅ web-push 📱 | ✅ FCM/APNs 📱 | ✅ FCM/APNs 📱 |
| Booking & scheduling (after W2) | ✅ 📱 | ✅ 📱 | ✅ 📱 |
| Chat (after W2) | ✅ 📱 | ✅ 📱 | ✅ 📱 |
| Payments (Stripe) | ✅ 📱 | ✅ + Apple/Google Pay 📱 | ✅ native SDK 📱 |
| Offline app shell | 🟡 | ✅ 📱 | ✅ 📱 |
| Biometric unlock | — | ✅ 📱 | ✅ 📱 |
| Home-screen widgets / shortcuts | — | 🟡 | ✅ |
| Native nav / gestures | — | — | ✅ |
| Push-to-talk / camera AR tools | — | — | 💡 |

### 5.4 Rollout phases

| Phase | Timeline | Deliverables |
|---|---|---|
| **M1 — PWA harden** | Wks 1–3 | Offline shell, install UX, deep-link routing, iOS/Android splash & icons |
| **M2 — Capacitor shell** | Wks 4–8 | Capacitor apps, native push (FCM/APNs), secure storage, biometrics, app icons/splash, versioned release pipeline |
| **M3 — Store launch** | Wks 8–10 | Apple Developer Program ($99/yr) + Google Play ($25), privacy policy, store listing assets (EN/AR), review-guideline compliance, TestFlight + internal testing → production |
| **M4 — Native v2 (evaluate)** | Post-PMF | Expo/RN re-implementation of the highest-traffic screens (search, profile, booking); native SDKs for payments/maps/chat |

### 5.5 Mobile-specific backlog (all 📱, sequenced)
- [ ] M1: offline shell + install prompt polish
- [ ] M1: universal deep links (`https://workersarena.com/workers/:slug` → app)
- [ ] M2: Capacitor + iOS/Android projects in repo (`/mobile`)
- [ ] M2: FCM/APNs providers in the notification seam + device registration endpoint
- [ ] M2: biometric unlock + secure token storage
- [ ] M2: Apple Pay / Google Pay wallet buttons in checkout
- [ ] M2: splash screens, adaptive icons, status-bar theming (light/dark)
- [ ] M3: store assets (EN/AR screenshots, privacy policy, data-deletion process for GDPR/KSA PDPL)
- [ ] M3: analytics + crash reporting (Sentry mobile SDK)
- [ ] M4: E2E mobile tests (Maestro/Detox), device farm matrix

### 5.6 Mobile testing & quality
- Reuse the existing vitest + E2E hydration suite for the shared web layer
- Add **Maestro flows** (cross-platform, YAML) for the top 5 journeys: search → profile → book → pay → notifications
- Device matrix: iOS 16+ / Android 8+ (the PWA/web layer already supports these)
- Perf budgets: < 3 s first meaningful paint on mid-range Android; Lighthouse ≥ 90 PWA/performance

---

## 6. Feature-to-code map (where things live)

| Area | Code |
|---|---|
| Worker ↔ customer selection workflow | **[docs/selection-workflow.md](selection-workflow.md)** — discovery, request, response, execution phases |
| Multi-candidate quotes (designed) | **[docs/multi-candidate-quotes.md](multi-candidate-quotes.md)** — 1 job, up to 3 workers, one winner |
| Worker payouts | **[docs/payouts.md](payouts.md)** — earnings ledger, withdrawable balance, admin approval |
| Enhancement plan (features + workflow) | **[docs/ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md)** — prioritized waves W1–W4 |
| Search engine | `src/lib/data/search.ts`, `src/lib/data/search-params.ts` |
| Data layer / repo seam | `src/lib/data/repo.ts`, `src/lib/data/workers.ts` |
| Notifications (channels, reminders, push) | `src/lib/notifications/*` |
| Activity feed / audit | `src/lib/data/activity.ts` |
| Auth | `src/auth.ts`, `src/lib/auth-demo.ts`, `src/lib/security.ts`, `src/app/actions/auth.ts` |
| i18n | `src/lib/i18n/*` (`dictionaries.ts` = single source of truth) |
| UI components | `src/components/*` (design system in `ui/`) |
| API routes | `src/app/api/*` |
| Dashboards | `src/components/dashboard/*` |
| Database | `prisma/schema.prisma`, `prisma/seed.ts`, `prisma/migrations/*` |
| Tests | `tests/*` (188 vitest cases incl. E2E hydration smoke) |
| Mobile (planned) | `mobile/` (Capacitor projects), `src/lib/notifications/providers/fcm.ts`, `apns.ts` |

---

## 7. How to keep this document fresh

- **Update as you ship:** tick checkboxes (`[x]`) and change status markers the moment a feature lands in code — don't batch it.
- **One PR, one line:** any PR that adds user-visible functionality should touch this doc's inventory + roadmap in the same PR.
- **Priorities move:** re-tag P0/P1/P2 and revise the release plan at each planning session; keep the *why* next to big decisions.
- **Mobile parity:** keep §5.3 matrix honest — a feature is only "📱 shipped" when verified on a real device.
- **Never delete history silently:** when a feature is deprecated, mark it `~~struck~~` with a note instead of removing the line.
