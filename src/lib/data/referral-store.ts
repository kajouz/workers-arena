/**
 * ────────────────────────────────────────────────────────────────────────────
 * REFERRAL STORE — persistence for the referral program
 * ────────────────────────────────────────────────────────────────────────────
 * Follows the app's two-adapter convention (src/lib/data/repo.ts):
 *   • real mode   (DEMO_MODE=false + DATABASE_URL) → Postgres through Prisma
 *   • demo mode   → in-memory store
 *
 * This module owns the mutable state for referrals: tracking who referred
 * whom, counting referrals, and recording credit grants.
 */

import { generateReferralCode, type ReferralStats, computeReferralStats } from "./referral";

/* ──────────────────────────────── Demo Store ──────────────────────────────── */

interface DemoReferralRow {
  id: string;
  referrerWorkerId: string;
  inviteeWorkerId: string;
  code: string;
  status: "pending" | "qualified" | "rewarded";
  qualifiedAt?: string;
  rewardedAt?: string;
  createdAt: string;
}

const demoReferrals: DemoReferralRow[] = [];
let demoNextId = 1;

function demoId() {
  return `ref-${demoNextId++}`;
}

/* ──────────────────────────────── Public API ──────────────────────────────── */

/**
 * Get or create a referral code for a worker. Idempotent.
 */
export async function getOrCreateReferralCode(workerId: string): Promise<string> {
  const isReal = process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);

  if (isReal) {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();

    // Check if worker already has a code
    const existing = await (prisma as any).worker.findUnique({
      where: { id: workerId },
      select: { referralCode: true },
    });
    if (existing?.referralCode) return existing.referralCode;

    // Generate a unique code
    let code = generateReferralCode();
    let attempts = 0;
    while (attempts < 10) {
      const taken = await (prisma as any).worker.findFirst({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!taken) break;
      code = generateReferralCode();
      attempts++;
    }

    await (prisma as any).worker.update({
      where: { id: workerId },
      data: { referralCode: code },
    });
    return code;
  }

  // Demo mode
  const existing = demoReferrals.find((r) => r.referrerWorkerId === workerId);
  if (existing) return existing.code;

  const code = generateReferralCode();
  // Store the code on the first referral row (or create a placeholder)
  demoReferrals.push({
    id: demoId(),
    referrerWorkerId: workerId,
    inviteeWorkerId: "",
    code,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return code;
}

/**
 * Look up which worker owns a referral code. Returns null if invalid.
 */
export async function findWorkerByReferralCode(code: string): Promise<{ workerId: string; workerName: string } | null> {
  const isReal = process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);

  if (isReal) {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();
    const worker = await (prisma as any).worker.findFirst({
      where: { referralCode: code.toUpperCase() },
      select: { id: true, nameEn: true },
    });
    if (!worker) return null;
    return { workerId: worker.id, workerName: worker.nameEn };
  }

  // Demo mode
  const row = demoReferrals.find((r) => r.code === code.toUpperCase());
  if (!row) return null;
  return { workerId: row.referrerWorkerId, workerName: "Worker" };
}

/**
 * Record a referral: worker B was referred by worker A.
 * Returns the referral ID. Idempotent (returns existing if already recorded).
 */
export async function recordReferral(input: {
  referrerWorkerId: string;
  inviteeWorkerId: string;
  code: string;
}): Promise<string> {
  const isReal = process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);

  if (isReal) {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();

    // Check if already recorded
    const existing = await (prisma as any).worker.findUnique({
      where: { id: input.inviteeWorkerId },
      select: { referredByWorkerId: true },
    });
    if (existing?.referredByWorkerId) return "existing";

    // Set the referral link
    await (prisma as any).worker.update({
      where: { id: input.inviteeWorkerId },
      data: { referredByWorkerId: input.referrerWorkerId },
    });

    // Increment the referrer's referral count (if using the Referral model on User)
    // For now, we track via the Worker.referredByWorkerId field
    return "new";
  }

  // Demo mode
  const existing = demoReferrals.find(
    (r) => r.inviteeWorkerId === input.inviteeWorkerId
  );
  if (existing) return existing.id;

  const id = demoId();
  demoReferrals.push({
    id,
    referrerWorkerId: input.referrerWorkerId,
    inviteeWorkerId: input.inviteeWorkerId,
    code: input.code,
    status: "qualified",
    qualifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Get referral stats for a worker.
 */
export async function getReferralStats(workerId: string): Promise<ReferralStats> {
  const isReal = process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);

  // First get or create the code
  const code = await getOrCreateReferralCode(workerId);

  if (isReal) {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();

    // Count referrals where this worker is the referrer
    const totalReferrals = await (prisma as any).worker.count({
      where: { referredByWorkerId: workerId },
    });

    // Count this month's referrals
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthlyReferrals = await (prisma as any).worker.count({
      where: {
        referredByWorkerId: workerId,
        createdAt: { gte: monthStart },
      },
    });

    // Count credits earned from referral grants
    const referralGrants = await (prisma as any).workerCreditEntry.findMany({
      where: {
        workerId,
        reason: { contains: "referral" },
        kind: "grant",
      },
    });
    const creditsEarned = referralGrants.reduce((sum: number, e: any) => sum + e.amount, 0);

    return computeReferralStats({
      code,
      successfulReferrals: totalReferrals,
      monthlyReferrals,
      lifetimeReferrals: totalReferrals,
      creditsEarned,
    });
  }

  // Demo mode
  const referrals = demoReferrals.filter((r) => r.referrerWorkerId === workerId && r.status !== "pending");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyReferrals = referrals.filter(
    (r) => new Date(r.createdAt) >= monthStart
  ).length;

  return computeReferralStats({
    code,
    successfulReferrals: referrals.length,
    monthlyReferrals,
    lifetimeReferrals: referrals.length,
    creditsEarned: referrals.length * 25, // demo: 25 per referral
  });
}

/**
 * Mark a referral as qualified (invitee completed a qualifying action).
 */
export async function qualifyReferral(inviteeWorkerId: string): Promise<boolean> {
  const isReal = process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);

  if (isReal) {
    // In real mode, qualification is tracked by the presence of referredByWorkerId
    // and the qualifying action (first booking, etc.) is checked at grant time
    return true;
  }

  // Demo mode
  const row = demoReferrals.find((r) => r.inviteeWorkerId === inviteeWorkerId);
  if (!row || row.status !== "pending") return false;
  row.status = "qualified";
  row.qualifiedAt = new Date().toISOString();
  return true;
}

/**
 * Get all referrals for a worker (for admin view).
 */
export async function getWorkerReferrals(workerId: string): Promise<Array<{
  id: string;
  inviteeName: string;
  status: string;
  createdAt: string;
}>> {
  const isReal = process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);

  if (isReal) {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();
    const workers = await (prisma as any).worker.findMany({
      where: { referredByWorkerId: workerId },
      select: { id: true, nameEn: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return workers.map((w: any) => ({
      id: w.id,
      inviteeName: w.nameEn,
      status: "qualified",
      createdAt: w.createdAt.toISOString(),
    }));
  }

  // Demo mode
  return demoReferrals
    .filter((r) => r.referrerWorkerId === workerId)
    .map((r) => ({
      id: r.id,
      inviteeName: "Invitee",
      status: r.status,
      createdAt: r.createdAt,
    }));
}
