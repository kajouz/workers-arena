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
const workersSrc = resolve(root, "src", "lib", "data", "workers.ts");
const searchSrc = resolve(root, "src", "lib", "data", "search.ts");
const categoriesSrc = resolve(root, "src", "lib", "data", "categories.ts");

// ── Parse featured worker slugs from workers.ts ──────────────────────────

function extractFeaturedSlugs(workersSource) {
  const slugs = [];
  // Match CONFIGS entries with featured: true
  // Each config block starts with { nameEn: "...", ... featured: true ... }
  const configBlocks = workersSource.split(/\{[^{}]*\}/g);

  // Simpler: scan for nameEn + featured pairs
  const lines = workersSource.split("\n");
  let currentNameEn = null;
  let currentCategory = null;
  let isFeatured = false;

  for (const line of lines) {
    const nameMatch = line.match(/nameEn:\s*"([^"]+)"/);
    if (nameMatch) {
      currentNameEn = nameMatch[1];
    }
    const catMatch = line.match(/category:\s*"([^"]+)"/);
    if (catMatch) {
      currentCategory = catMatch[1];
    }
    if (line.includes("featured: true")) {
      isFeatured = true;
    }
    // End of config block (closing brace with comma or just closing)
    if ((line.includes("},") || line.includes("};")) && currentNameEn && currentCategory) {
      if (isFeatured) {
        // Replicate slug generation: nameEn.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + category
        const slug = `${currentNameEn.toLowerCase().replace(/[^a-z]+/g, "-")}-${currentCategory}`;
        slugs.push(slug);
      }
      currentNameEn = null;
      currentCategory = null;
      isFeatured = false;
    }
  }

  return slugs;
}

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

function rewriteSwPrecache(swContent, workerSlugs, categorySlugs) {
  const shellUrls = [
    '  "/",',
    '  "/offline.html",',
    '  "/manifest.webmanifest",',
    '  "/icon.svg",',
    '  "/icons/icon-192.png",',
    '  "/icons/icon-512.png",',
    '  "/icons/maskable-512.png",',
    '  "/icons/apple-touch-icon.png",',
    '  "/categories",',
  ];

  const workerUrls = workerSlugs.map(
    (slug) => `  "/workers/${slug}",`
  );

  // Precache /search?category=… for every category so browsing by trade
  // works fully offline — the categories page links to these.
  const categorySearchUrls = categorySlugs.map(
    (slug) => `  "/search?category=${slug}",`
  );

  const allUrls = [...shellUrls, ...workerUrls, ...categorySearchUrls];

  const newBlock = `const PRECACHE_URLS = [\n${allUrls.join("\n")}\n];`;

  // Replace the existing PRECACHE_URLS block
  const pattern = /const PRECACHE_URLS = \[[\s\S]*?\];/;
  if (!pattern.test(swContent)) {
    throw new Error("Could not find PRECACHE_URLS block in sw.js");
  }

  return swContent.replace(pattern, newBlock);
}

// ── Main ─────────────────────────────────────────────────────────────────

const workersSource = readFileSync(workersSrc, "utf8");
const categoriesSource = readFileSync(categoriesSrc, "utf8");
const swContent = readFileSync(swPath, "utf8");

const featuredSlugs = extractFeaturedSlugs(workersSource);
const categorySlugs = extractCategorySlugs(categoriesSource);

console.log(`Found ${featuredSlugs.length} featured workers:`);
featuredSlugs.forEach((s) => console.log(`  /workers/${s}`));
console.log(`Found ${categorySlugs.length} categories:`);
categorySlugs.forEach((s) => console.log(`  /search?category=${s}`));

const updated = rewriteSwPrecache(swContent, featuredSlugs, categorySlugs);
writeFileSync(swPath, updated, "utf8");

console.log(`\n✅ Updated ${swPath} with ${featuredSlugs.length + categorySlugs.length} precache URLs`);
