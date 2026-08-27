import { NextResponse } from "next/server";
import { getTokenPackages, isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/tokens/packages
 * 
 * Get available token packages for purchase.
 * Public endpoint - no authentication required.
 */
export async function GET() {
  try {
    if (!isStreamEnabled("tokens")) {
      return NextResponse.json({ error: "Tokens system is disabled" }, { status: 403 });
    }

    const packages = getTokenPackages();
    return NextResponse.json({ packages });
  } catch (error) {
    console.error("Error fetching token packages:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
