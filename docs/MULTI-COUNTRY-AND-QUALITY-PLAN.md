# WorkersArena — Multi-Country Readiness & Quality Plan

[← Back to docs index](README.md)

> **Living document.** The answer to two questions: *is Lebanon a real, first-class tenant today?* and *can this codebase carry a second country tomorrow?* — followed by the prioritized plan to close the gaps: **eliminate bugs** (currency/tenant drift, workspace hygiene) and **enhance UX**. Companion to [ARCHITECTURE.md](ARCHITECTURE.md), [PRODUCT.md](PRODUCT.md), [PAYMENTS.md](PAYMENTS.md), and [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md).

**Status legend** — ✅ done · 🟡 partial · 🔜 designed, not built · 💡 proposed.

---

## 0. Verdict (the short answer)

| Question | Answer |
|---|---|
| Is Lebanon supported as an existing tenant? | **Yes — it is *the* tenant.** Lebanon is first-class and fully wired: `TENANT_SLUG = "lb"`, Beirut + 5 neighborhoods in the catalog, USD pricing, OMT/Whish manual payment rails, `.lb` seed identities, `+961` numbers, `ar-LB` formatting, and a Lebanon `addressCountry` in structured data. |
| Can it carry different countries at a later stage? | **Yes — the country is a configuration, data included.** A `CountryConfig` registry (`src/lib/tenant/countries.ts`) owns currency, locale, dial code, SEO region, geo centers, **its cities**, and the metadata its **demo workforce is generated from**; the ~10 places that hardcoded Lebanon now read from it (verified by a guard test), and `SEED_COUNTRY=<slug> npm run db:seed` populates any configured country's cities + workers. What's left is the *topology* decision (§2.3) — one deployment or one per country. |

**The headline risk:** the app was scoped to Lebanon-only *after* it had been a multi-country product. Residue from the earlier scope (SAR/AED/EGP/LBP mocks, duplicate currency modules) is still live and contradicts the USD-only tenant — that drift is the single largest source of user-visible bugs today, and it is also the biggest obstacle to re-adding countries. **Fixing the drift and building the multi-country seam are the same work.**

---

## 1. Lebanon tenant — what exists today

Evidence, not vibes:

