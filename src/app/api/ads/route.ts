import { NextRequest, NextResponse } from "next/server";
import { getActiveAdsFor, recordImpression } from "@/lib/data/repo";
import { checkRateLimitSync } from "@/lib/rate-limit";

export const revalidate = 0;

/**
 * GET /api/ads?placement=homepage&category=plumbing&city=riyadh
 * Serves the next ad in rotation for a placement and records an impression.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const placement = p.get("placement") ?? "homepage";
  const category = p.get("category") ?? undefined;
  const city = p.get("city") ?? undefined;

  const ads = await getActiveAdsFor(placement, { category, city });
  if (ads.length === 0) {
    return NextResponse.json({ ad: null });
  }

  // Filter out ads that hit their maxImpressions cap (M11).
  const eligible = ads.filter((a) => {
    const max = (a as unknown as { maxImpressions?: number | null }).maxImpressions;
    return max == null || a.impressions < max;
  });
  if (eligible.length === 0) return NextResponse.json({ ad: null });
  // Rotation: simple round-robin (M11 fix: was off-by-one `(tick-1)%len`).
  const tick = Math.floor(Date.now() / 30000); // rotate every 30s
  const ad = eligible[tick % eligible.length]!;

  // Throttle impression counting per IP+ad (60s per ad) to stop bot inflation (M11).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const impressionKey = `ad:imp:${ip}:${ad.id}`;
  if (checkRateLimitSync(impressionKey, 1, 60_000)) {
    await recordImpression(ad.id);
  }

  return NextResponse.json({
    ad: {
      id: ad.id,
      nameEn: ad.nameEn,
      nameAr: ad.nameAr,
      placement: ad.placement,
      adType: ad.adType,
      ctr: ad.ctr,
      clicks: ad.clicks,
      impressions: ad.impressions,
    },
  });
}
