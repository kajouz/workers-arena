# 🛠️ WorkersArena — Professional Workers Directory

[![CI](https://github.com/kajouz/workers-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/kajouz/workers-arena/actions/workflows/ci.yml)

Source & issues: [github.com/kajouz/workers-arena](https://github.com/kajouz/workers-arena)

A **production-ready, bilingual (English LTR / Arabic RTL) SaaS marketplace** where customers find, compare and hire trusted professional workers — plumbers, electricians, AC technicians, carpenters and 20+ more trades — while workers grow their business with subscriptions and companies advertise to a qualified audience.

Built on **Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS 4 · shadcn/ui-style Radix components · Framer Motion · Zustand · React Hook Form · Zod · Prisma · PostgreSQL** — and designed for Vercel + Docker deployment.

> ⚡ **Demo mode:** the app runs out of the box with a rich embedded bilingual dataset — no database required. Flip `DEMO_MODE=false` and run the seed to go full PostgreSQL.

---

## ✨ Feature highlights

| Area | What's included |
|---|---|
| **i18n** | Full Arabic (RTL) + English (LTR). Auto-detection via cookie → `Accept-Language`, one-click switch, logical CSS everywhere |
| **Search** | Fuzzy + Arabic-normalized matching, autocomplete, filters (category, city, area, rating, price, experience, availability, verified/featured/24-7), 7 sort modes incl. "nearest", infinite scroll, skeleton loading, **voice search** |
| **Worker profiles** | Gradient cover art, gallery, bio, services & pricing, certifications, working hours, service-area map (OpenStreetMap), rating distribution, review form, **QR code**, share, favorite, related workers, JSON-LD schema |
| **Dashboards** | Worker (stats, views chart, subscription status/renewal, reviews), **Admin** (KPIs, revenue chart, category bars, plan donut, top workers, activity log, alerts, search trends), **Company** (campaigns, impressions/clicks/CTR, budgets, invoices, ad types) |
| **Ads** | 8 ad formats (banner, slider, featured, sponsored search/category, popup, native, video) + sponsored slots on the homepage & footer |
| **Auth** | Demo cookie sessions with 4 roles (customer / worker / company / admin); Auth.js (NextAuth v5) integration ready in `src/auth.ts` |
| **Payments** | Modular gateway architecture: Stripe · PayPal · MyFatoorah · Tap · bank transfer · cash (docs/PAYMENTS.md) |
| **DB** | 30+ model Prisma schema — users, workers, subscriptions, payments, invoices, ads, reviews (moderated), favorites, leads, notifications, analytics, audit logs (docs in `prisma/schema.prisma`) |
| **Platform** | REST APIs, Server Actions, SEO (sitemap/robots/JSON-LD), PWA manifest, dark mode, toasts, responsive & accessible |

---

## 🚀 Quick start (demo — no DB needed)

```bash
npm install
npm run dev        # → http://localhost:3001
```

Then explore:

- `/` — landing with hero search, categories, featured pros, pricing
- `/search` — the full search engine
- `/workers/khaled-al-harbi-plumbing` — a worker profile (QR, reviews, map…)
- `/auth/login` — **demo accounts** (Customer / Worker / Company / Admin) — one click signs you in
- `/dashboard` · `/admin` · `/company` — role-based dashboards
- Toggle 🌙 dark mode and the **العربية** language switcher (full RTL)

## 🗄️ Full stack (PostgreSQL + Docker)

```bash
docker compose up -d postgres
cp .env.example .env && sed -i '' 's/DEMO_MODE="true"/DEMO_MODE="false"/' .env
npx prisma migrate dev
npm run db:seed
npm run dev
```

## 🧪 Quality

[![CI](https://github.com/kajouz/workers-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/kajouz/workers-arena/actions/workflows/ci.yml)

```bash
npm run typecheck          # strict tsc
npm test                   # vitest — search engine, i18n parity, formatting
npm run test:e2e           # E2E hydration smoke — dev + production-build matrix (needs Chrome)
npm run test:e2e:quick     # same, dev matrix only — skips the ~1-2 min production build
npm run test:e2e:autoclean # same, but the pre-run check removes crash artifacts instead of rejecting
npm run test:all           # typecheck + the full test suite
npm run build              # production build
```

CI is codified in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) — on every push/PR: typecheck + unit suite, E2E quick (dev matrix), and full E2E (dev + prod-build matrix), each on its own runner; plus a nightly live-Postgres `db:smoke` (+ prisma chain tests) that you can also trigger on demand from the Actions tab.

**E2E pre-run check env flags** (`tests/e2e-smoke.test.ts`): before booting anything, the check rejects fast if a crashed run left artifacts — the doubled-path tree (`<root>/Users` · `<root>/home` · a drive-letter segment), leftover `.data/.next-e2e-*` isolated dist dirs, stale `.data/.next-e2e` entries in `tsconfig.json`'s include array — or if the disk is critically full:

| Flag | Effect |
|---|---|
| `E2E_AUTOCLEAN=1` | Print and **remove** the crash artifacts instead of rejecting (leftover dist dirs, the doubled tree, stale include lines), log the freed space tied to the artifacts ("autoclean removed 1 dir + 1 stale tsconfig line, freed 0.020 GiB (47.50 → 47.52 GiB free)") plus a parseable `E2E_AUTOCLEAN_RESULT=<freed>|<before>|<after>|<dirs>|<tsconfig lines>` line (3-decimal freed, 2-decimal before/after) — **emitted on every autoclean run, even when freed is 0.000**, so CI sees a record per run — then re-check the workspace. `npm run test:e2e:autoclean` sets it for you. |
| `E2E_MIN_FREE_GB=<n>` | Free-disk floor before the build starts — default `5` GiB, `0` disables, garbage falls back to the default. |
| `E2E_SKIP_PROD=1` | Skip the ~1-2 min `next build` + `next start` matrix (the dev matrix still runs). `npm run test:e2e:quick` sets it for you. |

## 📚 Documentation

| Doc | Covers |
|---|---|
| [docs/README.md](docs/README.md) | **Docs index** — cross-reference table linking every doc; start here |
| [docs/INTERACTION-WORKFLOWS.md](docs/INTERACTION-WORKFLOWS.md) | **Interaction workflows & revenue map** — every directed user⇄worker / admin⇄user / admin⇄worker / admin⇄company flow (with Mermaid diagrams) + the revenue each party generates |
| [docs/PRODUCT.md](docs/PRODUCT.md) | **Living product plan** — full feature inventory, improvement roadmap, and iOS/Android app plan |
| [docs/ENHANCEMENT-PLAN.md](docs/ENHANCEMENT-PLAN.md) | **Enhancement plan** — prioritized features + workflow items with ship statuses |
| [docs/BUSINESS-MODEL.md](docs/BUSINESS-MODEL.md) | **Business model & revenue growth plan** — subscriptions, advertising, take rate, unit economics |
| [docs/selection-workflow.md](docs/selection-workflow.md) | **Worker ↔ customer selection workflow** — discovery → booking → accept/decline → execution, with the trust guarantees |
| [docs/multi-candidate-quotes.md](docs/multi-candidate-quotes.md) | **Multi-candidate quotes** — request quotes from up to 3 workers, then pick the winner |
| [docs/booking-take-rate.md](docs/booking-take-rate.md) | **Booking take rate (M5)** — the 7% platform fee: rate/floor/cap, stamp-at-accept, exemption, settlement |
| [docs/payouts.md](docs/payouts.md) | **Worker payouts** — ledger, earnings at completion, withdraw → admin review queue |
| [docs/mobile-architecture.md](docs/mobile-architecture.md) | **Mobile (M2/M3)** — Capacitor project layout, FCM/APNs push providers, deep-link routes, store-launch checklist |
| [docs/booking-scheduling.md](docs/booking-scheduling.md) | **Booking & scheduling (P1)** — Prisma model + migration proposal, repo seam, worker-dashboard UI plan, milestones |
| [docs/booking-customer-ui.md](docs/booking-customer-ui.md) | **Booking customer UI (P1)** — request dialog (service → slot → details), `/bookings` tracking page, full i18n keys |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, folder structure, data flow, security, AI features, scaling |
| [docs/API.md](docs/API.md) | REST endpoints, Server Actions, webhooks, error model |
| [docs/PAYMENTS.md](docs/PAYMENTS.md) | Stripe/PayPal/MyFatoorah/Tap/bank/cash modular architecture |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Vercel, Docker, env vars, Redis cache, observability |

## 📁 Structure (highlights)

```
src/
  app/            # App Router — pages, API routes, sitemap/robots/manifest
  components/     # ui/* (design system), layout/*, home/*, search/*, worker/*, dashboard/*
  lib/
    i18n/         # EN/AR dictionaries, locale detection, RTL
    data/         # domain types, bilingual dataset, search engine, repository seam
    server/       # prisma singleton
  hooks/          # debounce, infinite scroll, voice search
prisma/           # complete PostgreSQL schema + seeder
tests/            # vitest suites
docs/             # architecture & ops docs
```

## 🔐 Notes on demo vs production

- **Demo mode** (`DEMO_MODE=true`) serves `src/lib/data/*` — the same dataset the seeder writes to PostgreSQL, so previews and production stay consistent.
- **Production** swaps the repository functions in `src/lib/data/repo.ts` for Prisma queries (identical signatures), enables Auth.js, real payments, Cloudinary uploads and Redis caching — each documented in `docs/`.

---

## 🧑‍💻 Development & contributing

**Clone**

```bash
git clone git@github.com:kajouz/workers-arena.git   # SSH
git clone https://github.com/kajouz/workers-arena.git # HTTPS
```

**Setup** (demo mode — no database required)

```bash
cd workers-arena
npm install
cp .env.example .env   # defaults are demo-mode ready
npm run dev            # → http://localhost:3001
```

For the full PostgreSQL stack (Auth.js, real payments), follow the **Full stack (PostgreSQL + Docker)** section above: `docker compose up -d postgres`, flip `DEMO_MODE="false"`, `npx prisma migrate dev`, `npm run db:seed`.

**Test** — every stage of the ladder lives in the **Quality** section above and CI runs it automatically on every push/PR (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
npm run test:all        # the full gate: typecheck + unit + E2E (dev & prod-build matrices)
npm run test:e2e:quick  # fast browser pass (dev matrix only)
npm run test:e2e:autoclean  # self-healing E2E (E2E_AUTOCLEAN=1)
npm run db:smoke        # live-Postgres booking/campaign smoke (needs the seed)
```

**Opening a PR**

- Branch from `main` and keep changes focused; the CI badge at the top of this README shows the current workflow status.
- Run `npm run test:all` locally before pushing — CI mirrors it (typecheck + unit, E2E quick, E2E full, each on its own runner).
- The E2E pre-run check fails fast on crash artifacts and full disks: use `npm run test:e2e:autoclean` (or `E2E_AUTOCLEAN=1`) to have it clean up and re-run instead.
- The live-DB suites (`npm run db:smoke`, the prisma chain tests) must run **serially**, never concurrently — they share one `DATABASE_URL` (details in `.freebuff/run.md`).
- Docs live in `docs/` (product plan, booking, payments, mobile, architecture…); update the relevant one when a feature changes behavior.
