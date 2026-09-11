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
import { verifyCronAuth } from "@/lib/cron-auth";
import { expireOldMaskedNumbers } from "@/lib/calling/masked-number-service";

export async function GET(request: Request) {
  try {
    const authError = verifyCronAuth(request);
    if (authError) return authError;

    const expiredCount = await expireOldMaskedNumbers();

    if (process.env.LOG_LEVEL !== "silent") console.log(`[Cron] Masked numbers expiration: ${expiredCount} numbers expired`);

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
