import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { 
  isStreamEnabled, 
  getCommissionTiers, 
  getCommissionTierForBillings,
  getAllCommissionTiers 
} from "@/lib/data/revenue-settings";

/**
 * GET /api/commission-tier
 * 
 * Get commission tier information.
 * Query params:
 *   - lifetimeBillings: Get tier for specific billings amount
 *   - all: Get all tiers (boolean)
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isStreamEnabled("sliding_commissions")) {
      return NextResponse.json({ error: "Sliding commissions system is disabled" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const lifetimeBillings = searchParams.get("lifetimeBillings");
    const all = searchParams.get("all") === "true";

    if (all) {
      const tiers = getAllCommissionTiers();
      return NextResponse.json({ tiers });
    }

    if (lifetimeBillings) {
      const billings = parseInt(lifetimeBillings);
      if (isNaN(billings)) {
        return NextResponse.json({ error: "Invalid lifetimeBillings" }, { status: 400 });
      }
      const tier = getCommissionTierForBillings(billings);
      return NextResponse.json({ tier, lifetimeBillings: billings });
    }

    // Default: return enabled tiers
    const tiers = getCommissionTiers();
    return NextResponse.json({ tiers });
  } catch (error) {
    console.error("Error fetching commission tier:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
