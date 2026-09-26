import { NextRequest, NextResponse } from "next/server";
import { recordImpression } from "@/lib/data/repo";
import { pickAd } from "@/lib/data/ad-rotation";
import { checkRateLimit } from "@/lib/rate-limit";

export const revalidate = 0;

/**
 * GET /api/ads?placement=homepage&category=plumbing&city=riyadh[&ad=<id>]
 * Serves the next ad in rotation for a placement and records an impression.
 * `ad` asks for a specific eligible ad — the one a server-rendered page
 * already showed — so the impression is counted for it.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const placement = p.get("placement") ?? "homepage";
  const category = p.get("category") ?? undefined;
  const city = p.get("city") ?? undefined;

  const ad = await pickAd(placement, { category, city }, p.get("ad") ?? undefined);
  if (!ad) return NextResponse.json({ ad: null });

  // Throttle impression counting per IP+ad (60s per ad) to stop bot inflation (M11).
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const impressionKey = `ad:imp:${ip}:${ad.id}`;
  if (await checkRateLimit(impressionKey, 1, 60_000)) {
    await recordImpression(ad.id);
  }

  return NextResponse.json({ ad });
}
