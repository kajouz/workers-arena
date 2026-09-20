-- ────────────────────────────────────────────────────────────────────────────
-- Arabic fuzzy/trigram search (docs/SEARCH.md — prisma adapter upgrade)
-- ────────────────────────────────────────────────────────────────────────────
-- The prisma search previously matched the raw query with ILIKE substring
-- only — no Arabic normalization (hamza/ta-marbuta variants) and no typo
-- tolerance. This migration ships the planned pg_trgm upgrade:
--
--   1. pg_trgm — trusted extension (no superuser needed on managed Postgres).
--   2. wa_norm(text) — the SQL twin of the demo engine's normalize()
--      (src/lib/data/search.ts): strips Arabic tashkeel, folds hamza forms
--      to alef, ta-marbuta to ha, alef-maksura to ya, lowercases, and strips
--      punctuation. IMMUTABLE so it can back expression indexes.
--   3. Expression GIN trigram indexes on every searchable text column, in the
--      same normalized form the adapter queries them — so word-similarity and
--      ILIKE-on-normalized predicates are index-backed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION wa_norm(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(
             lower(
               translate(
                 regexp_replace(coalesce(t, ''), '[ًٌٍَُِّْٰ]', '', 'g'),
                 'ءأؤإئةى', 'ااااااهي'
               )
             ),
             '[^a-z0-9\u0600-\u06FF[:space:]]', ' ', 'g'
           ),
           '\s+', ' ', 'g')
$$;

-- Worker text columns
CREATE INDEX IF NOT EXISTS worker_nameen_trgm_idx   ON "Worker" USING gin (wa_norm("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_namear_trgm_idx   ON "Worker" USING gin (wa_norm("nameAr") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_taglineen_trgm_idx ON "Worker" USING gin (wa_norm("taglineEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_taglinear_trgm_idx ON "Worker" USING gin (wa_norm("taglineAr") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_bioen_trgm_idx    ON "Worker" USING gin (wa_norm("bioEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS worker_bioar_trgm_idx    ON "Worker" USING gin (wa_norm("bioAr") gin_trgm_ops);

-- Category / city / area / service display names (the search surface spans
-- these joins, matching the demo engine's searchable text).
CREATE INDEX IF NOT EXISTS category_nameen_trgm_idx ON "Category" USING gin (wa_norm("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS category_namear_trgm_idx ON "Category" USING gin (wa_norm("nameAr") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS city_nameen_trgm_idx     ON "City" USING gin (wa_norm("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS city_namear_trgm_idx     ON "City" USING gin (wa_norm("nameAr") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS area_nameen_trgm_idx     ON "Area" USING gin (wa_norm("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS area_namear_trgm_idx     ON "Area" USING gin (wa_norm("nameAr") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS service_nameen_trgm_idx  ON "ServiceItem" USING gin (wa_norm("nameEn") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS service_namear_trgm_idx  ON "ServiceItem" USING gin (wa_norm("nameAr") gin_trgm_ops);
