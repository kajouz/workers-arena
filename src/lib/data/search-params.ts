import type { SearchFilters } from "./types";

type RawParams = Record<string, string | string[] | undefined>;

function one(params: RawParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/** Parse /search URL params into typed filters. */
export function searchParamsToFilters(params: RawParams): SearchFilters {
  const num = (v: string | undefined): number | undefined => {
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const bool = (v: string | undefined): boolean | undefined => {
    if (!v) return undefined;
    return v === "1" || v === "true";
  };

  const sort = one(params, "sort");
  const validSorts = ["relevance", "rating", "reviews", "priceLow", "priceHigh", "experience", "nearest"];

  return {
    query: one(params, "q") ?? undefined,
    category: one(params, "category") ?? undefined,
    city: one(params, "city") ?? undefined,
    area: one(params, "area") ?? undefined,
    minRating: num(one(params, "rating")),
    priceMin: num(one(params, "min")),
    priceMax: num(one(params, "max")),
    minExp: num(one(params, "exp")),
    verifiedOnly: bool(one(params, "verified")),
    featuredOnly: bool(one(params, "featured")),
    emergencyOnly: bool(one(params, "emergency")),
    openNowOnly: bool(one(params, "open")),
    availableNow: bool(one(params, "available")),
    feeWaivedOnly: bool(one(params, "feeWaived")),
    sort: validSorts.includes(sort ?? "") ? (sort as SearchFilters["sort"]) : undefined,
    page: num(one(params, "page")),
  };
}

/** Build a URL search string from filters (used for shareable search links). */
export function filtersToSearchParams(filters: SearchFilters): string {
  const p = new URLSearchParams();
  if (filters.query) p.set("q", filters.query);
  if (filters.category) p.set("category", filters.category);
  if (filters.city) p.set("city", filters.city);
  if (filters.area) p.set("area", filters.area);
  if (filters.minRating != null) p.set("rating", String(filters.minRating));
  if (filters.priceMin != null) p.set("min", String(filters.priceMin));
  if (filters.priceMax != null) p.set("max", String(filters.priceMax));
  if (filters.minExp != null) p.set("exp", String(filters.minExp));
  if (filters.verifiedOnly) p.set("verified", "1");
  if (filters.featuredOnly) p.set("featured", "1");
  if (filters.emergencyOnly) p.set("emergency", "1");
  if (filters.openNowOnly) p.set("open", "1");
  if (filters.availableNow) p.set("available", "1");
  if (filters.feeWaivedOnly) p.set("feeWaived", "1");
  if (filters.sort && filters.sort !== "relevance") p.set("sort", filters.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}
