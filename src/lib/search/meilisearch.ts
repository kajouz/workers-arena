/**
 * Meilisearch integration for advanced search.
 *
 * Provides typo-tolerant full-text search across workers, categories, and cities
 * with faceted filtering. Falls back to in-memory search when Meilisearch is
 * unavailable (development/demo mode).
 *
 * To enable:
 * 1. Set MEILISEARCH_HOST (default: http://localhost:7700)
 * 2. Set MEILISEARCH_API_KEY (optional, for production)
 * 3. Run: npm run search:sync
 */

import { WORKERS } from "@/lib/data/workers";
import type { Worker } from "@/lib/data/types";

/* ─── Config ─── */
const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST || "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY || "";

/* ─── Types ─── */
export interface SearchHit {
  id: string;
  name: string;
  nameAr: string;
  categorySlug: string;
  categoryEn: string;
  categoryAr: string;
  citySlug: string;
  cityEn: string;
  cityAr: string;
  rating: number;
  reviewCount: number;
  hourlyRate: number;
  currency: string;
  hue: number;
  slug: string;
  plan: string;
  verified: boolean;
  responseRate: number;
  yearsExperience: number;
}

export interface SearchFilters {
  category?: string;
  city?: string;
  minRating?: number;
  plan?: string;
  verified?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

export interface SearchResult {
  hits: SearchHit[];
  total: number;
  query: string;
  processingTimeMs: number;
  facets: {
    categories: Record<string, number>;
    cities: Record<string, number>;
    plans: Record<string, number>;
  };
}

/* ─── Client ─── */
let meiliAvailable = true;

async function meiliFetch(path: string, options?: RequestInit): Promise<Response | null> {
  if (!meiliAvailable) return null;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options?.headers as Record<string, string> || {}),
    };

    if (MEILISEARCH_API_KEY) {
      headers["Authorization"] = `Bearer ${MEILISEARCH_API_KEY}`;
    }

    const res = await fetch(`${MEILISEARCH_HOST}${path}`, {
      ...options,
      headers,
      signal: AbortSignal.timeout(3000),
    });

    return res;
  } catch {
    meiliAvailable = false;
    console.warn("[Meilisearch] Unavailable — falling back to in-memory search");
    return null;
  }
}

/* ─── Sync ─── */
export async function syncWorkersToMeilisearch(): Promise<{ indexed: number }> {
  const workers = WORKERS;
  const documents: SearchHit[] = workers.map((w: Worker) => ({
    id: w.id,
    name: w.nameEn,
    nameAr: w.nameAr,
    categorySlug: w.categorySlug,
    categoryEn: w.categorySlug,
    categoryAr: w.categorySlug,
    citySlug: w.citySlug,
    cityEn: w.citySlug,
    cityAr: w.citySlug,
    rating: w.rating,
    reviewCount: w.reviewCount,
    hourlyRate: w.priceMin,
    currency: w.currency,
    hue: 0,
    slug: w.slug,
    plan: w.subscription.plan,
    verified: w.verified,
    responseRate: w.responseRate ?? 0,
    yearsExperience: w.yearsExp,
  }));

  const res = await meiliFetch("/indexes/workers/documents", {
    method: "POST",
    body: JSON.stringify(documents),
  });

  if (res?.ok) {
    console.log(`[Meilisearch] Indexed ${documents.length} workers`);
    return { indexed: documents.length };
  }

  console.warn("[Meilisearch] Sync failed — using in-memory search");
  return { indexed: 0 };
}

/* ─── Search ─── */
export async function searchWorkers(
  query: string,
  filters: SearchFilters = {},
  options: { limit?: number; offset?: number } = {}
): Promise<SearchResult> {
  const { limit = 20, offset = 0 } = options;

  // Try Meilisearch first
  const res = await meiliFetch("/indexes/workers/search", {
    method: "POST",
    body: JSON.stringify({
      q: query,
      limit,
      offset,
      filter: buildFilter(filters),
      facets: ["categorySlug", "citySlug", "plan"],
      attributesToHighlight: ["name", "nameAr"],
      highlightPreTag: "<mark>",
      highlightPostTag: "</mark>",
    }),
  });

  if (res?.ok) {
    const data = await res.json();
    return {
      hits: data.hits || [],
      total: data.estimatedTotalHits || data.nbHits || 0,
      query,
      processingTimeMs: data.processingTimeMs || 0,
      facets: {
        categories: data.facetDistribution?.categorySlug || {},
        cities: data.facetDistribution?.citySlug || {},
        plans: data.facetDistribution?.plan || {},
      },
    };
  }

  // Fallback to in-memory search
  return inMemorySearch(query, filters, limit, offset);
}

