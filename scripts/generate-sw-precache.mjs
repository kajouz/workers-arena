#!/usr/bin/env node
/**
 * generate-sw-precache.mjs
 *
 * Auto-generates the PRECACHE_URLS list in public/sw.js from:
 *   1. Featured workers (slugs from src/lib/data/workers.ts CONFIGS)
 *   2. Popular search categories (hrefs from src/lib/data/search.ts POPULAR_SEARCHES)
 *
 * Run manually: node scripts/generate-sw-precache.mjs
 * Or add to build: add "precache:sw" script and wire into prebuild.
 *
 * The script reads the source files, extracts the data, and rewrites the
 * PRECACHE_URLS block in public/sw.js so slugs/categories never go stale.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const swPath = resolve(root, "public", "sw.js");
const searchSrc = resolve(root, "src", "lib", "data", "search.ts");
const categoriesSrc = resolve(root, "src", "lib", "data", "categories.ts");

// ── Parse featured worker slugs from workers.ts ──────────────────────────

/**
 * Featured worker slugs, read from the real dataset.
 *
 * This used to regex-scrape `nameEn:` / `featured: true` pairs out of
 * workers.ts and rebuild the slug by hand. That silently returned ZERO once
 * the dataset moved to generated recipes — the script kept "succeeding" and
 * the committed precache list quietly went stale, so the service worker was
 * precaching profiles that no longer matched the data.
 *
 * Importing the module instead means the slug can never drift from the one the
 * router serves, and a failure is loud.
 */
async function extractFeaturedSlugs() {
  const { getFeaturedWorkers } = await import("../src/lib/data/search.ts");
  const slugs = getFeaturedWorkers(FEATURED_COUNT).map((w) => w.slug);
  if (slugs.length === 0) {
    throw new Error(
      "No featured workers found — the precache list would ship without any " +
        "profile pages. Check getFeaturedWorkers() in src/lib/data/search.ts."
    );
  }
  return slugs;
}

/** How many profiles to precache for offline access. */
const FEATURED_COUNT = 4;

// ── Parse popular search category hrefs from search.ts ───────────────────

function extractPopularSearchHrefs(searchSource) {
  const hrefs = [];
  const regex = /href:\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(searchSource)) !== null) {
    const href = match[1];
    // Only include /search?category=... links
    if (href.startsWith("/search?category=")) {
      hrefs.push(href);
    }
  }
  return hrefs;
}

// ── Parse all category slugs from categories.ts ─────────────────────────

function extractCategorySlugs(categoriesSource) {
  const slugs = [];
  const regex = /slug:\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(categoriesSource)) !== null) {
    slugs.push(match[1]);
  }
  return slugs;
}

// ── Rewrite the PRECACHE_URLS block in sw.js ────────────────────────────

/**
 * Locales the app serves. Page URLs live under /{locale}/… since the locale
 * moved into the path, so precaching a bare "/categories" would cache a 301
 * redirect instead of the page and break offline browsing. Assets under
 * /public keep their single unprefixed URL.
 *
 * Kept in step with src/lib/i18n/config.ts — the docs-links check and the
 * precache test both read the generated list, so a drift shows up there.
 */
const LOCALES = ["en", "ar"];

function rewriteSwPrecache(swContent, workerSlugs, categorySlugs) {
  // Files, not routes — served straight from /public, never locale-prefixed.
  const assetUrls = [
    '  "/offline.html",',
    '  "/manifest.webmanifest",',
    '  "/icon.svg",',
    '  "/icons/icon-192.png",',
    '  "/icons/icon-512.png",',
    '  "/icons/maskable-512.png",',
    '  "/icons/apple-touch-icon.png",',
  ];

  // Page routes, one copy per language: an Arabic reader who goes offline
  // should get the Arabic shell, not a redirect or the English page.
  const pageUrls = [];
  for (const locale of LOCALES) {
    pageUrls.push(`  "/${locale}",`);
    pageUrls.push(`  "/${locale}/categories",`);
    for (const slug of workerSlugs) pageUrls.push(`  "/${locale}/workers/${slug}",`);
    // Browsing by trade offline — the categories page links to these.
    for (const slug of categorySlugs) pageUrls.push(`  "/${locale}/search?category=${slug}",`);
  }

  // "/" itself redirects to a locale, but it is what a home-screen launch and
  // a bare bookmark request, so the redirect is worth having in the cache.
  const allUrls = ['  "/",', ...assetUrls, ...pageUrls];

  const newBlock = `const PRECACHE_URLS = [\n${allUrls.join("\n")}\n];`;

  // Replace the existing PRECACHE_URLS block
  const pattern = /const PRECACHE_URLS = \[[\s\S]*?\];/;
  if (!pattern.test(swContent)) {
    throw new Error("Could not find PRECACHE_URLS block in sw.js");
  }

  return swContent.replace(pattern, newBlock);
}

// ── Main ─────────────────────────────────────────────────────────────────

const categoriesSource = readFileSync(categoriesSrc, "utf8");
const swContent = readFileSync(swPath, "utf8");

const featuredSlugs = await extractFeaturedSlugs();
const categorySlugs = extractCategorySlugs(categoriesSource);

console.log(`Found ${featuredSlugs.length} featured workers:`);
featuredSlugs.forEach((s) => console.log(`  /workers/${s}`));
console.log(`Found ${categorySlugs.length} categories:`);
categorySlugs.forEach((s) => console.log(`  /search?category=${s}`));

const updated = rewriteSwPrecache(swContent, featuredSlugs, categorySlugs);
writeFileSync(swPath, updated, "utf8");

console.log(`\n✅ Updated ${swPath} with ${featuredSlugs.length + categorySlugs.length} precache URLs`);
