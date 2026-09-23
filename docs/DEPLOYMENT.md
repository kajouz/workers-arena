# Deployment

[← Back to docs index](README.md)

## 1. Vercel (recommended)

```bash
vercel link
vercel env add DATABASE_URL            # production
vercel env add AUTH_SECRET
vercel env add NEXT_PUBLIC_APP_URL
# DEMO_MODE stays unset (production = Prisma)
vercel --prod
```

- **Ignore files are a deploy input, and are guarded.** `.vercelignore` decides what the CLI uploads; `.gitignore` decides what CI's fresh checkout contains. Both once carried an **unanchored** `backups` pattern, which matches a directory of that name at ANY depth — it silently excluded `src/app/[locale]/(app)/admin/backups/`, so the route 404'd in production while every local build (which consults neither file) stayed green. Root-anchor anything naming a project-root directory. `tests/ignore-patterns.test.ts` now evaluates both files against every path under `src/`, `public/`, `prisma/`, `scripts/` plus the root configs a build reads, and fails naming the pattern, its line, and the path it would hide.
- **PostgreSQL:** Neon / Supabase / RDS. Run `npx prisma migrate deploy` then `npm run db:seed` (one-time). The seed is country-parameterized — `SEED_COUNTRY=<slug|ISO code>` (or `all`) picks which configured countries' cities + generated demo workers to load; it defaults to the served tenant. `npm run db:seed-surge` (optional, idempotent) backfills a deterministic 30-day emergency/gold lead cohort so the Phase-2 surge-evaluation card on Revenue Settings can be reviewed populated before real data accumulates.

### Script gate (runs in CI, worth running before a release)

```bash
npm run check:scripts
```

Every file under `scripts/` must parse and everything it imports must resolve. This
exists because `eslint.config` ignores `scripts/**`, so nothing else in the pipeline
looks at those files: `scripts/strip-tsconfig-dist-entries.mjs` carried a
`SyntaxError` in its own header comment and was a no-op on **every** invocation for
its whole life, while CI ran it as `node scripts/… || true`. The gate parses JS/TS
(`node --check` / the TypeScript parser), shell (`sh -n`), resolves relative **and
`@/`-aliased** specifiers, walks each script's local import graph transitively
(so a module deleted deep in `src/` fails the script that imports it), and warns on
an import that only works because npm hoisted it.

The rule that keeps it honest: **never mask a check.** No `|| true`, no
`continue-on-error` on a step that is supposed to verify something — a masked check
is worse than no check, because the pipeline reports success and nobody looks.

### Database migration release gate

Run this checklist against the exact production `DATABASE_URL` before starting the new application build:

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

