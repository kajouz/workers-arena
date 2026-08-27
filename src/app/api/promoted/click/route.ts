import { NextResponse } from "next/server";
import { isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * POST /api/promoted/click
 * 
 * Track a click on a promoted profile.
 * Body:
 *   - campaignId: string (required)
 *   - workerId: string (required)
 *   - searchQuery: string (required)
 *   - categorySlug: string (required)
 *   - citySlug: string (required)
 *   - position: number (required)
 */
export async function POST(request: Request) {
  try {
    if (!isStreamEnabled("promoted_profiles")) {
      return NextResponse.json({ error: "Promoted profiles system is disabled" }, { status: 403 });
    }

    const body = await request.json();
    const { campaignId, workerId, searchQuery, categorySlug, citySlug, position } = body;

    if (!campaignId || !workerId || !searchQuery || !categorySlug || !citySlug || position === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // In demo mode, just log the click
    // In production, this would:
    // 1. Record the click in the database
    // 2. Deduct the CPC cost from the campaign budget
    // 3. Check if daily budget is exceeded
    console.log("[Promoted Click]", {
      campaignId,
      workerId,
      searchQuery,
      categorySlug,
      citySlug,
      position,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error tracking promoted click:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
