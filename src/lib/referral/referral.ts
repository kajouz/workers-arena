/**
 * Referral System Backend
 *
 * Manages referral codes, tracking, and rewards for the WorkersArena platform.
 * Workers and customers can refer others and earn rewards when they sign up
 * and complete their first booking.
 *
 * Reward tiers:
 * - 1st referral: $10 account credit
 * - 3rd referral: 20% discount on next subscription
 * - 5th referral: 30 days premium free
 * - 10th referral: Featured listing for 30 days
 */

import crypto from "crypto";

/* ─── Types ─── */
export interface ReferralCode {
  id: string;
  code: string;
  userId: string;
  userName: string;
  userRole: "worker" | "customer";
  createdAt: string;
  active: boolean;
}

export interface Referral {
  id: string;
  referralCode: string;
  referrerId: string;
  referrerName: string;
  referredId: string;
  referredName: string;
  referredEmail: string;
  status: "pending" | "completed" | "rewarded";
  createdAt: string;
  completedAt?: string;
  rewardedAt?: string;
  reward?: ReferralReward;
}

export interface ReferralReward {
  type: "credit" | "discount" | "premium_days" | "featured_listing";
  value: number;
  description: string;
  expiresAt?: string;
}

export interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalRewards: number;
  nextRewardAt: number;
  nextReward: ReferralReward | null;
}

/* ─── In-Memory Store (demo mode) ─── */
const codes: ReferralCode[] = [];
const referrals: Referral[] = [];

/* ─── Code Generation ─── */
function generateCode(userName: string): string {
  const prefix = userName.slice(0, 3).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6);
  return `${prefix}-${random}`;
}

/* ─── Public API ─── */

/**
 * Create a referral code for a user
 */
export function createReferralCode(
  userId: string,
  userName: string,
  userRole: "worker" | "customer"
): ReferralCode {
  // Check if user already has an active code
  const existing = codes.find((c) => c.userId === userId && c.active);
  if (existing) return existing;

  const code: ReferralCode = {
    id: `ref-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    code: generateCode(userName),
    userId,
    userName,
    userRole,
    createdAt: new Date().toISOString(),
    active: true,
  };

  codes.push(code);
  return code;
}

/**
 * Get a user's referral code
 */
export function getReferralCode(userId: string): ReferralCode | null {
  return codes.find((c) => c.userId === userId && c.active) || null;
}

/**
 * Apply a referral code when a new user signs up
 */
export function applyReferralCode(
  referralCode: string,
  newUserId: string,
  newUserName: string,
  newUserEmail: string
): { success: boolean; referrerName?: string; error?: string } {
  const code = codes.find((c) => c.code === referralCode && c.active);
  if (!code) {
    return { success: false, error: "Invalid or expired referral code" };
  }

  if (code.userId === newUserId) {
    return { success: false, error: "Cannot refer yourself" };
  }

  // Check if already referred
  const existing = referrals.find((r) => r.referredId === newUserId);
  if (existing) {
    return { success: false, error: "User was already referred" };
  }

  const referral: Referral = {
    id: `rel-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    referralCode,
    referrerId: code.userId,
    referrerName: code.userName,
    referredId: newUserId,
    referredName: newUserName,
    referredEmail: newUserEmail,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  referrals.push(referral);
  return { success: true, referrerName: code.userName };
}

/**
 * Complete a referral (called when referred user completes first booking)
 */
export function completeReferral(referredId: string): Referral | null {
  const referral = referrals.find((r) => r.referredId === referredId && r.status === "pending");
  if (!referral) return null;

  referral.status = "completed";
  referral.completedAt = new Date().toISOString();

  // Check if referrer qualifies for a reward
  const completedCount = referrals.filter(
    (r) => r.referrerId === referral.referrerId && (r.status === "completed" || r.status === "rewarded")
  ).length;

  // Determine reward tier
  const reward = getRewardForCount(completedCount);
  if (reward) {
    referral.status = "rewarded";
    referral.reward = reward;
    referral.rewardedAt = new Date().toISOString();
  }

  return referral;
}

/**
 * Get referral stats for a user
 */
export function getReferralStats(userId: string): ReferralStats {
  const userReferrals = referrals.filter((r) => r.referrerId === userId);
  const completed = userReferrals.filter((r) => r.status === "completed" || r.status === "rewarded");
  const pending = userReferrals.filter((r) => r.status === "pending");
  const rewarded = userReferrals.filter((r) => r.status === "rewarded");

  const completedCount = completed.length;
  const nextMilestone = getNextMilestone(completedCount);

  return {
    totalReferrals: userReferrals.length,
    completedReferrals: completedCount,
    pendingReferrals: pending.length,
    totalRewards: rewarded.length,
    nextRewardAt: nextMilestone.count,
    nextReward: nextMilestone.reward,
  };
}

/**
 * Get all referrals for a user (as referrer)
 */
export function getUserReferrals(userId: string): Referral[] {
  return referrals.filter((r) => r.referrerId === userId);
}

/**
 * Get share URLs for different platforms
 */
export function getShareUrls(code: string, userName: string): {
  whatsapp: string;
  email: string;
  twitter: string;
  copy: string;
} {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://workersarena.com";
  const referralUrl = `${baseUrl}/auth/register?ref=${code}`;
  const message = `Join WorkersArena using my referral code ${code} and get started! ${referralUrl}`;

  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    email: `mailto:?subject=${encodeURIComponent("Join WorkersArena")}&body=${encodeURIComponent(message)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`,
    copy: referralUrl,
  };
}

/* ─── Reward Tiers ─── */
function getRewardForCount(count: number): ReferralReward | null {
  if (count === 1) {
    return {
      type: "credit",
      value: 10,
      description: "$10 account credit",
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (count === 3) {
    return {
      type: "discount",
      value: 20,
      description: "20% discount on next subscription",
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (count === 5) {
    return {
      type: "premium_days",
      value: 30,
      description: "30 days Premium free",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (count === 10) {
    return {
      type: "featured_listing",
      value: 30,
      description: "Featured listing for 30 days",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  return null;
}

function getNextMilestone(current: number): { count: number; reward: ReferralReward } {
  if (current < 1) return { count: 1, reward: getRewardForCount(1)! };
  if (current < 3) return { count: 3, reward: getRewardForCount(3)! };
  if (current < 5) return { count: 5, reward: getRewardForCount(5)! };
  if (current < 10) return { count: 10, reward: getRewardForCount(10)! };
  return { count: current + 5, reward: { type: "credit", value: 10, description: "$10 account credit" } };
}

/**
 * Reset the referral store (for testing)
 */
export function resetReferralStore(): void {
  codes.length = 0;
  referrals.length = 0;
}