The final status must say **Database schema is up to date**. Never use `prisma db push` in production. For the current subscription-lifecycle release, verify that migration `20260919130000_subscription_lifecycle_events` appears in the applied list; it creates the durable `SubscriptionEvent` table used by retention reporting, expiry processing, and WhatsApp renewal outreach. If the status command reports a failed or pending migration, stop the deployment, resolve the database state, and rerun the status check before serving traffic. Record the migration status output and deployment timestamp in the release notes.
- **ISR:** public pages use `revalidate`/`dynamic` as needed; `/api/workers` sets `s-maxage` for CDN caching.
- **Cache policy (proxy middleware):** any request carrying a session cookie (`wa_session`, or the NextAuth `authjs`/`next-auth` session-token variants) gets `Cache-Control: private, no-store` — every page renders session-aware markup (Sign in ⇄ avatar) and dashboards embed per-user data, so shared caches must never hold authenticated HTML. Anonymous requests keep `public, max-age=0, s-maxage=60, stale-while-revalidate=300` (edge-cacheable, bfcache-friendly). API routes set their own headers. Never put the CSRF cookie in the session-cookie list — every visitor gets one, and keying on it would make the whole site uncacheable.
- **Cron (external scheduler, NOT `vercel.json`):** Vercel's own cron only allows **daily** expressions on the Hobby plan, and a sub-daily entry blocks the whole production deploy — "Hobby accounts are limited to daily cron jobs. This cron expression (*/15 * * * *) would run more than once per day." The `crons` block was therefore removed from `vercel.json`; the schedules live in `.github/workflows/cron.yml` and call the same endpoints over HTTPS with `x-cron-secret: $CRON_SECRET`:

  | Endpoint | Schedule (UTC) | Job |
  |---|---|---|
  | `/api/cron/whatsapp-retries` | `*/5 * * * *` | bounded retry sweep for failed WhatsApp sends |
  | `/api/cron/requests` | `*/15 * * * *` | nudges workers on stale requests at 24h, auto-cancels at 48h (idempotent via `Booking.lastSlaNudgeAt`) |
  | `/api/cron/completions` | `0 * * * *` | auto-confirms staged completions past the 72h grace window (idempotent via the COMPLETION_PENDING CAS) |
  | `/api/cron/masked-numbers-expire` | `5 * * * *` | expires call-masking windows |
  | `/api/cron/recurring` | `0 2 * * *` | materializes maintenance-contract occurrences (idempotent) |
  | `/api/cron/digest` | `0 6 * * *` | daily digest |
  | `/api/cron/reminders` | `0 7 * * *` | booking + subscription reminders |
  | `/api/cron/admin-digest` | `0 8 * * 1` | weekly admin digest (Mondays) — needs `ADMIN_WHATSAPP_NUMBERS` plus WhatsApp credentials |
  | `/api/cron/push-prune` | `0 3 * * 0` | push-subscription cleanup (Sundays) |
  | `/api/cron/activity-prune` | `30 3 * * 0` | audit-table retention, bounded by `ACTIVITY_LOG_RETENTION_DAYS` (default 90) |

  **Required secret:** `CRON_SECRET` (GitHub → Settings → Secrets and variables → Actions), matching the value in Vercel's production env. Every `/api/cron/*` route is fail-closed — with the variable unset it returns 401 by design. Optionally set the repository *variable* `APP_URL` to target a non-production host.

  GitHub's scheduler is best-effort: `*/5` ticks typically land 5–15 minutes apart and scheduled workflows are paused after 60 days without repo activity. Any external pinger (cron-job.org, a VPS crontab, Cloud Scheduler) can drive the same endpoints with `curl -H "x-cron-secret: $CRON_SECRET" https://<host>/api/cron/<job>`; all of the jobs are idempotent, so an extra run is harmless and a missed one self-heals on the next tick. `workflow_dispatch` on the workflow hits every endpoint at once, which is also the smoke test after a deploy.

## 2. Docker

```bash
docker compose up -d --build          # full stack (postgres + app)
# or just the app with an external DB:
docker build -t workersarena . && docker run -p 3000:3000 workersarena
```

Multi-stage Dockerfile: deps → build (`prisma generate`, `next build`) → slim `standalone` runtime as a non-root user.

