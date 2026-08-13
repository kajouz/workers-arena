# Architecture

## 1. System overview

```
                        ┌──────────────────────────────────────────────┐
                        │            Next.js 16 (App Router)           │
   Browser (EN/AR) ───▶ │  Server Components  ·  Server Actions        │
   PWA / mobile         │  RSC + Client Islands (Framer Motion, RHF)   │
                        │  /app  pages · /app/api REST · /workers/*    │
                        └───────┬──────────────────┬───────────────────┘
                                │ Prisma            │ fetch()
                        ┌───────▼────────┐  ┌───────▼──────────────────┐
                        │  PostgreSQL    │  │  Redis (cache, rate-limit│
                        │  (schema.prisma)│  │  sessions, hot search)  │
                        └───────┬────────┘  └──────────────────────────┘
                        ┌───────▼──────────────────────────────────────┐
                        │  Cloudinary (media) · Stripe/PayPal/MyFatoorah│
                        │  Tap (payments) · SMTP/SMS/Push (notify)     │
                        └──────────────────────────────────────────────┘
```

**Key principle — repository seam:** all pages and APIs read data through `src/lib/data/repo.ts`. In demo mode it serves an embedded bilingual dataset; in production the same functions query Prisma. The UI never changes between modes.

## 2. Folder structure

```
src/
  app/
    layout.tsx              # i18n-aware root (lang/dir), theme bootstrap
    page.tsx                # landing: hero → categories → featured → plans
    search/page.tsx         # search engine shell (server) + <SearchClient/>
    workers/[slug]/page.tsx # profile: hero, tabs, reviews, map, related
    categories/page.tsx     # all-trades directory
    favorites/page.tsx      # saved workers (persisted zustand)
    auth/login|register     # RHF + Zod + server actions
    dashboard/page.tsx      # worker dashboard (role-guarded)
    admin/page.tsx          # analytics dashboard (role-guarded)
    company/page.tsx        # ad campaigns dashboard (role-guarded)
    api/                    # workers, workers/[slug], categories,
    ...                     # search/suggest, health (REST)
    sitemap.ts robots.ts manifest.ts
  components/
    ui/                     # shadcn-style design system (Radix + cva)
    layout/ home/ search/ worker/ dashboard/ shared/ providers/
  lib/
    i18n/                   # config, dictionaries (en/ar), server.ts, provider
    data/                   # types, categories, cities, templates, workers,
    ...                     # search (fuzzy), analytics, repo (seam)
    server/prisma.ts        # PrismaClient singleton
    auth-demo.ts security.ts store.ts utils.ts
  hooks/                    # useDebounce, useInfiniteScroll, useVoiceSearch
prisma/schema.prisma        # 30+ models
tests/                      # vitest: search, i18n parity, utils
docs/                       # architecture, api, payments, deployment
```

## 3. Multilingual + RTL

- **Detection (server):** `wa_locale` cookie → `Accept-Language` → `"en"`.
- **Switch (client):** sets the cookie and reloads; `<html lang dir>` re-renders the whole tree, so every component adapts (fonts swap via `[dir="rtl"]`, layout flips via Tailwind logical utilities `ms/me/ps/pe/start/end`).
- **Type safety:** `Dictionary = typeof en`; `ar` must satisfy it (enforced by a test).
- **Content model:** bilingual pairs `nameEn/nameAr`, `bioEn/bioAr` etc. in both the demo dataset and the Prisma schema.

## 4. Search engine (`lib/data/search.ts`)

- Arabic normalization (strip tashkeel, unify alef/hamza/ta-marbuta/ya).
- Tokenized + **subsequence fuzzy matching** with relevance scoring (exact name > name prefix > category > city > fuzzy), plus verified/premium/rating boosts.
- Filters: category, city, area, min rating, price band, min experience, verified, featured, emergency, open-now, availability.
- Sorts: relevance, rating, reviews, price ↑/↓, experience, **nearest** (haversine to city center).
- **Fast:** in-memory O(n) scan in demo; production uses a Postgres trigram index + Redis for hot queries (see DEPLOYMENT.md).

## 5. Auth

