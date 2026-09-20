# Search architecture

WorkersArena search is **dual-adapter** — one filter/scoring contract, two engines that must never disagree:

| Surface | Demo mode (default) | Real mode (`DEMO_MODE=false` + `DATABASE_URL`) |
|---|---|---|
| Filter + ranking engine | `src/lib/data/search.ts` (in-memory over the seeded dataset) | `prismaSearchWorkers` (`src/lib/data/prisma-repo.ts`) |
| Free-text matching | JS: Arabic `normalize()` + prefix/category/token scoring + subsequence fuzzy + substring fallback | SQL: ILIKE substring ∪ **pg_trgm fuzzy candidates**, then the SAME JS scorer for ranking |
| Geo | haversine in JS (`distanceKm`) | same (capped candidate set, documented W1 trade-off) |

## Arabic fuzzy/trigram matching (Postgres)

Migration `20260920210000_search_trigram` ships:

- **`pg_trgm`** (trusted extension — no superuser needed).
- **`wa_norm(text)`** — the SQL twin of the demo engine's `normalize()`: strips Arabic tashkeel, folds hamza forms to alef, ta-marbuta → ha, alef-maksura → ya, lowercases, strips punctuation. `IMMUTABLE`, so it backs expression indexes.
- **Expression GIN trigram indexes** on `wa_norm(...)` of every searchable column: `Worker` names/taglines/bios, `Category`/`City`/`Area` display names, `ServiceItem` names.

The real-mode query flow for a free-text search:

1. Structural filters build a Prisma-typed `where` (`filtersToWhere(filters, { includeQuery: false })`).
2. Candidate ids are discovered in SQL: ILIKE substring on raw columns **∪** `prismaTrigramCandidateIds(query)` — tokens normalized in JS with the same `normalize()`, matched against `wa_norm()` expressions via ILIKE + `word_similarity() > 0.55` (typo/hamza-tolerant).
3. The merged id set goes back into `where.id.in`, the page is fetched, and ranking uses **`scoreWorkerQuery`** — exported from the demo engine, so demo and production order identically.

Graceful degradation: if the extension is missing (a database not yet migrated), the trigram pass warns and returns no candidates — search keeps working via the ILIKE half instead of erroring.

Verify against a configured database with `npm run check:trigram` (wa_norm output + a typo'd/Arabic candidate query).

## Geo/radius relevance

`SearchFilters` gained `nearLat`/`nearLng`/`radiusKm`:

- The centre is the explicit coordinate pair, else the selected city's centre (`radiusCenter`). A radius with no resolvable centre is a no-op.
- Workers beyond the radius are **filtered**; matching workers get a **distance-aware relevance boost** (`distanceBoostKm`: +12 at the centre fading linearly to 0 at the edge), folded in *after* query scoring so it refines order without rescuing non-matching workers.
- URL params: `radius` (km), `lat`/`lng`. The search page's "Within" select (5/10/25/50 km) anchors to the device position when the user granted geolocation ("Find Near Me"), otherwise the city centre.
- Production note: the radius runs in JS over a capped candidate set (`POST_FILTER_FETCH`), the same documented trade-off as open-now/nearest. At Beirut scale this is exact; revisit with PostGIS only if the dataset outgrows the cap.

## Per-category conversion metrics

`src/lib/data/category-conversion.ts` (pure) + `getCategoryConversionMetrics` (repo, dual-adapter):

- Funnel per trade over a 30-day cohort (and all-time): **leads offered → purchased → job won**, where a job is won when a lead rebate attributes a completion or the worker's own rating flags `converted` (deduped per lead).
- Rows: leads, offers, purchased, buy rate, jobs won, lead→job rate, credits charged.
- Rendered on `/admin/analytics/lead-quality` ("Category Conversion") — the Phase-2/§2.1 measurement view; rows with zero purchases are a pricing/quality signal, not noise.