function buildFilter(filters: SearchFilters): string[] {
  const f: string[] = [];
  if (filters.category) f.push(`categorySlug = "${filters.category}"`);
  if (filters.city) f.push(`citySlug = "${filters.city}"`);
  if (filters.minRating) f.push(`rating >= ${filters.minRating}`);
  if (filters.plan) f.push(`plan = "${filters.plan}"`);
  if (filters.verified !== undefined) f.push(`verified = ${filters.verified}`);
  if (filters.minPrice) f.push(`hourlyRate >= ${filters.minPrice}`);
  if (filters.maxPrice) f.push(`hourlyRate <= ${filters.maxPrice}`);
  return f;
}

/* ─── In-Memory Fallback ─── */
function inMemorySearch(
  query: string,
  filters: SearchFilters,
  limit: number,
  offset: number
): SearchResult {
  const workers = WORKERS;
  const q = query.toLowerCase();

  let hits = workers.filter((w: Worker) => {
    // Text match
    if (q) {
      const searchable = `${w.nameEn} ${w.nameAr} ${w.categorySlug} ${w.citySlug} ${w.slug}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    // Filters
    if (filters.category && w.categorySlug !== filters.category) return false;
    if (filters.city && w.citySlug !== filters.city) return false;
    if (filters.minRating && w.rating < filters.minRating) return false;
    if (filters.plan && w.subscription.plan !== filters.plan) return false;
    if (filters.verified !== undefined && w.verified !== filters.verified) return false;
    if (filters.minPrice && w.priceMin < filters.minPrice) return false;
    if (filters.maxPrice && w.priceMax > filters.maxPrice) return false;

    return true;
  });

  // Compute facets
  const categories: Record<string, number> = {};
  const cities: Record<string, number> = {};
  const plans: Record<string, number> = {};
  hits.forEach((w: Worker) => {
    categories[w.categorySlug] = (categories[w.categorySlug] || 0) + 1;
    cities[w.citySlug] = (cities[w.citySlug] || 0) + 1;
    plans[w.subscription.plan] = (plans[w.subscription.plan] || 0) + 1;
  });

  const total = hits.length;
  hits = hits.slice(offset, offset + limit);

  return {
    hits: hits.map((w: Worker) => ({
      id: w.id,
      name: w.nameEn,
      nameAr: w.nameAr,
      categorySlug: w.categorySlug,
      categoryEn: w.categorySlug,
      categoryAr: w.categorySlug,
      citySlug: w.citySlug,
      cityEn: w.citySlug,
      cityAr: w.citySlug,
      rating: w.rating,
      reviewCount: w.reviewCount,
      hourlyRate: w.priceMin,
      currency: w.currency,
      hue: 0,
      slug: w.slug,
      plan: w.subscription.plan,
      verified: w.verified,
      responseRate: w.responseRate ?? 0,
      yearsExperience: w.yearsExp,
    })),
    total,
    query,
    processingTimeMs: 0,
    facets: { categories, cities, plans },
  };
}

/* ─── Autocomplete ─── */
export async function getSearchSuggestions(query: string): Promise<string[]> {
  const res = await meiliFetch("/indexes/workers/search", {
    method: "POST",
    body: JSON.stringify({
      q: query,
      limit: 5,
      attributesToRetrieve: ["name", "categoryEn", "cityEn"],
      attributesToHighlight: [],
    }),
  });

  if (res?.ok) {
    const data = await res.json();
    return data.hits?.map((h: SearchHit) => h.name) || [];
  }

  // Fallback
  const workers = WORKERS;
  const q = query.toLowerCase();
  return workers
    .filter((w: Worker) => w.nameEn.toLowerCase().includes(q) || w.categorySlug.toLowerCase().includes(q))
    .slice(0, 5)
    .map((w: Worker) => w.nameEn);
}

/* ─── Health Check ─── */
export async function checkMeilisearchHealth(): Promise<{
  available: boolean;
  version?: string;
  indexCount?: number;
}> {
  const res = await meiliFetch("/health");
  if (res?.ok) {
    const data = await res.json();
    const indexesRes = await meiliFetch("/indexes");
    const indexes = indexesRes?.ok ? await indexesRes.json() : [];
    return {
      available: true,
      version: data.commitDate || "unknown",
      indexCount: Array.isArray(indexes) ? indexes.length : 0,
    };
  }
  return { available: false };
}