## 3. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | prod | PostgreSQL DSN |
| `DEMO_MODE` | dev | `"true"` = embedded dataset, no DB. **The live deployment deliberately runs `true`** — it is a demo showcase serving the embedded dataset, not the seeded Postgres rows. See “Demo-mode deployments” below before changing it. |
| `AUTH_SECRET` | prod | long random string |
| `NEXT_PUBLIC_APP_URL` | both | canonical URL for SEO/manifest |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | prod push | Generate once with `npx web-push generate-vapid-keys`; store both keys and the subject in the deployment secret manager. Never commit the private key. |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | prod WhatsApp | Meta WhatsApp Cloud API credentials (system-user token + phone number id). With `NOTIFY_WHATSAPP_PROVIDER=whatsapp-cloud`, every automated send lands in the delivery ledger (`WhatsAppDelivery` table) shown on `/admin`. |
| `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET` | prod WhatsApp webhook | Webhook handshake token and app secret for `https://<domain>/api/webhooks/whatsapp` (subscribe to the `messages` field in Meta's webhook config; the app verifies `X-Hub-Signature-256` when the app secret is set). |
| `ADMIN_WHATSAPP_NUMBERS` | prod admin digest | Comma-separated E.164 admin phones (e.g. `+9613123456,+9617654321`) that receive the weekly admin WhatsApp digest (`POST /api/cron/admin-digest`, cron-gated via `x-cron-secret`). Each digest carries the 30-day emergency-surge verdict and its tuning line so the Phase-2 decision stays visible during the measurement window; unset leaves the endpoint returning `recipients: 0` without paging the scheduler. |
| `ADMIN_EMAILS` | prod admin digest | Comma-separated admin addresses that receive the same weekly digest as HTML email (via `EMAIL_PROVIDER`). Suffix an address with `#ar` (e.g. `admin@workersarena.com#ar`) to receive the Arabic body; plain addresses get English with the full text part. Sections: failed WhatsApp deliveries (24h + dead letters), the pending lead-refund review queue, and at-risk renewals (expiring ≤30 days). Unset → no email leg; the WhatsApp leg runs independently. |
| `STRIPE_SECRET_KEY` / `PAYPAL_CLIENT_ID` / `MYFATOORAH_API_TOKEN` / `TAP_SECRET_KEY` | prod | payments |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` + API keys | prod | media |
| `REDIS_URL` | prod | caching + rate limiting |

### Demo-mode deployments (the current production posture)

Production runs `DEMO_MODE=true` on purpose: the deployment is a public showcase of the embedded dataset. Two consequences are easy to get wrong, so they are recorded here.

**1. Sessions are still signed, and the demo cookie is not a bypass.** `wa_session` is an HMAC-signed payload; production refuses an unsigned or tampered cookie regardless of `DEMO_MODE` (`unsignedDemoCookieAllowed()` in `src/lib/security.ts`, opted into only by `ALLOW_UNSIGNED_DEMO_COOKIE=1`, which the E2E harnesses set). The one-click demo logins on `/auth/login` work because they go through `setSession()`, which signs. `DEMO_MODE` is a *dataset* switch; it stopped being a *trust* switch after a forged `wa_session={"role":"admin"}` cookie returned real figures from `/api/admin/retention` on the live site — that request now answers 401.

**2. The file-backed stores cannot persist on Vercel.** With `DEMO_MODE=true` the activity feed, inbox and push store use their file adapters, and a serverless filesystem is read-only apart from `/tmp`. Writes report failure instead of throwing (`pruneActivityLog` returns `persisted: false`, logged once), so `/api/cron/activity-prune` answers 200 with an explicit `persisted: false` rather than 500 — but nothing is retained. Move to the Prisma adapters (`DEMO_MODE=false` + `DATABASE_URL` + a real `AUTH_SECRET`) when the deployment is meant to serve real data; the guard in `realAuthEnabled()` falls back to demo mode and logs loudly if the secret is still a placeholder, so verify the secret before flipping the flag or every existing session is refused.

## 4. Redis caching (production)

```ts
// lib/server/cache.ts
const cache = new RedisCache(process.env.REDIS_URL);
await cache.getOrSet("workers:plumbing:riyadh", () => prisma.worker.findMany(...), 60);
```

Invalidate on worker/subscription changes (`cache.del("workers:*")`). Also backs rate limiting and session blacklists.

## 5. Media (Cloudinary)

Workers upload avatars, covers, certifications and portfolio images → Cloudinary upload API → store `secure_url` + `publicId` in `Media`. Use `next/image` with `remotePatterns` (remove `images.unoptimized` from `next.config.ts`).

### Web Push production gate

Run `npm run check:vapid` in the production environment before enabling `NOTIFY_PUSH_ENABLED=true`. The check deliberately fails in real mode when any VAPID value is missing, while demo mode continues to use the console provider. Configure the same durable key pair across all server instances; rotating only the public key invalidates existing browser subscriptions. Test push permission and delivery on Android Chrome and iPad/iPhone Safari after deployment; iOS requires an installed Home Screen PWA and user-initiated permission.

## 6. Observability

- Vercel Analytics + Speed Insights for traffic/performance.
- `pino`/Sentry for structured logs & errors; `ActivityLog` for audit.
- Health check: `GET /api/health` used by Docker healthchecks / uptime monitors.

## 7. Security hardening checklist

- [ ] CSP + `poweredByHeader: false` (done) + HSTS at the edge
- [ ] Rate limits on auth, contact, review endpoints
- [ ] `.env` never committed; secrets rotated
- [ ] `AUTH_SECRET` set; HTTPS enforced
- [ ] Webhook signature verification enabled for all payment providers
