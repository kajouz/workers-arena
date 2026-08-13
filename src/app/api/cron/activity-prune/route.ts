import { NextResponse } from "next/server";
import { pruneActivityLog } from "@/lib/data/activity";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/activity-prune — ActivityLog retention policy.
 *
 * Deletes admin-activity rows older than ACTIVITY_LOG_RETENTION_DAYS (default
 * 90). The admin overview feed caps reads at 200 entries, but rows accumulate
 * unboundedly in the database — this job bounds them. In demo/file mode it
 * trims the same policy from the gitignored .data feed.
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer):
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/activity-prune
 *
 * Idempotent: older rows are deleted, newer ones untouched — safe on any
 * interval.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const retentionDays = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS ?? 90);
  const { removed, remaining } = await pruneActivityLog(retentionDays);
  return NextResponse.json({ ok: true, retentionDays, removed, remaining });
}
