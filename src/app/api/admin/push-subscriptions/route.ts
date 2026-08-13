import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { forceRemovePushSubscription, listPushSubscriptions } from "@/lib/notifications/push-store";
import { pruneDeadPushSubscriptions, sendTestPushSubscription } from "@/lib/notifications/providers/push";
import { ACTION_CODES, logAdminActivity } from "@/lib/data/activity";

export const dynamic = "force-dynamic";

/**
 * Admin-only PushSubscription management.
 *
 *   GET /api/admin/push-subscriptions
 *     → { items: PushSubscriptionRecord[] } — every endpoint with owner,
 *       device and activity timestamps (newest-active first).
 *
 *   POST /api/admin/push-subscriptions
 *     { action: "remove",   endpoint } → force-remove one endpoint (bypasses
 *       the session ownership check used by /api/push/register).
 *     { action: "prune" }             → probe every endpoint (TTL:0) and remove
 *       the dead 404/410 ones. Returns { pruned: string[], kept: number }.
 *     { action: "test-send", endpoint } → send a real test notification to one
 *       endpoint (device-confirmed delivery). Returns { ok, error?, pruned? }.
 *
 * POST actions log an admin activity entry where meaningful. Every route is
 * guarded by the admin session role.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const items = await listPushSubscriptions();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { action?: string; endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (body.action === "remove") {
    const endpoint = body.endpoint;
    if (typeof endpoint !== "string" || endpoint.length === 0) {
      return NextResponse.json({ error: "invalid-endpoint" }, { status: 400 });
    }
    const removed = await forceRemovePushSubscription(endpoint);
    if (removed) {
      await logAdminActivity({
        code: ACTION_CODES.PUSH_SUBSCRIPTION_REMOVED,
        actionEn: `Push subscription removed by admin: ${endpoint.slice(0, 64)}`,
        actionAr: `إزالة اشتراك إشعارات بواسطة المسؤول: ${endpoint.slice(0, 64)}`,
        actor: session.name,
        actorId: session.id,
        type: "system",
      });
    }
    return NextResponse.json({ ok: removed });
  }

  if (body.action === "prune") {
    const { pruned, kept } = await pruneDeadPushSubscriptions();
    return NextResponse.json({ pruned, kept });
  }

  if (body.action === "test-send") {
    const endpoint = body.endpoint;
    if (typeof endpoint !== "string" || endpoint.length === 0) {
      return NextResponse.json({ error: "invalid-endpoint" }, { status: 400 });
    }
    const result = await sendTestPushSubscription(endpoint);
    await logAdminActivity({
      code: result.ok ? ACTION_CODES.PUSH_TEST_SEND_DELIVERED : ACTION_CODES.PUSH_TEST_SEND_FAILED,
      actionEn: `Push test send${result.ok ? " delivered" : " failed"}: ${endpoint.slice(0, 64)}`,
      actionAr: `إرسال إشعار اختباري${result.ok ? " — تم التسليم" : " — فشل"}: ${endpoint.slice(0, 64)}`,
      actor: session.name,
      actorId: session.id,
      type: "system",
    });
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "invalid-action" }, { status: 400 });
}
