import { NextResponse } from "next/server";
import { getCreditPackages, isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/credits/packages
 * 
 * Get available credit packages for purchase.
 * Public endpoint - no authentication required.
 */
export async function GET() {
  try {
    if (!isStreamEnabled("credits")) {
      return NextResponse.json({ error: "Credits system is disabled" }, { status: 403 });
    }

    const packages = getCreditPackages();
    return NextResponse.json({ packages });
  } catch (error) {
    console.error("Error fetching credit packages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
