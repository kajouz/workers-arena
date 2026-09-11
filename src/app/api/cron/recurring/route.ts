import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runRecurringGenerationEngine } from "@/lib/data/recurring-generation";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/recurring — recurring-generation cron: materializes the next
 * batch of occurrences for ACTIVE maintenance contracts within the lookahead
 * window, claiming real AVAILABLE slots (idempotent — re-runs materialize
 * nothing new).
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer), same
 * CRON_SECRET as /api/cron/reminders:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/recurring
 *
 * Response: `{ ok, contracts, materialized }` — demo mode reports 0/0 (the
 * demo materializes at accept time).
 */
export async function GET(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const run = await runRecurringGenerationEngine();
  return NextResponse.json({ ok: true, ...run });
}
