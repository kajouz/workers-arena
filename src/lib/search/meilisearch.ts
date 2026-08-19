/**
 * Meilisearch integration for advanced search.
 *
 * Setup:
 * 1. Install Meilisearch: docker run -d -p 7700:7700 getmeili/meilisearch:latest
 * 2. Set MEILISEARCH_HOST and MEILISEARCH_API_KEY in .env.local
 * 3. Run the sync script: npm run search:sync
 *
 * Features:
 * - Typo-tolerant search
 * - Faceted search (category, city, rating)
 * - Search as you type
 * - Relevance ranking
 * - Multi-language support (EN/AR)
 */

const MEILISEARCH_HOST = process.env.MEILISEARCH_HOST ?? "http://localhost:7700";
const MEILISEARCH_API_KEY = process.env.MEILISEARCH_API_KEY ?? "";

interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  filter?: string[];
  sort?: string[];
  facets?: string[];
  attributesToHighlight?: string[];
}

interface SearchResult<T> {
  hits: T[];
  query: string;
  processingTimeMs: number;
  hitsPerPage: number;
  nbHits: number;
  nbPages: number;
  page: number;
  facetDistribution?: Record<string, Record<string, number>>;
}

interface MeiliWorker {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  categoryNameEn: string;
  categoryNameAr: string;
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
}

/**
 * Meilisearch client (lightweight, no SDK dependency)
 */
class MeilisearchClient {
  private host: string;
  private apiKey: string;

  constructor(host: string, apiKey: string) {
    this.host = host;
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.host}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers as Record<string, string> },
    });

    if (!response.ok) {
      throw new Error(`Meilisearch error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Search workers
   */
  async searchWorkers(options: SearchOptions): Promise<SearchResult<MeiliWorker>> {
    return this.request<SearchResult<MeiliWorker>>("/indexes/workers/search", {
      method: "POST",
      body: JSON.stringify({
        q: options.query,
        limit: options.limit ?? 20,
        offset: options.offset ?? 0,
        filter: options.filter?.join(" AND "),
        sort: options.sort,
        facets: options.facets,
        attributesToHighlight: options.attributesToHighlight ?? ["nameEn", "nameAr", "bioEn", "bioAr"],
        attributesToCrop: ["bioEn", "bioAr"],
        cropLength: 200,
      }),
    });
  }

  /**
   * Add or update workers in the index
   */
  async addWorkers(workers: MeiliWorker[]): Promise<{ taskUid: number }> {
    return this.request("/indexes/workers/documents", {
      method: "PUT",
      body: JSON.stringify(workers),
    });
  }

  /**
   * Delete a worker from the index
   */
  async deleteWorker(id: string): Promise<{ taskUid: number }> {
    return this.request(`/indexes/workers/documents/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Configure the workers index
   */
  async configureIndex(): Promise<void> {
    // Set searchable attributes
    await this.request("/indexes/workers/settings", {
      method: "PATCH",
      body: JSON.stringify({
        searchableAttributes: [
          "nameEn",
          "nameAr",
          "categoryNameEn",
          "categoryNameAr",
          "citySlug",
          "bioEn",
          "bioAr",
          "services.nameEn",
          "services.nameAr",
        ],
        filterableAttributes: [
          "categorySlug",
          "citySlug",
          "rating",
          "priceMin",
          "priceMax",
          "verified",
          "premium",
          "featured",
          "emergency",
          "yearsExp",
        ],
        sortableAttributes: [
          "rating",
          "reviewCount",
          "priceMin",
          "priceMax",
          "yearsExp",
        ],
        rankingRules: [
          "sort",
          "words",
          "typo",
          "proximity",
          "attribute",
          "exactness",
        ],
        synonyms: {
          plumber: ["plumbing", "pipe", "leak"],
          electric: ["electrical", "electrician", "wiring"],
          ac: ["air conditioning", "hvac", "cooling"],
          clean: ["cleaning", "maid", "housekeeping"],
        },
        stopWords: ["the", "a", "an", "and", "or", "but", "in", "on", "at"],
        typoTolerance: {
          enabled: true,
          minWordSizeForTypos: {
            oneTypo: 3,
            twoTypos: 6,
          },
        },
      }),
    });
  }

  /**
   * Check if Meilisearch is healthy
   */
  async health(): Promise<boolean> {
    try {
      await this.request("/health");
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let clientInstance: MeilisearchClient | null = null;

export function getMeilisearchClient(): MeilisearchClient {
  if (!clientInstance) {
    clientInstance = new MeilisearchClient(MEILISEARCH_HOST, MEILISEARCH_API_KEY);
  }
  return clientInstance;
}

export type { MeiliWorker, SearchOptions, SearchResult };
export { MeilisearchClient };
