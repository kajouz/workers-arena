/**
 * ────────────────────────────────────────────────────────────────────────────
 * GUEST PHONE OTP — make "phone-keyed" mean "phone-verified"
 * ────────────────────────────────────────────────────────────────────────────
 * Guests book with a name and a phone and no account; every booking, quote
 * request and recurring contract is keyed on that phone. Until now nothing
 * proved the guest owns the handset, so a typo — or a stranger — could aim
 * bookings, SMS and WhatsApp at any number (docs/ENHANCEMENT-PLAN.md: a
 * one-time code "raises trust enough that workers stop declining 'anonymous'
 * requests", and de-risks M3 deposits).
 *
 * Architecture mirrors the repo's dual-adapter seam:
 *   • pure logic + constants   — code generation, hashing, verdict mapping
 *   • demo adapter             — in-memory Map, testable without Postgres
 *   • prisma adapter           — GuestOtpChallenge rows (migration
 *                                20260925120000_guest_otp_challenges)
 *   • adapter switch           — `realDataEnabled` snapshot, exactly like
 *                                src/lib/data/repo.ts
 *
 * ── Security properties ─────────────────────────────────────────────────────
 * 1. Codes are 6 digits (10^6 space) with a 5-attempt cap per challenge: the
 *    worst case 5·10⁻⁵ success per challenge is worthless against a rate-
 *    limited sender. 10 minutes to use it.
 * 2. The code is never stored — only its HMAC-SHA-256 (OTP_HASH_SECRET).
 *    A database leak yields no usable codes.
 * 3. One live challenge per handset: re-sending replaces the row (the demo
 *    Map keys on the normalized phone; the table is UNIQUE(phone)).
 * 4. Delivery rides the existing SMS channel (console provider in dev/demo —
 *    the code is visible in the server log; Twilio in production).
 * 5. Demo bypass: `sendGuestOtp` returns `devCode` when `isDemoMode` is on,
 *    so the test suite and local flows can complete verification without an
 *    SMS gateway. Production (`DEMO_MODE=false`) never receives it.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { createHmac, randomInt } from "node:crypto";
import { normalizePhone } from "@/lib/notifications/types";
import { isDemoMode, realDataEnabled } from "./repo";

/** Code space / attempt budget / validity window — see header §1. */
export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MS = 10 * 60 * 1000;

/** The canonical key: normalized like the SMS/WhatsApp providers see it. */
export function otpPhoneKey(phone: string): string {
  return normalizePhone(phone) ?? phone.trim();
}

/** Six digits, crypto-random (randomInt is uniform — no modulo bias). */
export function generateOtp(): string {
  let code = "";
  for (let i = 0; i < OTP_LENGTH; i += 1) {
    code += String(randomInt(0, 10));
  }
  return code;
}

/** The only stored form of a code: HMAC-SHA-256 under OTP_HASH_SECRET. */
export function hashOtp(phone: string, code: string): string {
  return createHmac("sha256", process.env.OTP_HASH_SECRET ?? "workersarena-otp-dev-secret")
    .update(`${otpPhoneKey(phone)}:${code}`)
    .digest("hex");
}

/** The verdict of a verification attempt — mapped 1:1 to i18n error keys. */
export type OtpVerifyVerdict =
  | { ok: true }
  | { ok: false; reason: "expired" | "too-many-attempts" | "wrong-code" };

/**
 * Pure verdict engine — same inputs ⇒ same verdict, no clock reads, no I/O.
 * Both adapters funnel their stored state through this so the rules live once.
 */
export function evaluateOtpAttempt(
  stored: { codeHash: string; attempts: number; expiresAt: number },
  input: { phone: string; code: string; nowMs: number }
): { verdict: OtpVerifyVerdict; attemptsAfter: number } {
  const attemptsAfter = stored.attempts + 1;
  if (stored.expiresAt <= input.nowMs) {
    return { verdict: { ok: false, reason: "expired" }, attemptsAfter };
  }
  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    return { verdict: { ok: false, reason: "too-many-attempts" }, attemptsAfter };
  }
  if (hashOtp(input.phone, input.code.trim()) === stored.codeHash) {
    return { verdict: { ok: true }, attemptsAfter };
  }
  return {
    verdict: { ok: false, reason: attemptsAfter >= OTP_MAX_ATTEMPTS ? "too-many-attempts" : "wrong-code" },
    attemptsAfter,
  };
}

/* ───────────────────────── demo adapter (in-memory) ─────────────────────── */

