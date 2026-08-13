import { NextRequest, NextResponse } from "next/server";
import { getActiveAdsFor, recordImpression } from "@/lib/data/repo";

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

  // Rotation: round-robin by current impressions + time bucket for variety.
  const tick = Math.floor(Date.now() / 30000); // rotate every 30s
  const ad = ads[(tick + ads.length - (ads.length > 1 ? 1 : 0)) % ads.length];
  await recordImpression(ad.id);

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
