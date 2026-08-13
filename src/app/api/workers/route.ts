import { NextRequest, NextResponse } from "next/server";
import { getWorkers } from "@/lib/data/repo";
import type { SearchFilters } from "@/lib/data/types";

export const revalidate = 60;

/**
 * GET /api/workers
 * Query params: q, category, city, area, rating, min, max, exp,
 *               verified, featured, emergency, open, available, feeWaived, sort, page
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const num = (k: string): number | undefined => {
    const v = p.get(k);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  const bool = (k: string): boolean | undefined => {
    const v = p.get(k);
    return v === "1" || v === "true" ? true : undefined;
  };

  const filters: SearchFilters = {
    query: p.get("q") ?? undefined,
    category: p.get("category") ?? undefined,
    city: p.get("city") ?? undefined,
    area: p.get("area") ?? undefined,
    minRating: num("rating"),
    priceMin: num("min"),
    priceMax: num("max"),
    minExp: num("exp"),
    verifiedOnly: bool("verified"),
    featuredOnly: bool("featured"),
    emergencyOnly: bool("emergency"),
    openNowOnly: bool("open"),
    availableNow: bool("available"),
    feeWaivedOnly: bool("feeWaived"),
    sort: (p.get("sort") as SearchFilters["sort"]) ?? "relevance",
    page: num("page"),
  };

  const result = await getWorkers(filters);
  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
