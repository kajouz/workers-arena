/**
 * ────────────────────────────────────────────────────────────────────────────
 * WORKER REFERRAL PROGRAM — engine + config
 * ────────────────────────────────────────────────────────────────────────────
 * Workers invite other workers; both get bonus credits when the invitee
 * completes their first qualifying action (first booking, first lead purchase,
 * or profile completion — configurable).
 *
 * Flow:
 *   1. Worker generates a referral code (unique, 8-char alphanumeric)
 *   2. Invitee signs up with the code (or clicks the referral link)
 *   3. When the invitee completes a qualifying action, BOTH get bonus credits
 *   4. Bonus amounts and limits are admin-configurable (part of FeeRuleSet)
 *
 * Money-like discipline:
 *   - Every credit grant leaves an audit row (kind: "grant", reason mentions "referral")
 *   - Idempotent: a worker can only be referred once
 *   - Bonus caps: per-referrer monthly limit, per-referrer lifetime limit
 *   - The referral program can be toggled on/off by the admin
 */

import type { FeeRuleSet } from "./fee-rules";

/* ─────────────────────────────────── Config ─────────────────────────────────── */

export interface ReferralProgramConfig {
  /** Whether the referral program is active. */
  enabled: boolean;
  /** Credits granted to the referrer when the invitee qualifies. */
  referrerBonus: number;
  /** Credits granted to the invitee when they qualify (welcome bonus). */
  inviteeBonus: number;
  /** Maximum referrals per worker per month (0 = unlimited). */
  monthlyCap: number;
  /** Maximum lifetime referrals per worker (0 = unlimited). */
  lifetimeCap: number;
  /** What qualifies a referral (first booking, lead purchase, profile complete). */
  qualifyingAction: "first_booking" | "lead_purchase" | "profile_complete";
}

export const DEFAULT_REFERRAL_CONFIG: ReferralProgramConfig = {
  enabled: true,
  referrerBonus: 25,
  inviteeBonus: 10,
  monthlyCap: 10,
  lifetimeCap: 0, // unlimited
  qualifyingAction: "first_booking",
};

/** The lead-market numbers in force for a rule set (falls back to defaults). */
export function referralConfig(ruleSet: FeeRuleSet): ReferralProgramConfig {
  return (ruleSet as any).referral ?? DEFAULT_REFERRAL_CONFIG;
}

/* ─────────────────────────────────── Code ─────────────────────────────────── */

/** Characters allowed in a referral code (ambiguous chars removed). */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generate a random 8-character referral code. Pure.
 * Uses a simple PRNG — good enough for codes, not for security.
 */
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * Validate a referral code format. Pure.
 * Must be exactly 8 alphanumeric characters from the allowed set.
 */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z2-9]{8}$/.test(code.toUpperCase()) &&
    [...code.toUpperCase()].every((c) => CODE_CHARS.includes(c));
}

/* ─────────────────────────────────── Rules ─────────────────────────────────── */

/** Why a referral grant was given (shown in the audit trail). */
export type ReferralGrantReason =
  | "referrer-bonus"
  | "invitee-bonus"
  | "monthly-cap-reached"
  | "lifetime-cap-reached"
  | "program-disabled";

export interface ReferralGrantResult {
  granted: boolean;
  amount: number;
  reason: ReferralGrantReason;
}

/**
 * Compute the referrer's bonus. Pure: same config + counts → same answer.
 */
export function referrerBonusFor(
  config: ReferralProgramConfig,
  monthlyReferrals: number,
  lifetimeReferrals: number
): ReferralGrantResult {
  if (!config.enabled) {
    return { granted: false, amount: 0, reason: "program-disabled" };
  }
  if (config.monthlyCap > 0 && monthlyReferrals >= config.monthlyCap) {
    return { granted: false, amount: 0, reason: "monthly-cap-reached" };
  }
  if (config.lifetimeCap > 0 && lifetimeReferrals >= config.lifetimeCap) {
    return { granted: false, amount: 0, reason: "lifetime-cap-reached" };
  }
  return { granted: true, amount: config.referrerBonus, reason: "referrer-bonus" };
}

/**
 * Compute the invitee's welcome bonus. Pure.
 */
export function inviteeBonusFor(config: ReferralProgramConfig): ReferralGrantResult {
  if (!config.enabled) {
    return { granted: false, amount: 0, reason: "program-disabled" };
  }
  return { granted: true, amount: config.inviteeBonus, reason: "invitee-bonus" };
}

/* ─────────────────────────────────── Link ─────────────────────────────────── */

/**
 * Build the referral share URL. Pure.
 * Format: https://workers-arena.vercel.app/auth/register?ref=CODE
 */
export function referralLink(code: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://workers-arena.vercel.app";
  return `${base}/auth/register?ref=${code.toUpperCase()}`;
}

/**
 * Build a WhatsApp share message for the referral link. Pure.
 */
export function referralShareMessage(
  workerName: string,
  code: string,
  locale: "en" | "ar" = "en"
): string {
  const link = referralLink(code);
  if (locale === "ar") {
    return `مرحباً! أنا ${workerName} أستخدم WorkersArena للحصول على عملاء محتملين. سجّل عبر رابطي واحصل على رصيد مجاني:\n${link}`;
  }
  return `Hi! I'm ${workerName} and I use WorkersArena to get qualified leads. Sign up through my link and get free credits:\n${link}`;
}

/* ─────────────────────────────────── Stats ─────────────────────────────────── */

export interface ReferralStats {
  /** Total successful referrals. */
  totalReferrals: number;
  /** Referrals this month. */
  monthlyReferrals: number;
  /** Lifetime referrals. */
  lifetimeReferrals: number;
  /** Total credits earned from referrals. */
  totalCreditsEarned: number;
  /** The worker's referral code. */
  code: string;
  /** The referral share link. */
  link: string;
}

/**
 * Compute referral stats from raw data. Pure.
 */
export function computeReferralStats(input: {
  code: string;
  successfulReferrals: number;
  monthlyReferrals: number;
  lifetimeReferrals: number;
  creditsEarned: number;
}): ReferralStats {
  return {
    totalReferrals: input.successfulReferrals,
    monthlyReferrals: input.monthlyReferrals,
    lifetimeReferrals: input.lifetimeReferrals,
    totalCreditsEarned: input.creditsEarned,
    code: input.code,
    link: referralLink(input.code),
  };
}
