import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/tokens/balance
 * 
 * Get the current worker's token balance.
 * Requires authentication as worker or admin.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isStreamEnabled("tokens")) {
      return NextResponse.json({ error: "Tokens system is disabled" }, { status: 403 });
    }

    // In demo mode, return mock balance
    const balance = {
      workerId: session.id || "demo-worker",
      balance: 15,
      totalEarned: 30,
      totalSpent: 10,
      totalPurchased: 20,
      totalExpired: 5,
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    return NextResponse.json({ balance });
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
