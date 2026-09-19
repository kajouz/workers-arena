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

- **PostgreSQL:** Neon / Supabase / RDS. Run `npx prisma migrate deploy` then `npm run db:seed` (one-time). The seed is country-parameterized — `SEED_COUNTRY=<slug|ISO code>` (or `all`) picks which configured countries' cities + generated demo workers to load; it defaults to the served tenant.

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
- **Cron:** add `vercel.json` cron entries for the subscription/booking-reminder job (`/api/cron/reminders`, daily), the recurring-generation job (`/api/cron/recurring`, daily — materializes maintenance-contract occurrences, idempotent), the request-SLA job (`/api/cron/requests`, hourly or daily — nudges workers on stale requests at 24h and auto-cancels at 48h, freeing the slot; idempotent via `Booking.lastSlaNudgeAt`), the completion auto-confirm job (`/api/cron/completions`, hourly or daily — auto-confirms staged completions past the 72h grace window, crediting the worker's ledger; idempotent via the COMPLETION_PENDING CAS), push-cleanup (`/api/cron/push-prune`) and activity-retention (`/api/cron/activity-prune`) jobs, each with the `x-cron-secret: $CRON_SECRET` header. The daily jobs (reminders + recurring + request-SLA + completions) can share one entry cadence. Set `ACTIVITY_LOG_RETENTION_DAYS` to bound the audit table (default 90).

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
| `DEMO_MODE` | dev | `"true"` = embedded dataset, no DB |
| `AUTH_SECRET` | prod | long random string |
| `NEXT_PUBLIC_APP_URL` | both | canonical URL for SEO/manifest |
| `STRIPE_SECRET_KEY` / `PAYPAL_CLIENT_ID` / `MYFATOORAH_API_TOKEN` / `TAP_SECRET_KEY` | prod | payments |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` + API keys | prod | media |
| `REDIS_URL` | prod | caching + rate limiting |

## 4. Redis caching (production)

```ts
// lib/server/cache.ts
const cache = new RedisCache(process.env.REDIS_URL);
await cache.getOrSet("workers:plumbing:riyadh", () => prisma.worker.findMany(...), 60);
```

Invalidate on worker/subscription changes (`cache.del("workers:*")`). Also backs rate limiting and session blacklists.

## 5. Media (Cloudinary)

Workers upload avatars, covers, certifications and portfolio images → Cloudinary upload API → store `secure_url` + `publicId` in `Media`. Use `next/image` with `remotePatterns` (remove `images.unoptimized` from `next.config.ts`).

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
