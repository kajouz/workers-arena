"use server";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REFERRAL PROGRAM — server actions
 * ────────────────────────────────────────────────────────────────────────────
 * Actions for the worker referral program:
 *   • generateReferralCodeAction — get or create a worker's referral code
 *   • getReferralStatsAction — get referral stats for the dashboard
 *   • trackReferralAction — record that a new worker was referred
 *   • applyReferralBonusAction — grant credits to referrer + invitee
 */

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-demo";
import {
  getOrCreateReferralCode,
  getReferralStats,
  recordReferral,
  findWorkerByReferralCode,
} from "@/lib/data/referral-store";
import {
  referrerBonusFor,
  inviteeBonusFor,
  referralConfig,
  referralLink,
  referralShareMessage,
} from "@/lib/data/referral";
import { grantCredits } from "@/lib/data/credit-ledger";
import { logAdminActivity, ACTION_CODES } from "@/lib/data/activity";
import { loadActiveFeeRuleSet } from "@/lib/data/fee-rules-store";

/* ──────────────────────── Generate / Get Code ──────────────────────── */

export interface ReferralCodeResult {
  ok: true;
  code: string;
  link: string;
  shareMessage: string;
}

export interface ReferralError {
  ok: false;
  error: string;
}

/**
 * Get or create the current worker's referral code.
 */
export async function generateReferralCodeAction(): Promise<ReferralCodeResult | ReferralError> {
  const session = await getSession();
  if (!session || (session.role !== "worker" && session.role !== "admin")) {
    return { ok: false, error: "Only workers can generate referral codes." };
  }

  // The session carries the User ID, not the Worker ID. Look up the Worker row.
  let workerId: string | null = null;
  try {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();
    const worker = await prisma.worker.findFirst({
      where: { userId: session.id },
      select: { id: true },
    });
    workerId = worker?.id ?? null;
  } catch {
    workerId = session.id; // demo mode
  }
  if (!workerId) return { ok: false, error: "Worker not found." };

  try {
    const code = await getOrCreateReferralCode(workerId);
    const link = referralLink(code);
    const shareMessage = referralShareMessage(session.name ?? "Worker", code, "en");

    return { ok: true, code, link, shareMessage };
  } catch (e) {
    console.error("[referral] code generation failed", e);
    return { ok: false, error: "Failed to generate referral code." };
  }
}

/* ──────────────────────── Stats ──────────────────────── */

/**
 * Get referral stats for the current worker's dashboard.
 */
export async function getReferralStatsAction(): Promise<{
  ok: true;
  stats: import("@/lib/data/referral").ReferralStats;
} | ReferralError> {
  const session = await getSession();
  if (!session || (session.role !== "worker" && session.role !== "admin")) {
    return { ok: false, error: "Only workers can view referral stats." };
  }

  // The session carries the User ID, not the Worker ID. Look up the Worker
  // row by userId so getReferralStats queries the correct referrer.
  let workerId: string | null = null;
  try {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();
    const worker = await prisma.worker.findFirst({
      where: { userId: session.id },
      select: { id: true },
    });
    workerId = worker?.id ?? null;
  } catch {
    // Demo mode — no Prisma, fall back to session.id
    workerId = session.id;
  }
  if (!workerId) return { ok: false, error: "Worker not found." };

  try {
    const stats = await getReferralStats(workerId);
    return { ok: true, stats };
  } catch (e) {
    console.error("[referral] stats fetch failed", e);
    return { ok: false, error: "Failed to load referral stats." };
  }
}

/* ──────────────────────── Track Referral ──────────────────────── */

/**
 * Record that a new worker was referred by an existing worker.
 * Called during registration when the invitee uses a referral code.
 */
export async function trackReferralAction(input: {
  referralCode: string;
  newWorkerId: string;
}): Promise<{ ok: true; referrerName: string } | ReferralError> {
  // Look up the referrer
  const referrer = await findWorkerByReferralCode(input.referralCode);
  if (!referrer) return { ok: false, error: "Invalid referral code." };

  try {
    await recordReferral({
      referrerWorkerId: referrer.workerId,
      inviteeWorkerId: input.newWorkerId,
      code: input.referralCode,
    });

    return { ok: true, referrerName: referrer.workerName };
  } catch (e) {
    console.error("[referral] tracking failed", e);
    return { ok: false, error: "Failed to record referral." };
  }
}

/* ──────────────────────── Apply Bonus ──────────────────────── */

/**
 * Grant referral bonus credits to both referrer and invitee.
 * Called after the invitee completes a qualifying action (e.g. first booking).
 */
export async function applyReferralBonusAction(input: {
  referrerWorkerId: string;
  inviteeWorkerId: string;
}): Promise<{ ok: true; referrerBonus: number; inviteeBonus: number } | ReferralError> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return { ok: false, error: "Only admins can apply referral bonuses." };
  }

  try {
    const ruleSet = await loadActiveFeeRuleSet();
    const config = referralConfig(ruleSet);

    // Compute bonuses
    const referrerResult = referrerBonusFor(config, 0, 0); // TODO: pass real counts
    const inviteeResult = inviteeBonusFor(config);

    let referrerGranted = 0;
    let inviteeGranted = 0;

    // Grant referrer bonus
    if (referrerResult.granted && referrerResult.amount > 0) {
      await grantCredits({
        workerId: input.referrerWorkerId,
        amount: referrerResult.amount,
        reason: `Referral bonus — referred worker completed qualifying action`,
        createdBy: "referral-system",
      });
      referrerGranted = referrerResult.amount;
    }

    // Grant invitee bonus
    if (inviteeResult.granted && inviteeResult.amount > 0) {
      await grantCredits({
        workerId: input.inviteeWorkerId,
        amount: inviteeResult.amount,
        reason: `Welcome bonus — signed up via referral`,
        createdBy: "referral-system",
      });
      inviteeGranted = inviteeResult.amount;
    }

    // Log the activity
    await logAdminActivity({
      code: ACTION_CODES.LEAD_PURCHASED, // reuse
      actionEn: `Referral bonus applied: ${referrerGranted} to referrer, ${inviteeGranted} to invitee`,
      actionAr: `تم تطبيق مكافأة الإحالة: ${referrerGranted} للمحيل، ${inviteeGranted} للمدعو`,
      actor: session.name ?? "System",
      type: "payment",
    });

    revalidatePath("/dashboard");
    revalidatePath("/admin/revenue-settings");

    return { ok: true, referrerBonus: referrerGranted, inviteeBonus: inviteeGranted };
  } catch (e) {
    console.error("[referral] bonus application failed", e);
    return { ok: false, error: "Failed to apply referral bonus." };
  }
}
