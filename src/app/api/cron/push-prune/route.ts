import { NextResponse } from "next/server";
import { pruneDeadPushSubscriptions } from "@/lib/notifications/providers/push";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/push-prune — scheduled dead-endpoint cleanup.
 *
 * Probes every registered push subscription with a TTL:0 notification and
 * removes the ones the push service rejects with 404/410 (unsubscribed or
 * expired endpoints), logging each prune to the admin activity feed.
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer):
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/push-prune
 *
 * Safe to run on any interval: the probe is idempotent (dead endpoints are
 * removed once, healthy ones are left untouched) and a no-op when no VAPID
 * keys are configured or no subscriptions exist.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { pruned, kept } = await pruneDeadPushSubscriptions();
  return NextResponse.json({ ok: true, pruned, kept });
}