| Concern | Where it lives | State |
|---|---|---|
| Tenant identity | `src/lib/tenant/countries.ts` → `DEFAULT_COUNTRY`; `TENANT_SLUG` derives from it | ✅ registry |
| City + areas catalog | `CountryConfig.cities` (Beirut · Achrafieh, Hamra, Gemmayzeh, Mar Mikhael, Badaro) **projected** by `src/lib/data/cities.ts` → `CITIES` | ✅ config-driven |
| Country fields | `City.countryEn/countryAr` (`src/lib/data/types.ts`), `City` model carries `countryEn/countryAr/currency/isActive` (`prisma/schema.prisma`) | ✅ data model is country-aware |
| Currency | one `formatPrice` in `src/lib/currency.ts`; **which** currency is `CountryConfig.currency` | ✅ config-driven |
| Payments | OMT + Whish manual providers, `/payments/manual`, admin pending-payments card ([PAYMENTS.md](PAYMENTS.md) §"Lebanon launch") | ✅ |
| Seed identity | **Generated per country** — `CountryConfig.demoWorkforce` (names, mobile prefixes, email TLD) × the shared role recipes (`src/lib/data/worker-recipes.ts`) → `+961` phones, `*.lb` emails for lb ([§2.3](#23-shipped-shape-)) | ✅ generated |
| Localization | `en` / `ar`, with Intl tags from `CountryConfig.intlLocale` | ✅ config-driven |
| SEO | `addressCountry` = the worker's/city's `CountryConfig.code`; `areaServed` = the configured countries | ✅ derived |
| Geo center | `CITY_COORDINATES` derived from `CITIES[].lat/lng` | ✅ one source |

**Conclusion:** Lebanon is genuinely supported as a tenant — not a demo stub. The gap is not "add Lebanon"; it is "make Lebanon a *configuration* rather than a constant".

---

## 2. Multi-country readiness — the seam inventory

### 2.1 What already generalizes ✅

- **`City` is a country-aware row.** `countryEn`, `countryAr`, `currency`, `lat`/`lng`, `isActive`, plus an `Area[]` child relation. Adding a new city/country is a data insert, not a schema migration.
- **`getCities` reads real rows** in real mode, with the demo catalog's order preserved — so the search dropdown already cannot drift between demo and prisma ([ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) §3.2).
- **Payments are provider-based.** The registry (`src/lib/payments/registry.ts`) already knows Stripe, PayPal, MyFatoorah, Tap, bank transfer, cash — a new country can declare a different provider set without touching money flows.
- **`isActive`** exists on `City`, ready to gate a country that isn't launched yet.

### 2.2 What hardcoded Lebanon ✅ (resolved)

Every country assumption now reads from the registry — each row was a place a second country would have silently inherited Lebanon.

| # | Was | Now |
|---|---|---|
| 1 | `CurrencyCode` **defined twice** (`utils.ts` + `currency.ts`) | ONE definition in `src/lib/currency.ts`, re-exported by `@/lib/utils` |
| 2–3 | Two divergent `formatPrice`s, each ignoring its currency param | One currency-aware `formatPrice` (symbol + placement from `CURRENCIES`) |
| 4 | `CITY_COORDINATES = { beirut: … }` — a second coordinate map | **Derived** from `CITIES[].lat/lng` (one source; the map's keys are exactly the catalog's cities) |
| 5 | `CITY_NAMES` map duplicating the catalog in the city page | `cityBySlug()` + `countryOfCity()`; a new catalog city can no longer 404 |
| 6 | `addressCountry: "LB"` in worker structured data | The worker's city → its `CountryConfig.code` (falls back to the served country) |
| 7 | A bare `0…` WhatsApp number defaulted to `+961` | `dialCode` from the registry (still overridable per call site) |
| 8 | `ar-LB` / `ar-EG` literals at ~18 format sites | `intlLocale(locale)` / `speechLocale(locale)`. **Second pass:** four date formatters still hardcoded `ar-SA`/`en-GB` (they rendered "٥ مارس" beside the app's "٥ آذار") — now on the shared formatters, and `tests/arabic-dates.test.ts` fails on any literal tag in a date formatter |
| 9 | `CurrencyProvider` hardcoded `"USD"`; `defaultCurrency` accepted but **ignored** | Honours the prop, defaulting to `DEFAULT_COUNTRY.currency` |
| 10 | `+961 …` placeholders in 6 UI inputs + the i18n guest-lookup value | `dialPrefix()`; the i18n value is now national-format only |
| 11 | `prisma/seed.ts` + `src/lib/data/workers.ts` — all-Beirut, all-`+961`, all-`.lb` | Cities come from `CountryConfig.cities`; workers are **generated** from the shared recipes + `demoWorkforce`; the seed takes `SEED_COUNTRY` (§2.3) |
| 12 | No runtime notion of the served country | `DEFAULT_COUNTRY` + lookups exist, but it is still a **build-time** constant — per-request resolution is the topology decision below |

### 2.3 Shipped shape ✅

```
src/lib/tenant/countries.ts   # CountryConfig registry (leaf module — no runtime imports)
```

`CountryConfig` owns the five country-scoped facts, and nothing else re-declares them:

| Field | Drives |
|---|---|
| `currency` | `TENANT_CURRENCY`, `getDefaultCurrency()`, `CurrencyProvider`'s default |
| `intlLocale` / `speechLocale` | every `Intl` number/date formatter and the voice-recognition tag |
| `dialCode` | WhatsApp deep links, every phone input placeholder, the guest-lookup placeholder |
| `code` | schema.org `addressCountry` (worker profiles, city pages) + `areaServed` |
| `cities` (`CitySeed[]`) | the city catalog — `citiesForCountry()` projects them into `City` rows (country name + currency inherited from the config, so a row can never drift) |
| `demoWorkforce` (`names` × role recipes, `phonePrefixes`, `emailTld`) | the demo worker dataset — names pair with the shared recipes by index, phones are built from `dialCode` + a prefix, email/website domains from the recipe brand + TLD |
| `timeZone`, `paymentMethods`, `slug`, `nameEn/nameAr` | tenant slug, city catalog composition, provider availability (country-onboarding kit) |

### Adding a country (the runbook)

1. Add ONE entry to `COUNTRIES` in `src/lib/tenant/countries.ts`: code, slug, names, `dialCode`, `currency`, locales, `timeZone`, `paymentMethods`, **`cities`** (with their areas) and **`demoWorkforce`** (`names` — one per recipe — plus `phonePrefixes` and `emailTld`).
2. `SEED_COUNTRY=<slug|ISO code> npm run db:seed` (or `SEED_COUNTRY=all`) — cities + the generated workforce land in Postgres; nothing in `prisma/seed.ts`, `src/lib/data/cities.ts` or `src/lib/data/workers.ts` needs editing.
3. `npx vitest run tests/tenant-countries.test.ts tests/seed-workforce.test.ts` — the contract tests assert the new country's workers land in its own cities with its own dial code, currency and TLD (a synthetic country in `tests/seed-workforce.test.ts` proves exactly this with no registry edit).

Add a worker ROLE by appending one `WORKER_RECIPE` (and one name per country) — pricing, trust flags and brand live in the recipe; **who** fills it stays a country fact.

Helpers: `countryBySlug` / `countryByCode` / `countryByName` (a `City` row carries a country NAME, so it resolves without a schema change), `intlLocale`, `speechLocale`, `dialPrefix`, `currencyForCountry`. The city catalog composes its `countryEn/countryAr/currency` from the registry; `cityBySlug` / `countryOfCity` / `citiesOfCountry` are the catalog's read helpers.

**The demo dataset is generated, bit-for-bit stable.** The Lebanon workforce is unchanged by the refactor (verified against a pre-refactor snapshot of all 18 workers), because the city/area assignment is a round-robin that the old hand-written rows already followed and the recipes carry the per-worker phone tail/brand. `tests/seed-workforce.test.ts` pins the contact details other suites depend on (`khaled@plumbfix.lb`, `+961 70 123 456`, the demo slugs) so generated output can never silently drift.

**Still open (the topology call):** *one deployment serving many countries* (`Country` FK on the data, tenant resolved per request) vs. **one deployment per country** (shared codebase, per-country env + DB). The codebase models the second — a single `DEFAULT_COUNTRY`, no per-request resolver, and a seed whose countries are selected by env rather than resolved per request. Decide before country #2 carries real data, since it determines whether resolution is a header/subdomain router or a build-time env.

---

## 3. Bug-elimination plan

### 3.1 P0 — currency & tenant drift (user-visible today) ✅ shipped

The pre-Lebanon multi-country scope was still shipping to users. Each row below was a real contradiction of the "single tenant lb, USD $, Beirut" model:

| Bug (fixed) | Location | Symptom |
|---|---|---|
| Wallet shows a **LBP** balance beside a USD one | `src/components/dashboard/flexible-payments.tsx` (~`:138`) — **mounted** via `worker-revenue-tools.tsx` | Worker sees two currencies for one wallet. |
| Admin customer list is **SAR/AED/EGP** mock data | `src/components/dashboard/customer-management.tsx` — **mounted at `/admin/customers`** | Admin sees non-existent foreign-currency customers. |
| Invoice generator **defaults to SAR** and offers SAR/AED/EGP/LBP | `src/components/dashboard/invoice-management.tsx` (`:317`, `:867–871`) | A Lebanon invoice can be minted in the wrong currency. |
| Trade FAQ copy quotes **SAR** prices | `src/app/trades/[trade]/page.tsx` (`:24`, `:54`) | Public SEO page advertises Saudi Riyal to Lebanese users. |
| Admin activity/global-search mocks say **SAR 119** | `src/components/admin/activity/activity-feed.tsx`, `src/components/admin/search/global-search.tsx` | Admin surfaces show a currency the platform doesn't use. |
| Platform settings offers USD/LBP/SAR | `src/components/admin/platform-settings.tsx` (`:103`) | Settings imply multi-currency that the type system forbids. |
| **Two** `CurrencyCode` types + **two** divergent `formatPrice`s | `src/lib/utils.ts` vs `src/lib/currency.ts` | Same price formats differently by import path; future changes must be made twice. |
| Docs say "LBP currency" while code says USD | [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) §1, `src/lib/utils.ts` | Readers and code disagree on the tenant's currency. |

A second sweep caught the same class in **demo copy and derived claims** — the story the demo tells about where the platform operates:

| Bug (fixed) | Location | Symptom |
|---|---|---|
| Sponsored banner advertises **"Villa construction — Riyadh"** (plus Jeddah/Dubai campaigns) | `src/lib/data/campaigns.ts` (demo adapter `c1`–`c3`) | The public homepage sells a Saudi ad campaign; the prisma seed already said Beirut. |
| Testimonials come from **Riyadh / Dubai / Amman** | `src/components/home/testimonials.tsx` | Social proof from countries the tenant cannot serve (roles were also EN-only in the AR UI). |
| Hero showcase card prices a job in **SAR** (`150 ر.س`) | `src/components/home/hero.tsx` | A hardcoded Gulf price — the Arabic short form slipped past the code-only currency scan. |
| Stats band renders **0 / 0+ / 0%** | `src/components/home/stats-band.tsx` | The count-up *started* at 0 and only reached its value if the animation ran, so the band read zeroed in SSR HTML, no-JS and every screenshot. |
| About page promises **"11 cities in Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman, Jordan, Lebanon, Egypt, and Morocco"** | `src/app/about/page.tsx` | A coverage claim contradicting the registry — the same page's structured data already derived `areaServed`. |
| Blog post "How to Find a Reliable Plumber in **Riyadh**"; campaign-builder placeholders; security-dashboard logins from Dubai/Riyadh with `.sa` emails | `src/lib/content/content-service.ts`, `src/components/dashboard/{campaign-builder,security-dashboard}.tsx` | Remaining old-dataset copy in shipping surfaces. **✅ fixed** — `src/` is now clean of every non-tenant city name (`tests/tenant-countries.test.ts` locks it), and the last stale prose in the **docs** was swept the same way: BUSINESS-MODEL's "SAR/AED/USD, cities like Riyadh, Jeddah, Dubai" cover line, booking-take-rate's `SAR 5`/`SAR 300` fee table (the constants are `$5`/`$300`), payouts' "Khaled → SAR" currency assumption, ADVERTISING-SYSTEM's `city="riyadh"` example, and the Riyadh examples in ENHANCEMENT-PLAN/PRODUCT. `docs/` carries no foreign currency or city left (the one remaining hit is TESTING-PROCEDURES' *assertion* that no `LBP`/`SAR`/`AED` appears in the UI). |

**✅ Fixed:** coverage claims are now **derived, not typed** — the about page's city/country list reads `CountryConfig.cities` (and its stat reads `1 City Covered`), and the stats band takes `citiesServed` from the server page (`1 City served`, with proper EN singular) while its numbers keep the aspirational voice the hero's "trusted by 50,000+" sets. The count-up is now additive: the number renders its **true value** in SSR/no-JS/off-screen DOM and only drops to 0 *off-screen*, pre-triggered by a 200px observer margin, so nothing ever shows a zeroed counter. Two guards in `tests/tenant-countries.test.ts` / `tests/currency-contract.test.ts` lock it: **no non-tenant city name may appear anywhere under `src`** (it found the about-page claim) and the foreign-currency scan now also rejects the Arabic short forms `ر.س` / `د.إ`.

**✅ Fixed:** `CurrencyCode` + `formatPrice` now live **only** in `src/lib/currency.ts` (import-site compatible via a `@/lib/utils` re-export), with `CURRENCIES`/`TENANT_CURRENCY` driving the symbol and placement. Every SAR/AED/EGP/LBP/JOD literal is gone from the UI, admin mocks and the wallet API; the stale doc claims (PRODUCT.md "multi-currency", PAYMENTS/ENHANCEMENT-PLAN/BUSINESS-MODEL "LBP", REVENUE-STREAMS "secondary LBP", the TESTING-PROCEDURES currency-selector steps) are reconciled to USD. `tests/currency-contract.test.ts` locks both invariants (single definition; no foreign-currency literals under `src/components` + `src/app`).

### 3.2 P0 — workspace hygiene breaks CI ✅ shipped

`npm test` used to fail 1 suite (`tests/e2e-smoke.test.ts`) — not on product logic, but on its own pre-run guard, whenever a previous run had been hard-killed:

```
E2E pre-run check failed — a crashed run left artifacts behind:
  • leftover isolated dist dir at .data/.next-e2e-50196
  • leftover isolated dist dir at .data/.next-e2e-50285
  • 4 stale .next-e2e include entries in tsconfig.json
```

A SIGKILL / OOM / CI hard-timeout rewrites `tsconfig.json` (adding `.data/.next-e2e-*` include entries) and leaves isolated `.next` dist dirs behind — neither `afterAll` nor the SIGINT/SIGTERM guard runs. The next run then refused to start until a human cleaned up.

**✅ Fixed — self-healing is now the default.**

- The pre-run check **heals** instead of rejecting: it prints the artifacts, removes them, logs the freed space + the `E2E_AUTOCLEAN_RESULT=` record, re-checks, and proceeds. `E2E_AUTOCLEAN=0` opts back into strict reject-and-list; `E2E_AUTOCLEAN=1` (what CI and `npm run test:e2e:autoclean` set) still means self-heal.
- **A live run's cache is never deleted.** An isolated dist dir name encodes its owner PID, so a dir whose PID is still running (a concurrent E2E in the same checkout) is reported and left in place, and the run fails with a clear "still owned by a running process (PID n)" message rather than corrupting that run.
- The **signal guard now drops this run's dist dirs too**, not just the tsconfig backup — so Ctrl-C / CI-timeout leaves nothing behind at all. Only SIGKILL falls through to the pre-run self-heal, which is the backstop that closes the loop.
- Verified on this repo: a crashed run's 2 leftover dist dirs + 4 stale `tsconfig.json` entries were healed automatically on the next `npm test` (`autoclean removed 2 dirs + 4 stale tsconfig lines`), and `tsconfig.json` returned to its committed state. 4 new unit tests cover the default, the opt-out, the announced heal, and the live-PID safety (`tests/e2e-smoke.test.ts`).

### 3.3 P1 — correctness & robustness

- **Batch N+1 on search reads** — `stampWorkerSignals` batches, but verify filter/sort paths that still fetch per-worker relations.
- **`distanceKm` nearest sort** — confirm behavior when `filters.city` is absent (no center → does it silently fall back to relevance?). Document or guard.
- **Hydration safety** — the SLA/quote countdowns were fixed with `useSsrSafeNow`; audit any *new* time-derived render for the same class of mismatch.
- **Orphaned code (currency-clean, still unmounted)** — `src/components/worker/earnings-dashboard.tsx` (`EarningsDashboard`) and `src/components/referrals/referral-widget.tsx` are exported but mounted nowhere (verified: no reference to either symbol outside its own module). Their LBP mock data is gone — both now format through the shared `formatPrice`, so they can no longer display a foreign currency — but they are still dead weight, and they only stay honest while nothing mounts them. Wiring them to real adapter data or deleting them is a product decision left open on purpose.
- ✅ **Duplicate sources of truth removed** — `CITY_NAMES` and the second `CITY_COORDINATES` map are gone (both now derive from `CITIES`), and the two `CurrencyCode`s are one. `tests/tenant-countries.test.ts` asserts catalog ↔ registry ↔ geo-center agreement so a new city can't half-land.

### 3.4 P2 — test & tooling hardening

- ✅ **Docs rot fixed at the source (the checker was wrong, not the docs)** — `npm run check:docs-links` reported 18 broken links, but the anchors were correct for GitHub: `## 2. Authentication & Authorization Testing` slugs to `2-authentication--authorization-testing` (punctuation is deleted, leaving two spaces → **two** hyphens), while `headingSlug` collapsed whitespace runs and so required a single hyphen. Every `&` / " — " heading in `docs/` was a false failure. The slugger now maps each space to its own hyphen, and quoted sample markup is skipped — fenced code blocks **and** inline code spans — so the digest tracking-pixel example `<img src="/api/ads/{id}/impression">` (the real route is `/api/ads/[id]/impression`) is never resolved as a route. The inline span is the subtle half: the paragraph you are reading *explains* that exclusion by quoting the placeholder, and the checker used to scan the quote, so documenting the fix re-broke CI. Result: **all 253 links resolve**, pinned by `tests/docs-links.test.ts` (inline spans, fences, GitHub slugs, and the `/api/ads` regression itself), so `npm run test:all`'s gate is green.
- ✅ **Currency-contract test shipped** (`tests/currency-contract.test.ts`): asserts `@/lib/utils` re-exports the *same* `formatPrice` function object as `@/lib/currency` (one implementation), pins the `$`/whole-unit/Latin-digit output, and fails on any `SAR`/`AED`/`EGP`/`LBP`/`JOD`/`QAR`/`KWD`/`BHD`/`OMR`/`MAD` literal under `src/components` or `src/app`.
- ✅ **Hardcode guards shipped** — `tests/currency-contract.test.ts` fails on any `SAR`/`AED`/`EGP`/`LBP`/`JOD`/… literal under `src/components` + `src/app`; `tests/tenant-countries.test.ts` fails on any `ar-LB`/`ar-EG` Intl tag outside the registry, any `+961` in the UI or route handlers, and any `addressCountry: "LB"`.
- ✅ **Arabic-date pins shipped** (`tests/arabic-dates.test.ts`) — the rendered Levantine month names are asserted for all twelve months across every shared formatter (and the Egyptian names are asserted *absent*), the numeric formats (audit `dateStyle: medium`, slot ranges, the Arabic-Indic digit convention) are pinned, and no date formatter may hardcode a locale tag (`ar-SA`, `en-GB`, …) — the class the `ar-LB`/`ar-EG` guard could not see. Four allowlisted English-only surfaces are listed with reasons, and a staleness check deletes them if they ever stop needing it.
- ✅ **Numeral-convention pins shipped** (`tests/number-digits.test.ts`) — `NUMBER_LOCALE` in the country registry states the rule (dates/times follow `intlLocale`; money, counts, percentages, durations and countdowns are ASCII in both languages), every shared formatter's rendered output is asserted, and a source guard fails the build when a component formats a number itself (a bare runtime-locale `toLocaleString()`, a locale-derived tag on a number formatter, or a duration placeholder expanded by hand instead of via `fillDuration`).
- ✅ **Foreign-currency absence is enforced at the source, not per-route** — the planned E2E matrix extension is superseded by `tests/currency-contract.test.ts`: it fails on any `SAR`/`AED`/`EGP`/`LBP`/`JOD`/… literal (and the Arabic short forms `ر.س` / `د.إ`) anywhere under `src/components` or `src/app`, which is strictly stronger than asserting three routes render none — a route cannot display a literal that cannot be written — and it costs no build or browser time.
- ✅ **Self-heal is the default** (see §3.2) — no CI env flag needed; `E2E_AUTOCLEAN=0` is the strict opt-out.
- ✅ **Two "broken feature" smoke failures were lost clicks, not broken features** — the interactive flow clicked a button that exists in SSR HTML and then waited upstream for an effect that never came. Three findings, all harness-side:
  - **A pre-hydration click is a silent no-op**, and the 400ms `HYDRATION_SETTLE_MS` guess is not a hydration guarantee on a heavy dev route (the worker dashboard, after a language switch forced a full reload). The failure therefore surfaced as `timeout waiting for: resubmit success toast` — a lost click wearing a feature bug's clothes. Clicks that commit an action now go through `clickUntil`, which clicks, watches for the **effect**, and re-clicks only while nothing has happened yet; it cannot mask a real failure, because a control whose effect never arrives still exhausts the budget and throws the same message (`(after N click attempt(s))`).
  - **The plan-change assertions lacked the fallback every sibling had.** `waitFor(..., reloadOnTimeout)` is this file's standing dev-mode accommodation: a server action provably mutates the store (the SSR document renders the new state) while a dev Turbopack `router.refresh()` flight can lag and never reconcile on the client. Both demote and revert waits were missing `refreshFallback`, so the correct state was on the server and the assertion was reading the stale client. Added there — and deliberately **not** to the "row shows Enterprise" wait, which asserts *pre-existing* state and would be masked by a reload.
  - **A collected `pageerror` was undiagnosable by construction.** The collector pushed only `err.message`, so the admin failure read `[pageerror] frame.join is not a function` — no file, no line. It now carries the first four stack frames. That string appears nowhere in `src/`, `public/`, or the dependency tree (searched), so the stack is what a future run will need to place it.
- ⚠️ **Still open, and environment-bound rather than logical:** the nightly `e2e-smoke` matrix is unstable on a loaded workstation — the dominant failure is now `ConnectionClosedError: Connection closed` mid-suite (the Chrome process dying, taking every later test with it), plus that one unattributed `frame.join` page error. It does not gate a push (CI's push/PR jobs exclude this file; it runs in the nightly live-DB job), and the logical step failures above are fixed.

### 3.5 P1 — the dev preview wedged ✅ shipped

A `next dev` preview could freeze permanently — server HTML rendered, then the main thread blocked for good (skeletons forever, no click or in-page script answered). Two causes were suspected: React's dev build needing `eval()` under the app's CSP, and a render loop. **It was the render loop**, and the CSP finding was a red herring:

| Cause | Evidence | Verdict |
|---|---|---|
| `ThemeTransition`'s `MutationObserver` reacted to *any* `<html>` class mutation — **including its own** `theme-transitioning` add/remove | Reverting the guard and probing a real browser: startup stayed responsive, but the first theme click **wedged the main thread** (in-page `evaluate` never returned; rAF stopped). Also hangs the vitest file outright, since the loop starves even timers. | **This was the wedge.** It needed no user input in dev, because React assigns `<html className>` during hydration and re-assigning an attribute queues a `MutationRecord` even when the value is unchanged. |
| The CSP's `script-src` had no `'unsafe-eval'`, so React logged `eval() is not supported in this environment …` | With the loop fixed but the CSP untouched, the dev page hydrated, stayed responsive (243 rAF frames / 4s) and its theme toggle worked — only React's dev-only diagnostics were lost. | Real, but **not** the wedge. |

**✅ Fixed.**

- `ThemeTransition` now reacts to a **scheme change** (`dark` present/absent) rather than to "a class mutation happened", so its own add/remove reads back as unchanged and the observer terminates. `tests/theme-transition.test.tsx` pins it, including the same-value rewrite that only happens in dev.
- The CSP is **single-sourced** in `src/lib/security/csp.ts` — previously `src/proxy.ts` and `next.config.ts` each carried their own copy of the directive list and could silently drift. `'unsafe-eval'` is granted for `next dev` **only** (React's dev diagnostics); a production build keeps the hardened policy, asserted in `tests/csp.test.ts` (which also fails if the default ever leaks the allowance outside dev).
- `.freebuff/run.md` now leads with the dev recipe (isolated `NEXT_DIST_DIR`, port 3001) and records the diagnosis above; the production `next build` + `next start` recipe stays for when the preview must match what ships. Also verified: the isolated `next dev` output is safe to leave running, and `npm run smoke:preview` (which boots a production build) still passes 5/5 routes.

### 3.6 P1 — the preview smoke now fails on tap-blocking overlays ✅ shipped

`npm run smoke:preview` proved the app *hydrates*; it could not tell that a control a user can see is not tappable. The mobile bottom bar covering the `/auth/login` demo buttons was found by hand — the extension automates that class. Every route is re-opened at phone width and audited: no visible interactive control may be unreachable behind fixed/sticky chrome.

**Reachability is solved, not sampled.** A first attempt sampled five scroll offsets, and the results were garbage — both ways. Sampling *libels healthy pages* (a control visible at only one sampled offset, covered there, looked "unreachable"), and it *misses* the real thing. The audit instead parks each control at every legal resting position (the centre of the viewport, clamped to the scrollable range — where a user can always scroll content to) and hit-tests its centre. Two calibration traps worth recording:

- **`scroll-behavior: smooth` silently voided the whole first sweep.** `scrollTop = n` animates, so a synchronous reader sees offset 0 every time; every sampled position reported identical coordinates and "no scroll happened". Real input (`mouse.wheel`, CDP gestures) moved the page fine, which is how the bug was isolated. All moves now use `{ behavior: "instant" }`.
- **The `<html>` class of false positive is the fixed bottom bar itself.** At rest, content in the bar's band *is* covered — in every mobile app with a tab bar, and it is lawful because scrolling reveals it. So coverage-at-rest is reported as a **non-fatal notice**, grouped by overlay, and only "no legal position clears it" fails the run.

**What it found on the live app** (17 routes × 3 phone viewports, zero false positives): the fixed `inset-x-0 bottom-36` **retargeting panel** and the PWA **install banner** cover controls — both are escapable (they carry a Dismiss control) and one of them mounts on a 2s timer, so both are classified as notices rather than failures, deliberately keeping the gate deterministic. An overlay with no way out is a **failure**: proven by injecting a bare `fixed inset-0` panel into the root layout — the run exits 1 naming the overlay and the first four trapped controls (`31 more control(s) trapped by fixed div#smoke-injected-overlay`) — and by the same overlay carrying a `Dismiss` button, which drops back to a passing run. Exclusion rules (the chrome's own children, controls inside a user-scrollable rail) are pinned too, and `tests/preview-overlay-audit.test.ts` (six real-browser fixtures: trapped / dismissible / dialog / onboarding-skip / bottom bar / rail) fails 4/6 when the hit-test is neutered, so the judgement cannot silently rot.

**Two follow-on fixes the audit run exposed.** The audit is CLI-controlled like the rest of the runner (`--phone WxH`, `--no-overlay`) and its notices are grouped by overlay rather than listed per control, because a full-screen regression traps every control on the page (`79 trapped` → four named lines + `75 more`). And the isolated `NEXT_DIST_DIR` makes Next append that dir's type paths to `tsconfig.json`'s **tracked** `include` array — every smoke run was leaving a machine-specific diff behind, which `--no-build` then carried forward. The runner now strips its own generated entries on the way out (success **or** failed build), scoped to its own dist dir so a concurrent run's entries survive; three no-browser cases in the same test file pin exactly that, and loosening the match to any `.data/.next-*` entry fails the ownership case.

---

## 4. UX enhancement plan

Ordered by leverage; each builds on a rail that already exists.

### 4.1 Trust & clarity

- 💡 **Country/currency indicator in the header & footer** — once `CountryConfig` exists, show "Lebanon · USD" so pricing is never ambiguous. Cheap, and it makes the multi-country layer visible.
- 💡 **Guest phone OTP** (tracked in [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) §2.2) — the highest-trust gap for guest deposits.
- 💡 **Price benchmarks per category/city** ([ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) §2.1) — kills quote-shock at the response phase.

### 4.2 Feedback & resilience

- 💡 **Empty states that teach** — `/search` with no matches should suggest nearby areas, adjacent categories, and a "request quotes instead" CTA, not just "no results".
- 💡 **Global error boundary + offline state** — the app is Capacitor-shipped; a network drop should show a recoverable retry, not a crashed shell.
- 💡 **Explicit loading skeletons on the admin surfaces** — the admin dashboards are data-heavy; a shared skeleton (like `WorkerCardSkeleton`) prevents layout jump.

### 4.3 Localization quality

- ✅ **Locale-aware dates shipped (dates)** — every date/time formatter reads `intlLocale(locale)`; the `ar-SA` sites that showed Egyptian month names (reschedule dialog, recurring cards, the admin booking page, campaign charts) now share `formatDayDate`/`formatMonthDay`, and `tests/arabic-dates.test.ts` pins the rendered Arabic months + the digit convention. Remaining: the four English-only surfaces in that test's allowlist (blog content, the admin date-range picker, the dispute thread) and `timeAgo`'s hand-written Arabic strings.
- ✅ **The digit convention is decided and enforced (all numbers)** — one rule, stated in `NUMBER_LOCALE` (`src/lib/tenant/countries.ts`): calendar/clock output follows the country's `intlLocale` tag (Arabic-Indic in Arabic, pinned by `tests/arabic-dates.test.ts`); **every other number** — money, counts, percentages, durations and the SLA countdown — is ASCII in both languages (`tests/number-digits.test.ts`). Durations now share one split + filler (`durationParts`/`fillDuration` in `@/lib/utils`), which replaced the four hand-rolled `copy.replace("{hours}", String(hours))` countdown sites, and the leaks that let the same surface mix digit systems are gone — three shapes, all found by the new guard: the admin trails document's booking count (`Intl.NumberFormat(intlLocale(locale))` → a country tag, so Arabic really printed `٢ حجز` beside the document's ASCII money and row indices); ~40 counter/money labels including the animated counter, the referral reward and the trailing-document count using a bare `.toLocaleString()` (the *runtime* locale — Arabic-Indic for a reader whose browser locale is `ar-LB`, Latin on the en-US server, i.e. a real server/client hydration-mismatch risk); and the booking-row deposit (`(deposit / 100).toLocaleString(locale)` — agreed only by accident, since CLDR resolves a bare `ar` to the **latn** numbering system while `ar-LB`/`ar-EG`/`ar-SA` resolve to **arab**).
- ✅ **Every user-facing date/time is locale-aware (the other half of the gap)** — the ~40 bare `new Date(x).toLocaleString()` / `toLocaleDateString()` / `toLocaleTimeString()` sites (system logs, backup/webhook/cache tables, maintenance windows, security sessions, scheduled tasks, fraud alerts, audit trails, discount codes, support/forum/referral timestamps) took the **RUNTIME** locale: an English `M/D/YYYY, 10:30:00 AM` on the Arabic page, next to a Levantine date in the same row, and differing between the server render and the client whenever the two ran on different machines. All of them now go through `formatDate` / `formatDateTime` / `formatTime` in `@/lib/utils`, whose locale parameter is **required** — so "which locale?" is a compile-time question. Two Arabic-copy leaks were fixed with them (`repo.ts` / `purchases.ts` notification bodies: the Arabic body spelled the Egyptian month). A new guard in `tests/arabic-dates.test.ts` fails the build on any bare formatter call and keeps a **five-entry allowlist** of genuinely English-only artifacts (the hidden `/debug/analytics` page, the axe/WCAG report HTML, the English digest email, the CSV export), with a staleness check so an entry cannot outlive its reason. Still open, and now stated precisely: the hand-rolled "Just now / 5m ago" relative-time helpers in the admin feed/audit-trail/anomaly components are English strings on every locale.
- 💡 **RTL audit pass** — verify directional icons, progress bars, and the audit-print RTL document under a real Arabic session (axe + a visual pass).

### 4.4 Multi-country launch kit (for the *next* country)

- ✅ **Country onboarding recipe** — shipped as the §2.3 runbook + `SEED_COUNTRY`: one registry entry (cities + `demoWorkforce`) and one seed command turn expansion into a config change.
- 💡 **Per-country landing/SEO** — generate `hreflang` and country-scoped sitemaps from the registry now that `addressCountry` and the city catalog are derived.
- 💡 **Per-country demo identities** — the platform demo accounts (users/company/ads) still carry the served tenant's `.lb` emails; derive them from `DEFAULT_COUNTRY` when a second country gets its own deployment.

---

## 5. Sequencing

| Phase | Scope | Why first |
|---|---|---|
| **0 · Stabilize** ✅ | §3.2 E2E self-heal shipped; still open: delete/repair the orphaned components | Unblocks CI so every later change is verifiable. |
| **1 · Currency truth** ✅ | §3.1 — one currency module, one `formatPrice`, purge foreign-currency mocks, reconcile docs | Removes live user-visible bugs *and* lays the multi-country type seam. **Shipped.** |
| **2 · Country config** ✅ | §2.3 — `CountryConfig` registry; SEO/phone/locale/geo/city-page/providers **and the city + demo-worker datasets** read from / are generated by it | Makes Lebanon a configuration, data included; every §2.2 hardcode is gone. **Shipped.** |
| **3 · Tenant topology** | Decide & implement §2.3's deployment model; tenant resolution | Needed before country #2 ships real data. |
| **4 · Second country** | Add one country end-to-end with the §4.4 kit | Proves the seam; surfaces what the abstraction missed. |
| **5 · UX polish** | §4.1–4.3 | Compounds on a stable, multi-country base. |

---

## 6. Working-tree note

The crashed-run residue is gone: the E2E pre-run self-heal (§3.2) removes the leftover `.data/.next-e2e-*` dist dirs, and the smoke runner strips its own isolated dist dir's type paths from the tracked `tsconfig.json` `include` array on the way out (§3.6) — so neither a hard-killed run nor an ordinary smoke run leaves a machine-specific diff behind.

This batch ships the plan's own files, plus the one pre-existing uncommitted change that was sitting in the tree and is now included with the repo owner's go-ahead: `src/components/search/search-client.tsx` — a canonical-URL ref that stops the `/search` URL-sync effect from calling `router.replace` during mount. That replace is redundant (the server already rendered the canonical URL) and races the RSC payload reconcile, which can trip `Maximum update depth exceeded` when a filter is toggled before hydration finishes.

`test-results/.last-run.json` is vitest's own tracked artifact and now records the green unit run. The scratch probes under `tmp/` (CDP captures, overlay/scroll calibration, CSP and form-action experiments, per-run e2e logs) stay gitignored, so none of the diagnostic scaffolding can reach a commit.
