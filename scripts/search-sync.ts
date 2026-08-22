#!/usr/bin/env tsx
/**
 * Sync worker data to Meilisearch.
 *
 * Usage:
 *   npx tsx scripts/search-sync.ts
 *
 * This script syncs all workers from the demo data to Meilisearch
 * for advanced full-text search with typo tolerance.
 *
 * Run this:
 * - After database migrations
 * - When worker data changes
 * - As a cron job (daily)
 */

import { syncWorkersToMeilisearch } from "../src/lib/search/meilisearch";

async function main() {
  console.log("🔄 Starting Meilisearch sync...");

  const result = await syncWorkersToMeilisearch();

  if (result.indexed > 0) {
    console.log(`✅ Synced ${result.indexed} workers to Meilisearch`);
  } else {
    console.log("⚠️  No workers synced (Meilisearch may be unavailable)");
    console.log("   The app will use in-memory search as fallback");
  }
}

main().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
