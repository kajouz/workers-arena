/**
 * Search Cache — in-memory LRU cache for search results.
 *
 * Avoids recomputing the full filter/sort pipeline on repeated queries.
 * Uses a simple Map with TTL eviction. No external dependencies —
 * suitable for single-instance deployments (Vercel, single-server).
 *
 * For multi-instance deployments, swap with Redis.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class SearchCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;
  private defaultTTL: number;

  constructor(maxEntries = 200, defaultTTLms = 60_000) {
    this.maxEntries = maxEntries;
    this.defaultTTL = defaultTTLms;
  }

  /** Get a cached result by key. Returns null if missing or expired. */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    // Move to end (most recently used) — re-insert.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value as T;
  }

  /** Store a result with optional TTL override. */
  set<T>(key: string, value: T, ttlMs?: number): void {
    // Evict oldest if at capacity.
    if (this.store.size >= this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTTL),
    });
  }

  /** Clear all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Current size. */
  get size(): number {
    return this.store.size;
  }
}

/** Singleton search cache. */
export const searchCache = new SearchCache(200, 60_000);

/**
 * Build a deterministic cache key from search filters.
 * Sorted keys ensure the same filters always produce the same key.
 */
export function buildSearchCacheKey(filters: Record<string, unknown>): string {
  const sorted = Object.keys(filters)
    .sort()
    .map((k) => `${k}=${JSON.stringify(filters[k])}`)
    .join("&");
  return `search:${sorted}`;
}
