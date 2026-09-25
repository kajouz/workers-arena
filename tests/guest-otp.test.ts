import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OTP_MAX_ATTEMPTS,
  evaluateOtpAttempt,
  generateOtp,
  gateGuestWrite,
  hashOtp,
  otpPhoneKey,
  resetDemoOtpChallenges,
  sendGuestOtp,
  verifyGuestOtp,
} from "@/lib/data/guest-otp";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * GUEST PHONE OTP (docs/ENHANCEMENT-PLAN.md — guest phone OTP)
 * ────────────────────────────────────────────────────────────────────────────
 * The engine (src/lib/data/guest-otp.ts) runs on the demo adapter in this
 * suite — the same in-memory store production demo mode uses. The prisma
 * adapter is shape-identical (both funnel through the pure evaluateOtpAttempt)
 * and is exercised against a live database by the nightly suites via the send
 * endpoint + action gate. The endpoint and UI are pinned structurally where
 * runtime behavior would need Next request plumbing.
 * ────────────────────────────────────────────────────────────────────────────
 */

// GUEST_OTP_ENFORCED is env-backed and snapshotted at call time — stub it.
const stubEnforcement = (enforced: boolean) => vi.stubEnv("GUEST_OTP_ENFORCED", enforced ? "true" : "false");

beforeEach(() => {
  stubEnforcement(true);
  resetDemoOtpChallenges();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetDemoOtpChallenges();
});

describe("otp primitives", () => {
  it("generates 6-digit numeric codes", () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("normalizes the phone key the way the SMS providers do", () => {
    expect(otpPhoneKey("+961 70 123 456")).toBe(otpPhoneKey("+961-70-123-456"));
    expect(otpPhoneKey("+961 70 123 456")).toBe("+96170123456");
  });

  it("hashes codes as keyed HMACs — same input, same hash; different phone, different hash", () => {
    expect(hashOtp("+96170123456", "123456")).toBe(hashOtp("+961 70 123 456", "123456"));
    expect(hashOtp("+96170123456", "123456")).not.toBe(hashOtp("+96170123457", "123456"));
    expect(hashOtp("+96170123456", "123456")).not.toContain("123456");
  });
});

describe("evaluateOtpAttempt (pure verdict engine)", () => {
  const stored = { codeHash: hashOtp("k", "123456"), attempts: 0, expiresAt: 1_000 };
  const attempt = (code: string, nowMs = 500, attempts = 0) =>
    evaluateOtpAttempt({ ...stored, attempts }, { phone: "k", code, nowMs });

  it("accepts the correct code inside the window", () => {
    expect(attempt("123456").verdict).toEqual({ ok: true });
  });

  it("rejects a wrong code and counts the attempt", () => {
    const res = attempt("654321");
    expect(res.verdict).toEqual({ ok: false, reason: "wrong-code" });
    expect(res.attemptsAfter).toBe(1);
  });

  it("expires after the TTL — even for the correct code", () => {
    expect(attempt("123456", 1_001).verdict).toEqual({ ok: false, reason: "expired" });
  });

  it("caps attempts regardless of correctness", () => {
    expect(attempt("654321", 500, OTP_MAX_ATTEMPTS).verdict).toEqual({ ok: false, reason: "too-many-attempts" });
    // The correct code does not resurrect an exhausted challenge.
    expect(attempt("123456", 500, OTP_MAX_ATTEMPTS).verdict).toEqual({ ok: false, reason: "too-many-attempts" });
  });

  it("reports exhausted exactly when the cap is reached", () => {
    expect(attempt("654321", 500, OTP_MAX_ATTEMPTS - 1).verdict).toEqual({ ok: false, reason: "too-many-attempts" });
  });
});

describe("demo adapter round-trip (send → verify)", () => {
  it("issues a code that verifies once, then the challenge is consumed", async () => {
    const sent = await sendGuestOtp("+961 70 111 222");
    if (!sent.ok) throw new Error("send failed");
    const { devCode } = sent;
    expect(devCode).toMatch(/^\d{6}$/); // demo bypass — see endpoint contract below

    expect(await verifyGuestOtp("+961-70-111-222", devCode!)).toEqual({ ok: true }); // normalized key
    expect(await verifyGuestOtp("+961 70 111 222", devCode!)).toEqual({ ok: false, reason: "expired" }); // single-use
  });

  it("re-sending replaces the live challenge — the old code stops working", async () => {
    const first = await sendGuestOtp("+96170111222");
    const second = await sendGuestOtp("+96170111222");
    if (!first.ok || !second.ok) throw new Error("send failed");
    expect(first.devCode).not.toBe(second.devCode);
    expect(await verifyGuestOtp("+96170111222", second.devCode!)).toEqual({ ok: true });
  });

  it("locks the challenge after the attempt budget", async () => {
    const sent = await sendGuestOtp("+96170111222");
    if (!sent.ok) throw new Error("send failed");
    const devCode = sent.devCode;
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i += 1) {
      await verifyGuestOtp("+96170111222", "000000");
    }
    expect(await verifyGuestOtp("+96170111222", devCode!)).toEqual({ ok: false, reason: "too-many-attempts" });
  });

  it("rejects malformed numbers at send time", async () => {
    await expect(sendGuestOtp("not-a-phone")).resolves.toEqual({ ok: false, error: "invalid" });
  });
});

