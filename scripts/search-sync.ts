#!/usr/bin/env tsx
/**
 * Sync worker data to Meilisearch.
 *
 * Usage:
 *   npx tsx scripts/search-sync.ts
 *
 * This script:
 * 1. Fetches all workers from the database
 * 2. Transforms them for Meilisearch
 * 3. Pushes to the Meilisearch index
 * 4. Configures index settings (filterable, sortable, searchable attributes)
 *
 * Run this:
 * - After database migrations
 * - When worker data changes
 * - As a cron job (daily)
 */

import { getMeilisearchClient, type MeiliWorker } from "../src/lib/search/meilisearch";

// In production, import from your data layer:
// import { getWorkers } from "../src/lib/data/repo";

interface Worker {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  categoryNameEn?: string;
  categoryNameAr?: string;
  citySlug: string;
  rating: number;
  reviewCount: number;
  priceMin: number;
  priceMax: number;
  currency: string;
  verified: boolean;
  premium: boolean;
  featured: boolean;
  emergency: boolean;
  yearsExp: number;
  bioEn: string;
  bioAr: string;
  services: { nameEn: string; nameAr: string; price: number }[];
  lat?: number;
  lng?: number;
}

/**
 * Transform worker data for Meilisearch
 */
function transformWorker(worker: Worker): MeiliWorker {
  return {
    id: worker.id,
    slug: worker.slug,
    nameEn: worker.nameEn,
    nameAr: worker.nameAr,
    categorySlug: worker.categorySlug,
    categoryNameEn: worker.categoryNameEn ?? worker.categorySlug,
    categoryNameAr: worker.categoryNameAr ?? worker.categorySlug,
    citySlug: worker.citySlug,
    rating: worker.rating,
    reviewCount: worker.reviewCount,
    priceMin: worker.priceMin,
    priceMax: worker.priceMax,
    currency: worker.currency,
    verified: worker.verified,
    premium: worker.premium,
    featured: worker.featured,
    emergency: worker.emergency,
    yearsExp: worker.yearsExp,
    bioEn: worker.bioEn,
    bioAr: worker.bioAr,
    services: worker.services.map((s) => ({
      nameEn: s.nameEn,
      nameAr: s.nameAr,
      price: s.price,
    })),
  };
}

/**
 * Main sync function
 */
async function syncWorkers(): Promise<void> {
  console.log("🔄 Starting Meilisearch sync...");

  const client = getMeilisearchClient();

  // Check if Meilisearch is healthy
  const isHealthy = await client.health();
  if (!isHealthy) {
    console.error("❌ Meilisearch is not running. Start it with:");
    console.error("   docker run -d -p 7700:7700 getmeili/meilisearch:latest");
    process.exit(1);
  }

  console.log("✅ Meilisearch is healthy");

  // Configure index settings
  console.log("⚙️  Configuring index settings...");
  await client.configureIndex();
  console.log("✅ Index configured");

  // In production, fetch workers from database
  // For now, use mock data
  const workers: Worker[] = [
    // This would be: await getWorkers({})
    // For demo, we'll use an empty array
  ];

  if (workers.length === 0) {
    console.log("ℹ️  No workers to sync (demo mode)");
    console.log("   In production, workers would be fetched from the database");
    return;
  }

  // Transform workers
  const meiliWorkers = workers.map(transformWorker);
  console.log(`📦 Transformed ${meiliWorkers.length} workers`);

  // Push to Meilisearch
  console.log("📤 Uploading to Meilisearch...");
  const result = await client.addWorkers(meiliWorkers);
  console.log(`✅ Sync complete! Task UID: ${result.taskUid}`);
}

// Run the sync
syncWorkers().catch((error) => {
  console.error("❌ Sync failed:", error);
  process.exit(1);
});
