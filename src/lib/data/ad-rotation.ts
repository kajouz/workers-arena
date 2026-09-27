import { getActiveAdsFor } from "@/lib/data/repo";

/** The ad fields a page or the /api/ads response exposes to the browser. */
export type ServedAd = {
  id: string;
  nameEn: string;
  nameAr: string;
  placement: string;
  adType: string;
  ctr: number;
  clicks: number;
  impressions: number;
};

/**
 * Pick the ad to serve for a placement: active, under its impression cap, in
 * 30-second round-robin. `preferId` keeps an ad the page already rendered, so
 * the browser's follow-up impression call counts the ad the visitor saw.
 * Impressions are recorded by the caller (/api/ads), never here.
 */
export async function pickAd(
  placement: string,
  filters: { category?: string; city?: string } = {},
  preferId?: string
): Promise<ServedAd | null> {
  const ads = await getActiveAdsFor(placement, filters);
  const eligible = ads.filter((a) => {
    const max = (a as unknown as { maxImpressions?: number | null }).maxImpressions;
    return max == null || a.impressions < max;
  });
  if (eligible.length === 0) return null;
  const tick = Math.floor(Date.now() / 30000);
  const ad = eligible.find((a) => a.id === preferId) ?? eligible[tick % eligible.length]!;
  return {
    id: ad.id,
    nameEn: ad.nameEn,
    nameAr: ad.nameAr,
    placement: ad.placement,
    adType: ad.adType,
    ctr: ad.ctr,
    clicks: ad.clicks,
    impressions: ad.impressions,
  };
}