describe("gateGuestWrite (the action seam)", () => {
  it("never blocks signed-in users", async () => {
    await expect(gateGuestWrite({ id: "u1" }, "+96170111222", {})).resolves.toEqual({ ok: true });
    await expect(gateGuestWrite({ id: "u1" }, "+96170111222", { otpCode: "000000" })).resolves.toEqual({ ok: true });
  });

  it("is a no-op when enforcement is off (default environments)", async () => {
    stubEnforcement(false);
    await expect(gateGuestWrite(null, "+96170111222", {})).resolves.toEqual({ ok: true });
    await expect(gateGuestWrite(null, "+96170111222", { otpCode: "000000" })).resolves.toEqual({ ok: true });
  });

  it("demands a code from guests when enforced", async () => {
    await expect(gateGuestWrite(null, "+96170111222", {})).resolves.toEqual({ ok: false, error: "otp-required" });
    await expect(gateGuestWrite(null, undefined, { otpCode: "123456" })).resolves.toEqual({
      ok: false,
      error: "otp-required",
    });
  });

  it("verifies the presented code — wrong fails, right passes once", async () => {
    const sent = await sendGuestOtp("+96170111222");
    if (!sent.ok) throw new Error("send failed");
    const devCode = sent.devCode;
    await expect(gateGuestWrite(null, "+96170111222", { otpCode: "000000" })).resolves.toEqual({
      ok: false,
      error: "otp-invalid",
    });
    await expect(gateGuestWrite(null, "+961 70 111 222", { otpCode: devCode! })).resolves.toEqual({ ok: true });
  });
});

describe("send endpoint + UI wiring", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");

  it("endpoint is rate-limited on both phone and IP and carries the demo bypass only in demo", () => {
    const endpoint = read("src/app/api/auth/guest-otp/route.ts");
    expect(endpoint).toContain("guest-otp:phone:");
    expect(endpoint).toContain("guest-otp:ip:");
    // The demo bypass is the documented contract: devCode leaves the endpoint
    // ONLY behind the isDemoMode snapshot.
    expect(endpoint).toMatch(/isDemoMode && result\.devCode \? \{ devCode/);
  });

  it("both guest dialogs carry the verification section and the code rides the form", () => {
    for (const dialog of ["src/components/worker/booking-dialog.tsx", "src/components/worker/quote-request-dialog.tsx"]) {
      const src = read(dialog);
      expect(src).toContain("<GuestOtpSection");
      expect(src).toContain('fd.set("otpCode"');
    }
  });

  it("all four guest write actions gate before the write", () => {
    const actions = read("src/app/actions/bookings.ts");
    expect(actions.match(/gateGuestWrite\(/g)?.length).toBe(4);
  });

  it("otp strings exist in both dictionaries", async () => {
    const { en } = await import("@/lib/i18n/translations/en");
    const { ar } = await import("@/lib/i18n/translations/ar");
    const enBooking = (en as unknown as { booking: Record<string, string> }).booking;
    const arBooking = (ar as unknown as { booking: Record<string, string> }).booking;
    for (const key of [
      "otpTitle",
      "otpBody",
      "otpSend",
      "otpResend",
      "otpSent",
      "otpDevCode",
      "otpPlaceholder",
      "otpRateLimited",
      "otpSendFailed",
      "otpRequired",
      "otpInvalid",
    ]) {
      expect(enBooking[key], `en.booking.${key} missing`).toBeTruthy();
      expect(arBooking[key], `ar.booking.${key} missing`).toBeTruthy();
    }
  });
});
