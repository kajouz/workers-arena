import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import {
  pushOwnerStamp,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/lib/notifications/push-store";
import type { PushSubscriptionJson } from "@/lib/notifications/push-store";

export const dynamic = "force-dynamic";

/** Rough UA → "Browser · OS" label for the admin subscription view. */
function deviceLabel(ua: string | null): string | undefined {
  if (!ua) return undefined;
  const edge = /Edg\/(\d+)/.exec(ua)?.[1];
  const chrome = /Chrome\/(\d+)/.exec(ua)?.[1];
  const firefox = /Firefox\/(\d+)/.exec(ua)?.[1];
  const safari = /Version\/(\d+).*Safari/.test(ua);
  const browser = edge ? `Edge ${edge}` : chrome ? `Chrome ${chrome}` : firefox ? `Firefox ${firefox}` : safari ? "Safari" : "Browser";
  const os =
    /iPhone|iPad/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" :
    "Unknown OS";
  return `${browser} · ${os}`;
}

/**
 * POST /api/push/register — persist or remove a browser Web Push subscription.
 *
 *   Body: { subscription: { endpoint, keys: { p256dh, auth } } }  → register
 *   Body: { unregister: "<endpoint>" }                            → remove
 * Guarded by the session. The owner stamp is chosen by pushOwnerStamp: demo
 * sessions (`u-…`, no user row) stamp the non-FK `ownerId`; once NextAuth is
 * wired the real prisma.user.id stamps the `userId` FK instead — no code change
 * here needed, just swap getSession() → auth() (docs/ARCHITECTURE.md → Push).
 * Persistence is handled by the push store's dual adapter — prisma.
 * pushSubscription when DATABASE_URL is set, else the file store (see
 * src/lib/notifications/push-store.ts).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { subscription?: PushSubscriptionJson; unregister?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  if (typeof body.unregister === "string" && body.unregister.length > 0) {
    // Ownership check: a session may only remove its own endpoints.
    const removed = await unregisterPushSubscription(body.unregister, session.id);
    if (!removed) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  const sub = body.subscription;
  if (!sub || typeof sub.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "invalid-subscription" }, { status: 400 });
  }

  const ok = await registerPushSubscription({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    ...pushOwnerStamp(session),
    device: deviceLabel(req.headers.get("user-agent")),
  });

  return NextResponse.json({ ok });
}
