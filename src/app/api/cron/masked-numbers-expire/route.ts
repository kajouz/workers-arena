/**
 * Cron Route: GET /api/cron/masked-numbers-expire
 *
 * Expires old masked numbers that have passed their expiration date.
 * Should be called periodically (e.g., every hour) via Vercel Cron or external scheduler.
 *
 * Vercel Cron config in vercel.json:
 * { "crons": [{ "path": "/api/cron/masked-numbers-expire", "schedule": "0 * * * *" }] }
 */

import { NextResponse } from "next/server";
import { expireOldMaskedNumbers } from "@/lib/calling/masked-number-service";

export async function GET(request: Request) {
  try {
    // Verify the request is from an authorized source
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expiredCount = await expireOldMaskedNumbers();

    console.log(`[Cron] Masked numbers expiration: ${expiredCount} numbers expired`);

    return NextResponse.json({
      success: true,
      expiredCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Error expiring masked numbers:", error);
    return NextResponse.json(
      { error: "Failed to expire masked numbers" },
      { status: 500 }
    );
  }
}