- **Real auth (implemented):** Auth.js v5 (`next-auth@beta`, `src/auth.ts`) — **Credentials** provider (email + PBKDF2 `passwordHash` against `prisma.user`, via `src/lib/security.ts`) plus **Google** OAuth (mounted only when `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are set), JWT session strategy, with `jwt`/`session` callbacks stamping the app's `SessionUser` shape (`{ id, name, email, role, hue }`, `src/types/next-auth.d.ts` augments the types). Route handlers live at `/api/auth/[...nextauth]` (node runtime). Schema ships `Account/Session/VerificationToken` (migrated).
- **Seam:** `getSession()` in `src/lib/auth-demo.ts` delegates to `auth()` whenever `realAuthEnabled()` (DEMO_MODE=false + DATABASE_URL + a real AUTH_SECRET) — real user ids then flow into `PushSubscription.userId` and `ActivityLog.actorId` end-to-end. Otherwise it falls back to the demo httpOnly cookie session (4 roles), so the app stays navigable without infra.
- **Actions:** `src/app/actions/auth.ts` branches on `realAuthEnabled()` — `loginAction`/`loginDemoAction` call `signIn("credentials")`, `logoutAction` calls `signOut`, `registerAction` creates the real `User` row (hashed password) then signs in. The one-click demo buttons sign into the seeded accounts (`prisma/seed.ts` creates the 4 demo users with password `Password123!`, constant in `src/lib/security.ts`).
- **Constraint (OAuth):** with JWT strategy, `token.sub` is the OAuth provider's opaque id — **not** a Prisma cuid — and there is no `signIn` callback that upserts a `User` row. A Google-authenticated session stamping `PushSubscription.userId` / `ActivityLog.actorId` would therefore **violate the FK**. Until user-linking exists, OAuth sessions must be treated as non-owner identities (push registration falls back to guest/`ownerId`), or a `signIn` callback must create the user row. Credentials sessions are safe (their `token.sub` is the real `User.id`).
- **Note:** `role`/`hue` are baked into the JWT at sign-in, so a role change requires re-login (standard JWT-strategy tradeoff).
- **Ops:** `AUTH_SECRET` (32-byte random), `AUTH_URL`, `AUTH_TRUST_HOST=true` in `.env`; the demo migrations `…0001_push_subscription_user_fk` + `…0003_activity_log_actor_fk` apply the FKs (`npx prisma migrate deploy`).

## 6. Security posture

| Threat | Mitigation |
|---|---|
| XSS | React escaping, `sanitizeText()` on user input, CSP in production |
| SQL injection | Prisma parameterized queries only |
| CSRF | SameSite cookies, server-action origin validation |
| Rate limiting | `rateLimit()` helper (in-memory; Redis in prod) on auth/contact endpoints |
| Password | PBKDF2-hashed (swap to argon2 in prod) |
| Roles | Server-side guards on `/admin`, `/company`, `/dashboard` |
| Audit | `ActivityLog` model; sensitive mutations logged |
| Sensitive data | Secrets in env; PII encrypted at rest in production |

## 7. AI features (roadmap, `docs/`)

`Review.aiFlags`, duplicate/fake-profile detection, AI-generated bios and smart category suggestions plug into the `Review`/`Worker` models — an inference service (OpenAI/self-hosted) can be called from server actions or a background worker.

## 8. Notifications

**Channel abstraction** (`src/lib/notifications/`) — every notification persists to the inbox (`Notification` record; `src/lib/data/notifications.ts` is a **dual adapter**: seeded in-memory store in demo mode, Prisma `Notification` model when `DEMO_MODE=false` + `DATABASE_URL`) and fans out through pluggable outbound channels:

```
        pushNotification(payload, recipient)
                 │
   ┌─────────────┴───────────────┐
   │ in-app inbox (demo: memory  │
   │  · prod: prisma.notification)│
   └─────────────┬───────────────┘
                 ▼
        dispatch(payload)  ── allSettled, never throws
        ├─ email    channel ─ console (dev) · SMTP (nodemailer) · Resend
        ├─ sms      channel ─ console (dev) · Twilio SMS API (`npm i twilio`)
        ├─ push     channel ─ console (dev) · Web Push (web-push, VAPID)
        └─ whatsapp channel ─ console (dev) · Meta WhatsApp Cloud API (Graph API via fetch, no SDK)
```

- **Providers** are lazy-imported and env-selected (`NOTIFY_EMAIL_PROVIDER`, `NOTIFY_SMS_PROVIDER`, `NOTIFY_WHATSAPP_PROVIDER`, `VAPID_*`, `NOTIFY_*_ENABLED`) so the app builds and runs with zero SDKs installed; a missing SDK/credential reports a non-throwing `DispatchResult`.
- **Channel coverage matches the `NotificationChannel` enum** (EMAIL/SMS/PUSH/WHATSAPP — IN_APP is the inbox record). All four outbound channels share the same `NotificationChannel` seam (`src/lib/notifications/providers/*`) and render primary-locale copy via `templates.ts` (`renderEmail`, `renderSmsText`, `renderPushPayload`, `renderWhatsAppText`). SMS/WhatsApp are single-language (160-char SMS can't carry a bilingual block) and no-op benignly when the recipient has no phone number.
- **Booking-confirmation email:** every booking-lifecycle notification (request / confirmed / paid / declined / cancelled / rescheduled / completed / reminder) attaches a structured `booking` context (`ChannelPayload.booking`, built by `bookingEmailContext` in `src/lib/data/booking-ui.ts`; quote/deposit pass through in minor units). `pushNotification` threads it into the dispatched payload **outbound-only** — it is never stored on the inbox record. When present, the email channel renders `renderBookingEmail` (`src/lib/notifications/templates.ts`, shared `emailShell` chrome): the standard copy plus a receipt-style details card (booking number, slot date & time, quote/deposit ÷100, service) and a deep link to the admin dispute view (`/admin/bookings/{number}`), with the booking number in the subject — so the email, the Recent-activity feed and the booking funnel all key on the same booking. Push/SMS/WhatsApp stay compact for every payload type.
- **WhatsApp Cloud API** (`whatsapp-cloud`) POSTs to `graph.facebook.com/v21.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` with a bearer `WHATSAPP_TOKEN` — plain `fetch`, so no SDK install is needed; numbers are sent in E.164 without a `whatsapp:` prefix.
- **Inbox persistence:** `src/lib/data/notifications.ts` exposes the same API (`getNotifications` / `getUnreadCount` / `markNotificationRead` / `markAllNotificationsRead` / `pushNotification`) over two adapters — a seeded in-memory store in demo mode, and the Prisma `Notification` model when `DEMO_MODE=false` + `DATABASE_URL` is set. The row's owner is resolved from the recipient's email (falling back to the seeded admin user, matching how `prisma/seed.ts` attaches every worker to the admin), `channel: IN_APP` is stamped, and the original app-level `type` + `href` round-trip through the `data` JSON column (the DB enum is coarser than the app's type union).
- **Admin activity feed:** `src/lib/data/activity.ts` exposes `logAdminActivity` / `getAdminActivityFeed` / `resetAdminActivityFeed` over two adapters — a gitignored JSON file (`.data/admin-activity.json`) in demo/dev mode (which also bridges route-handler vs server-component state across Next dev's module split), and the Prisma `ActivityLog` model when `DEMO_MODE=false` + `DATABASE_URL` is set. The `action` column stores a **structured machine code** from the `ACTION_CODES` map (`WORKER_VERIFIED`, `VERIFICATION_DECLINED`, `VERIFICATION_REQUEST_SUBMITTED`, `PUSH_SUBSCRIPTION_PRUNED`, `PUSH_SUBSCRIPTION_REMOVED`, `PUSH_TEST_SEND_DELIVERED`, `PUSH_TEST_SEND_FAILED`, …) — a proper queryable enum for analytics and filtering. The verification workflow logs **both sides**: the worker's submit (`VERIFICATION_REQUEST_SUBMITTED`, display actor = worker, `actorId` null — not an admin action) and the admin's decision (`WORKER_VERIFIED`/`VERIFICATION_DECLINED`, `actorId` = the real admin FK). Call sites pass `code: ACTION_CODES.X`; entries without an explicit code fall back to a coarse type-derived code for backward compatibility. The bilingual display copy (`actionEn`/`actionAr`), original `type`, and the `code` round-trip through the `meta` JSON column — lossless via `rowToActivityEntry`. The `actor` display name is stored in `meta.actor`, while `actorId` is the **genuine FK to `User.id`** (`ON DELETE SET NULL` — an audit row survives the actor's deletion; the reference clears). `logAdminActivity` accepts an optional `actorId` separate from the display name: real session user ids are threaded from `decideVerification` and the push admin routes (`session.id`), and system events (prunes, cron) leave it null. Swap steps when real auth lands: replace `getSession()` with `auth()` and the same `session.id` flows in — the migration `prisma/migrations/20260809000003_activity_log_actor_fk` nulls out any legacy display-name `actorId` rows defensively before adding the constraint. `ADMIN_ACTIVITY_FILE` forces the file adapter (test override). Verification decisions, push prunes and forced removals all land here and prepend to the admin overview's Recent activity. **Booking lifecycle events** land here too: the seam's `logBookingLifecycle` helper logs `BOOKING_REQUESTED` (customer request), `BOOKING_CONFIRMED` (worker accept **and** the deposit-path payment confirm — the confirm logs inside the adapters via a `transitioned` flag so webhook redelivery can't double-log), `BOOKING_CANCELLED` (with the reason in the copy), `BOOKING_RESCHEDULED` (actor = whoever moved the booking) and `BOOKING_NO_SHOW` (the worker voiding a no-show — `inProgress`/`completed` deliberately get no codes, the dispute view's event trail carries them), each carrying the booking number as `bookingNo` (round-tripped through `meta`). The Recent activity feed and the booking funnel therefore tell one story — every funnel row has its REQUESTED entry in the feed (created = logged) and every status change is traceable in both, and each entry deep-links to the admin **dispute view** (`/admin/bookings/[number]`, admin-guarded) which renders the booking's full `BookingEvent` trail with actor/reason/timestamp. The dispute view also carries a **Preview email** button: `customerEmailKind(booking)` maps the booking's current state to the customer-facing email it implies (confirmed → the confirmation or, with a deposit `paymentId`, the payment-received email; completed/declined/cancelled-by-worker → their emails; null when the customer received nothing), the copy is built by the same `bookingNotification` builder the adapters dispatch, and `renderBookingEmail` is rendered server-side into a sandboxed-iframe dialog — so admins see exactly what the customer received. The same live feed drives the admin **verification funnel** card via `getVerificationFunnel(days)` — buckets `VERIFICATION_REQUEST_SUBMITTED` / `WORKER_VERIFIED` / `VERIFICATION_DECLINED` over a window (default 30 days, NaN-clamped) to surface request→approval conversion on both adapters. Note: rows written before this map existed carry the coarse type-derived codes (`SYSTEM`, `VERIFICATION`, …) — the `action` column holds two code generations until the retention cron (`/api/cron/activity-prune`) purges the old rows, so analytics must treat both as valid until then.
- **Subscription expiry flow:** reminders at **7 / 3 / 1 day**, then an **expired** event that deactivates the worker (hidden from search), notifies the admin and logs to `ActivityLog`. The reminder engine (`src/lib/notifications/reminders.ts`) runs via `GET /api/cron/reminders` (guarded by `CRON_SECRET`) and is idempotent per worker+window. The same cron tick runs the **M4 booking reminder**: a "job starts tomorrow" notification for `CONFIRMED` bookings starting within 24h (customer recipient, deep-link `/bookings`). Idempotency follows the schema's `lastReminderSent` pattern — the `Booking` row carries a `lastReminderSent DateTime?` stamp that the engine claims with a compare-and-swap (`updateMany WHERE lastReminderSent IS NULL`) before pushing, so overlapping cron invocations can never double-send; demo mode dedupes per process instead. The response includes `bookings: { dispatched, alreadySent, total }`.
- **Completion auto-confirm cron (§2.3):** `GET /api/cron/completions` (guarded by `CRON_SECRET`, mirrors `/api/cron/reminders`) — the customer-confirms-completion trust fix: a worker's "completed" flip is STAGED (`COMPLETION_PENDING` + `Booking.completionPendingAt`, migration `20260813140000_completion_pending`) until the customer confirms (or the grace cron auto-confirms past `BOOKING_COMPLETION_CONFIRM_GRACE_HOURS` = 72h): the job flips to COMPLETED (system actor), net earnings credit the worker's ledger, and the customer gets the completion receipt. Idempotent — each confirm is a CAS on the COMPLETION_PENDING status (a concurrent customer confirm or overlapping cron run loses the race). The engine (`runCompletionAutoConfirmEngine` in `src/lib/data/completion-auto-confirm.ts`) is exercised live by `db:smoke`'s M4 §2.3 section. The response includes `{ autoConfirmed }`.
- **Request SLA cron (W2):** `GET /api/cron/requests` (guarded by `CRON_SECRET`, mirrors `/api/cron/reminders`) — a REQUESTED booking the worker hasn't answered is dead air for both sides. Past `BOOKING_SLA_NUDGE_HOURS` (24h) the engine nudges the worker once (`worker-request-nudge`, deep-link `/dashboard`); past `BOOKING_SLA_EXPIRE_HOURS` (48h) it auto-cancels the request (status → CANCELLED, `cancelledBy` system), frees the slot back to AVAILABLE (rule 3), appends a SYSTEM audit event, notifies the customer (`customer-request-expired`, deep-link `/bookings`, app types round-tripped through the `data` JSON against the coarse `BOOKING_REQUEST_NUDGED` / `BOOKING_REQUEST_EXPIRED` DB enums from migration `20260813130000_request_sla`) and logs `BOOKING_CANCELLED` to the activity feed with the booking number — so the funnel's cancelled bucket and Recent activity keep telling one story. Idempotency follows the `lastReminderSent` pattern: the `Booking` row carries a `lastSlaNudgeAt DateTime?` stamp claimed with a compare-and-swap (`updateMany WHERE lastSlaNudgeAt IS NULL`) before the nudge push, and a CANCELLED booking is never scanned again; demo mode dedupes nudges per process. The engine (`runRequestSlaEngine` in `src/lib/data/request-sla.ts`) is exercised live by `db:smoke`'s W2 section (backdated request → nudge + auto-expire → slot freed → both notifications → feed entry → idempotent re-run). The response includes `{ nudged, expired, scanned, expiredNumbers }`.
- **Recurring generation cron (W2):** `GET /api/cron/recurring` (guarded by `CRON_SECRET`, mirrors `/api/cron/reminders`) rolls maintenance contracts forward: for every ACTIVE contract whose first occurrence has been accepted (CONFIRMED / PENDING_PAYMENT), it materializes the cadence occurrences due within the 30-day lookahead (`RECURRING_LOOKAHEAD_DAYS`) that don't exist yet, each claiming a real AVAILABLE slot (CAS — an occurrence whose cadence time has no covering slot stays pending for the next run as the worker's availability rolls forward). Idempotent: re-runs materialize nothing new, and the `@@unique([recurringBookingId, startAt])` index on `Booking` is the concurrency backstop. Every run that materializes occurrences notifies the customer about the **next scheduled visit** — one `recurringVisitScheduled` notification per contract (addressed to the customer, deep-link `/bookings`, app type round-tripped through the `data` JSON against the new coarse `BOOKING_VISIT_SCHEDULED` DB enum from migration `20260813114038_booking_visit_scheduled`), with the visit date riding both the notification body and the email's receipt card (`BookingEmailContext.startAt`). Demo mode no-ops (the demo adapter materializes its fixed count at accept and mirrors the same one notification about the next visit). The response includes `{ contracts, materialized }`; the engine (`runRecurringGenerationEngine` in `src/lib/data/recurring-generation.ts`) is exercised live by `db:smoke`'s W2 section, which also runs in the nightly CI job.
- **Push cleanup cron:** `GET /api/cron/push-prune` (guarded by `CRON_SECRET`, mirrors `/api/cron/reminders`) probes every endpoint with a TTL:0 notification and removes dead 404/410 ones, logging each prune to the admin activity feed. Safe on any interval — idempotent, no-op without VAPID keys.
- **Activity retention cron:** `GET /api/cron/activity-prune` (guarded by `CRON_SECRET`) enforces the `ActivityLog` retention policy — deletes rows older than `ACTIVITY_LOG_RETENTION_DAYS` (default 90). The admin overview feed caps reads at 200, but rows accumulate unboundedly in the DB; this job bounds them. `listActivityEntries` (`/api/admin/activity`, admin-guarded) pages the FULL log with actor/type filters on the `/admin/activity` history page.
- **Push registration:** browsers POST their subscription to `/api/push/register`; `GET /api/push/vapid-public-key` bootstraps the client. The store (`src/lib/notifications/push-store.ts`) is a **dual adapter behind one API**: with `DATABASE_URL` set it persists to the `PushSubscription` Prisma model (unique index on `endpoint`, migrations `prisma/migrations/20260809000000_init` + `…0001_push_subscription_user_fk`); otherwise it falls back to the gitignored `.data/push-subscriptions.json` file (which also bridges route-handler vs server-action state across Next dev's module split). `PUSH_STORE_FILE` forces the file adapter (test override).

  **Owner stamping — demo vs real auth.** Each subscription carries exactly one of two stamps, chosen by `pushOwnerStamp()` (`src/lib/notifications/push-store.ts`): demo cookie sessions (`u-…`, no user row) stamp the **non-FK** `ownerId`; real authenticated users stamp the **`userId` FK** (`PushSubscription.userId → User.id`, `ON DELETE CASCADE`, so deleting a user removes their subscriptions). The unregister ownership check matches either stamp, so `GET`-style cross-user removal stays impossible in both modes.

  **Exact swap steps when NextAuth lands** (see `src/auth.ts`):
  1. ✅ `npm install next-auth@beta`, fill `AUTH_SECRET` + providers in `src/auth.ts`, and swap `getSession()` → `auth()` in `src/lib/auth-demo.ts` (returning the same `SessionUser` shape) — **done**: `getSession()` now delegates to `auth()` when `realAuthEnabled()`.
  2. ✅ Apply the pending migration on the DB: `npx prisma migrate deploy` — adds the nullable `userId` column, `PushSubscription_userId_idx`, and the `PushSubscription_userId_fkey` FK (`ON DELETE CASCADE`) — **done** on `workers_arena_v2` (all 4 migrations applied). `ownerId` stays populated for legacy rows.
  3. ✅ **No route/store changes required** — real session ids (Prisma cuids, not `u-…`) flow through `pushOwnerStamp` and automatically write `userId`. New subscriptions stamp the FK; old demo rows keep `ownerId`.

  **Local DB naming note:** `.env`/`.env.example` use `workers_arena_v2` (the current-schema DB; the pre-existing `workers_arena` holds a legacy schema from an earlier iteration and is left untouched), while `docker-compose.yml`'s app service provisions a `workersarena` database — align the compose DB name with the documented `DATABASE_URL` before running the containerized stack.
  4. Optional cleanup once demo rows are gone: drop the `ownerId` column (`prisma migrate dev --name drop_push_owner_id`). Note legacy `ownerId`-only rows can't be unregistered through the API afterwards (the ownership check requires a matching stamp) — clean them up manually or in a backfill migration before dropping the column.
- **Local push testing:** `node scripts/mock-push-service.cjs` runs an HTTPS mock push service (self-signed cert in `.data/certs`) that receives and decrypts real web-push payloads — the web-push provider allows an insecure agent for **loopback endpoints only** to support it. Embedded/Electron browsers lack a Web Push service, so real delivery is verified against this mock or a standard browser.

## 10. Production data layer — the W1 flip (+ W2 bookings)

**Gate:** `repo.realDataEnabled` = `DEMO_MODE=false` **and** `DATABASE_URL` set. When on, the catalog read paths in `src/lib/data/repo.ts` delegate (lazy dynamic import) to the Prisma implementations in **`src/lib/data/prisma-repo.ts`**; demo mode never touches `@prisma/client`, so a fresh demo checkout still runs with zero DB dependencies.

**Wired (catalog reads + bookings, identical signatures):** `getCategories` → `prismaGetCategories`, `getWorkerBySlug` → `prismaGetWorkerBySlug`, `getWorkerById`, `getAllWorkers`, `getWorkers` → `prismaSearchWorkers`, `getFeaturedWorkersList`, `getRelated` — and the W2 booking seam (docs/booking-scheduling.md §4): `getWorkerSlots`, `getWorkerBookings`, `getBookingByNumber` (admin dispute view lookup — the activity feed's booking entries deep-link to it), `getCustomerBookings`, `getBookingFunnel`, `createBookingRequest`, `respondToBooking`, `transitionBooking` (inProgress/completed/noShow state machine), `cancelBooking` (frees the slot, stores reason/actor) — plus the M2 availability editor `generateSlots` → `prismaGenerateSlots` and `setSlotBlocked` → `prismaSetSlotBlocked` — and the M3 deposit seam: `createBookingCheckout` → `prismaCreateBookingCheckout` (idempotent — reuses the existing provider session) and `confirmBookingPayment` → `prismaConfirmBookingPayment` (the webhook handler: CAS-flips `PENDING_PAYMENT → CONFIRMED` + `PENDING → PAID` in one tx, webhook redelivery no-ops). **M3 payments:** accept-with-deposit creates a `Payment` row (PENDING, minor units, `userId` null for guest customers) linked via `booking.paymentId`; the checkout goes through the provider seam `src/lib/payments/` (`registry.ts` → real **Stripe** when `STRIPE_SECRET_KEY` is set, else a signed **simulated** provider whose local `/api/payments/simulate` URL completes keyless); `POST /api/payments/webhook` verifies the provider signature and confirms; `prismaCancelBooking` refunds a paid deposit (payment → `REFUNDED` + `refundRef`/`refundedAt`). Migration `20260810123344_m3_payment_checkout` (nullable `Payment.userId`, refund columns, `BOOKING_PAID` notification type). The booking **mutations** run inside `prisma.$transaction`: the AVAILABLE→RESERVED slot claim is an atomic `updateMany(WHERE status=AVAILABLE)` (the Postgres row-lock + re-check in one statement — concurrent requests matching 0 rows get `slot-taken`), the half-open overlap guard runs in the same tx, every transition appends a `BookingEvent`, and decline frees the slot back to AVAILABLE. Notifications (`pushNotification`) fire **after** the tx — the inbox write uses its own connection and must not share the tx's row locks. `prismaGenerateSlots` materializes the weekly `WorkingHour` template as AVAILABLE rows — idempotent via an in-memory overlap set **plus** `createMany(skipDuplicates)` against the `(workerId, startAt)` unique index, with a past-hour guard (injectable `now`) and the 24/7 `00:00–00:00` emergency marker → full-day generation. `prismaSetSlotBlocked` toggles AVAILABLE↔BLOCKED with the RESERVED/BOOKED refusal baked into the `updateMany` WHERE (CAS). Row→domain mapping for bookings lives in `toDomainBooking` / `rowToSlot` (exported + unit-tested in `tests/prisma-repo.test.ts`; the whole seam — create/respond + generate/block — is exercised end-to-end by `npm run db:smoke`, which restores the seed on exit).

**Still demo-only (later waves):** `getCities`, `getSuggestionsList`/`getPopularSearches`, analytics, and every mutation — `addReview`, `addLead`, `registerView`, `createCampaign`, ad impression/click, `renewWorkerSubscriptionBySlug`, notifications, activity feed, verification workflow. **In real mode the demo mutations no-op with a server-side warning** (they must never mutate demo data behind a real-mode UI) — posting a review/lead currently appears to succeed client-side, so the remaining waves must land before opening real mode to end users.

**Mapping notes:**
- `verification` derives from `verified` + `status` (`PENDING_VERIFICATION` → `pending`; unverified `ACTIVE` → `rejected`). The seed preserves demo-pending workers as `PENDING_VERIFICATION` so the round-trip is faithful.
- `subscription.status` is **derived from `expiresAt`** (reusing the demo `subscriptionStatus` helper), not trusted from the DB enum.
- **All money is minor units (×100) in the DB** — `subscription.price` and `worker.priceMin/priceMax` divide by 100 in the mapper (the seed stores ×100; `invoiceNo` is the subscription row id — the UI never renders it).
- `professionEn/Ar` is a domain-only field resolved from the demo category catalog by slug (the seed mirrors slugs 1:1).
- `unit` narrows the schema's free string to `hour | job`.

**Known parity gaps (search):** text matching is Postgres ILIKE substring — no Arabic normalization or fuzzy subsequence scoring yet (`pg_trgm` similarity is the planned upgrade); `relevance` sorts by rating as a proxy for the weighted score; `open-now` filtering and the `nearest` sort run in JS after a capped fetch (`POST_FILTER_FETCH = 1000`); profiles load up to 50 approved reviews (lists ≤2 per row); category `sortOrder` mirrors the demo array order so listing order matches between modes. Demo mode remains the reference implementation for exact semantics.

**Flip steps (on the provisioned DB):**
```bash
npx prisma migrate deploy   # apply migrations
npm run db:generate          # ensure @prisma/client is generated
npm run db:seed              # load the bilingual dataset (idempotent upserts)
# then set DEMO_MODE=false in .env — realDataEnabled turns the catalog reads on
```
Re-run `npm run db:seed` after pulling to refresh data; the seed's `update` branches keep rows in sync.

## 9. Scaling

- `output: standalone` for cheap Docker deploys; ISR (`revalidate`) on public pages; CDN for assets; Redis for hot search + rate limits; read-replica ready (Prisma supports `replicas`).
