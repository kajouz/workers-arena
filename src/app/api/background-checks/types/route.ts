import { NextResponse } from "next/server";
import { getBackgroundCheckTypes, isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/background-checks/types
 * 
 * Get available background check types.
 * Public endpoint - no authentication required.
 */
export async function GET() {
  try {
    if (!isStreamEnabled("background_checks")) {
      return NextResponse.json({ error: "Background checks system is disabled" }, { status: 403 });
    }

    const types = getBackgroundCheckTypes();
    return NextResponse.json({ types });
  } catch (error) {
    console.error("Error fetching background check types:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
