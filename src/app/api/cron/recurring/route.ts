import { NextResponse } from "next/server";
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
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await runRecurringGenerationEngine();
  return NextResponse.json({ ok: true, ...run });
}
