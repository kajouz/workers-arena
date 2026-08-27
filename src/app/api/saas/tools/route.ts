import { NextResponse } from "next/server";
import { getSaasTools, isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/saas/tools
 * 
 * Get available SaaS tools for purchase.
 * Public endpoint - no authentication required.
 */
export async function GET() {
  try {
    if (!isStreamEnabled("saas_tools")) {
      return NextResponse.json({ error: "SaaS tools system is disabled" }, { status: 403 });
    }

    const tools = getSaasTools();
    return NextResponse.json({ tools });
  } catch (error) {
    console.error("Error fetching SaaS tools:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
