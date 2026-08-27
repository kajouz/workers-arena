import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getPayoutTiers, isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/payouts/tiers
 * 
 * Get available payout tiers.
 * Requires authentication as worker or admin.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isStreamEnabled("instant_payouts")) {
      return NextResponse.json({ error: "Instant payouts system is disabled" }, { status: 403 });
    }

    const tiers = getPayoutTiers();
    return NextResponse.json({ tiers });
  } catch (error) {
    console.error("Error fetching payout tiers:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
