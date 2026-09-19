import { NextResponse } from "next/server";

// Read env per request — a build-time bake would lock a 404 when the key is
// added later (force-static + revalidate are mutually contradictory here).
export const dynamic = "force-dynamic";

/**
 * Cached auto-generated VAPID key pair for dev/demo mode.
 * When VAPID_PUBLIC_KEY is not set, we generate a fresh ECDSA P-256 key pair
 * so the endpoint always returns valid keys. These are ephemeral (per-process)
 * — real deployments must set the env vars for push to actually deliver.
 */
let cachedPublicKey: string | null = null;

async function generateVapidKeyPair(): Promise<string> {
  if (cachedPublicKey) return cachedPublicKey;

  const cryptoKey = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true, // extractable
    ["sign"]
  );

  const rawPub = await crypto.subtle.exportKey("raw", cryptoKey.publicKey);
  // VAPID uses base64url encoding of the raw uncompressed EC public key
  // (65 bytes: 0x04 + X + Y). Pad to 43 chars.
  const base64 = Buffer.from(rawPub)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  cachedPublicKey = base64;
  return base64;
}

/**
 * GET /api/push/vapid-public-key — exposes the VAPID public key so the client
 * can request a push subscription (navigator.pushManager).
 *
 * When VAPID_PUBLIC_KEY is configured, returns that key.
 * Otherwise, auto-generates a test key pair (dev/demo only — real deployments
 * must configure VAPID keys for push to deliver).
 */
export async function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (key) {
    return NextResponse.json({ publicKey: key, configured: true });
  }

  // Never advertise an ephemeral public key in real mode: it cannot match a
  // durable private key across instances and would create subscriptions that
  // can never receive a push. Production must configure the complete VAPID
  // triplet in its secret manager.
  if (process.env.DEMO_MODE === "false") {
    return NextResponse.json(
      { error: "push-not-configured", message: "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are required" },
      { status: 503 }
    );
  }

  // Auto-generate for dev/demo — push won't actually deliver without
  // VAPID_PRIVATE_KEY, but the subscription flow won't break.
  try {
    const publicKey = await generateVapidKeyPair();
    return NextResponse.json({ publicKey, configured: false });
  } catch {
    return NextResponse.json(
      { error: "push-not-configured", message: "VAPID key generation failed" },
      { status: 500 }
    );
  }
}
