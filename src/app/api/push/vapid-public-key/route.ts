import { NextResponse } from "next/server";

// Read env per request — a build-time bake would lock a 404 when the key is
// added later (force-static + revalidate are mutually contradictory here).
export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid-public-key — exposes the VAPID public key so the client
 * can request a push subscription (navigator.pushManager). Returns 404 when
 * push is not configured.
 */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "push-not-configured" }, { status: 404 });
  return NextResponse.json({ publicKey: key });
}
