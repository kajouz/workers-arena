import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDemoMode } from "@/lib/data/repo";
import { guestOtpEnforced, otpPhoneKey, sendGuestOtp } from "@/lib/data/guest-otp";

/**
 * POST /api/auth/guest-otp — send a one-time code to a guest's handset.
 *
 * The only entry point into the OTP engine from the client: the dialogs call
 * it when the guest reaches the verification step (and for re-sends). One
 * code per 60s per phone (the SMS content is re-sent, the challenge is
 * replaced — one live challenge per handset) and 5 per hour per IP, both
 * through the shared distributed limiter so multi-region edges can't be used
 * to multiply attempts (src/lib/rate-limit.ts header).
 *
 * The response carries `devCode` ONLY in demo mode — the documented bypass
 * that lets the test suite and local dev complete verification without an
 * SMS gateway (src/lib/data/guest-otp.ts header §5). In production the code
 * travels by SMS alone; the endpoint still returns ok:true so the UI flow is
 * identical (the guest reads the code from their phone instead of the dialog).
 *
 * The endpoint works regardless of GUEST_OTP_ENFORCED: dev, tests and the
 * nightly real-DB flows keep exercising the machinery, and enforcement only
 * decides whether the guest write actions REQUIRE a verified code.
 */

/**
 * GET — the enforcement probe. The dialogs call it once when the phone step
 * becomes relevant so the verification UI only renders when this environment
 * actually requires OTP (default: dormant — zero UX change). No side effects:
 * it reads two env-backed flags and touches no store.
 */
export async function GET() {
  return NextResponse.json({ ok: true, enforced: guestOtpEnforced(), demo: isDemoMode });
}

export async function POST(request: Request) {
  let body: { phone?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const key = otpPhoneKey(phone);
  if (!/^\+?\d{8,15}$/.test(key)) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  // Per-handset 1/min: an SMS costs money and re-sending faster than a human
  // can read has no legitimate use. Per-IP 5/hour: one origin cannot spray
  // many handsets. Keys are stable under the same normalization everywhere.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const [perPhone, perIp] = await Promise.all([
    checkRateLimit(`guest-otp:phone:${key}`, 1, 60_000),
    checkRateLimit(`guest-otp:ip:${ip}`, 5, 3_600_000),
  ]);
  if (!perPhone) {
    return NextResponse.json({ ok: false, error: "rate-limited", retryAfterSec: 60 }, { status: 429 });
  }
  if (!perIp) {
    return NextResponse.json({ ok: false, error: "rate-limited", retryAfterSec: 3600 }, { status: 429 });
  }

  const result = await sendGuestOtp(key);
  if (!result.ok) return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  return NextResponse.json({
    ok: true,
    // Demo bypass — never present when DEMO_MODE=false (production).
    ...(isDemoMode && result.devCode ? { devCode: result.devCode } : {}),
    enforced: guestOtpEnforced(),
  });
}
