import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
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
 *
 * The response reports which store answered and whether the delete actually
 * landed (`persisted`). Production runs `DEMO_MODE=true`, so the file adapter is
 * in play on Vercel's read-only filesystem: the prune is then a no-op and this
 * endpoint says so in the scheduler's log (`persisted: false`) instead of
 * answering 500 — or, worse, claiming a retention policy that never ran.
 */
export async function GET(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const retentionDays = Number(process.env.ACTIVITY_LOG_RETENTION_DAYS ?? 90);
  const { removed, remaining, persisted, store } = await pruneActivityLog(retentionDays);
  return NextResponse.json({ ok: true, retentionDays, removed, remaining, store, persisted });
}