interface DemoChallenge {
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

const demoChallenges = new Map<string, DemoChallenge>();

/** Test hook: drop all in-memory challenges (demo adapter only). */
export function resetDemoOtpChallenges(): void {
  demoChallenges.clear();
}

async function demoSendOtp(phone: string): Promise<string> {
  const key = otpPhoneKey(phone);
  const code = generateOtp();
  demoChallenges.set(key, {
    codeHash: hashOtp(key, code),
    attempts: 0,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
  return code;
}

async function demoVerifyOtp(phone: string, code: string): Promise<OtpVerifyVerdict> {
  const key = otpPhoneKey(phone);
  const stored = demoChallenges.get(key);
  if (!stored) return { ok: false, reason: "expired" };
  const { verdict, attemptsAfter } = evaluateOtpAttempt(stored, {
    phone: key,
    code,
    nowMs: Date.now(),
  });
  if (verdict.ok) {
    demoChallenges.delete(key);
    return { ok: true };
  }
  demoChallenges.set(key, { ...stored, attempts: attemptsAfter });
  return verdict;
}

/* ──────────────────────── prisma adapter (real mode) ────────────────────── */

async function prismaSendOtp(phone: string): Promise<string> {
  const { getPrisma } = await import("@/lib/server/prisma");
  const prisma = getPrisma();
  const key = otpPhoneKey(phone);
  const code = generateOtp();
  await prisma.guestOtpChallenge.upsert({
    where: { phone: key },
    create: { phone: key, codeHash: hashOtp(key, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    update: { codeHash: hashOtp(key, code), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });
  return code;
}

async function prismaVerifyOtp(phone: string, code: string): Promise<OtpVerifyVerdict> {
  const { getPrisma } = await import("@/lib/server/prisma");
  const prisma = getPrisma();
  const key = otpPhoneKey(phone);
  const row = await prisma.guestOtpChallenge.findUnique({ where: { phone: key } });
  if (!row) return { ok: false, reason: "expired" };
  const { verdict, attemptsAfter } = evaluateOtpAttempt(
    { codeHash: row.codeHash, attempts: row.attempts, expiresAt: row.expiresAt.getTime() },
    { phone: key, code, nowMs: Date.now() }
  );
  if (verdict.ok) {
    await prisma.guestOtpChallenge.delete({ where: { phone: key } }).catch(() => {});
    return { ok: true };
  }
  await prisma.guestOtpChallenge.update({ where: { phone: key }, data: { attempts: attemptsAfter } }).catch(() => {});
  return verdict;
}

/** The sweeper's prisma half (wired into the cron sweep with the SLA jobs). */
export async function prismaDeleteExpiredOtpChallenges(now: Date = new Date()): Promise<number> {
  const { getPrisma } = await import("@/lib/server/prisma");
  const res = await getPrisma().guestOtpChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
  return res.count;
}

/**
 * Mode-aware sweeper for the cron route: the prisma table needs physical
 * cleanup; the demo adapter's Map needs none (entries expire by timestamp and
 * are replaced on re-send — a process-lifetime Map with no unbounded growth,
 * since one entry per handset ever challenged). Returns the rows deleted.
 */
export async function sweepExpiredOtpChallenges(now: Date = new Date()): Promise<number> {
  if (!realDataEnabled) return 0;
  return prismaDeleteExpiredOtpChallenges(now);
}

/* ────────────────────────────── adapter switch ──────────────────────────── */

/**
 * Send a fresh code to the handset and deliver it over the SMS channel.
 * Returns `devCode` ONLY in demo mode (the test-suite bypass — header §5);
 * the SMS console provider logs it in dev either way.
 */
export async function sendGuestOtp(
  phone: string
): Promise<{ ok: true; devCode?: string } | { ok: false; error: "invalid" }> {
  const key = otpPhoneKey(phone);
  if (!/^\+?\d{8,15}$/.test(key)) return { ok: false, error: "invalid" };
  const code = realDataEnabled ? await prismaSendOtp(key) : await demoSendOtp(key);

  const { dispatch } = await import("@/lib/notifications/dispatcher");
  await dispatch({
    id: `otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: "verification",
    titleEn: "Your WorkersArena code",
    titleAr: "رمز وركرز أرينا",
    bodyEn: `Your verification code is ${code}. It expires in 10 minutes.`,
    bodyAr: `رمز التحقق الخاص بك هو ${code}. تنتهي صلاحيته بعد ١٠ دقائق.`,
    time: new Date().toISOString(),
    recipient: { phone: key },
  });
  return { ok: true, devCode: isDemoMode ? code : undefined };
}

/**
 * Consume one verification attempt. Callers gate guest writes on `{ ok: true }`.
 */
export async function verifyGuestOtp(phone: string, code: string): Promise<OtpVerifyVerdict> {
  const key = otpPhoneKey(phone);
  return realDataEnabled ? prismaVerifyOtp(key, code) : demoVerifyOtp(key, code);
}

/* ─────────────────────── enforcement helper (server actions) ─────────────── */

/**
 * Whether guest writes must present a verified code.
 *
 * Default is OFF: the nightly critical-flow suites and every seeded flow run
 * in real mode WITHOUT a delivery gateway, and hard-requiring OTP there would
 * break them. `GUEST_OTP_ENFORCED=true` turns the gate on per environment —
 * production flips it when a real SMS provider is configured. When off, the
 * feature is dormant everywhere (the send endpoint still works and the demo
 * bypass still functions, so tests and dev keep exercising the machinery).
 */
export function guestOtpEnforced(): boolean {
  return process.env.GUEST_OTP_ENFORCED === "true";
}

/**
 * The guest-OTP fields the dialogs append to their FormData (`otpCode`),
 * forwarded through `guestProofFrom`-style plumbing.
 */
export function guestOtpFieldsFrom(formData: FormData): { otpCode?: string } {
  const code = formData.get("otpCode");
  return typeof code === "string" && code.trim() ? { otpCode: code.trim() } : {};
}

/**
 * The one gate every guest write action calls before creating a record.
 *
 * Semantics: signed-in users never need OTP (their session is the stronger
 * credential, same reasoning as the authz seam); enforcement off = no-op;
 * a present code is verified against the live challenge (single-use,
 * attempt-capped); a missing or wrong code yields a typed error the UI maps
 * to a copy line — `otp-required` re-opens the code entry with the send
 * button, the others render as the inline error.
 */
export async function gateGuestWrite(
  session: { id: string } | null | undefined,
  phone: string | undefined,
  fields: { otpCode?: string }
): Promise<{ ok: true } | { ok: false; error: "otp-required" | "otp-invalid" }> {
  if (!guestOtpEnforced()) return { ok: true };
  if (session?.id) return { ok: true };
  if (!phone) return { ok: false, error: "otp-required" };
  if (!fields.otpCode) return { ok: false, error: "otp-required" };
  const verdict = await verifyGuestOtp(phone, fields.otpCode);
  return verdict.ok ? { ok: true } : { ok: false, error: "otp-invalid" };
}
