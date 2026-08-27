import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/credits/balance
 * 
 * Get the current worker's credit balance.
 * Requires authentication as worker or admin.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isStreamEnabled("credits")) {
      return NextResponse.json({ error: "Credits system is disabled" }, { status: 403 });
    }

    // In demo mode, return mock balance
    const balance = {
      workerId: session.id || "demo-worker",
      balance: 25,
      totalPurchased: 50,
      totalSpent: 20,
      totalRefunded: 5,
      expiresAt: null,
      lastActivityAt: new Date().toISOString(),
    };

    return NextResponse.json({ balance });
  } catch (error) {
    console.error("Error fetching credit balance:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
