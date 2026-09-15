/**
 * LEAD REBATE — Prisma adapter (real mode): `LeadRebate` rows.
 *
 * The row is written INSIDE the completion transaction that also credits the
 * earnings, and `bookingId` is unique, so a redelivered or concurrent
 * completion can never rebate the same job twice — the same discipline the
 * EARNING ledger row gets from its own unique index.
 */

import { getPrisma } from "@/lib/server/prisma";
import type { LeadRebate, PurchasedLead } from "./lead-rebate";
import type { LeadRebateLimit } from "./lead-market";

/** Structural row shape (fixtures need no generated client). */
export interface LeadRebateRow {
  id: string;
  bookingId: string;
  leadId: string;
  offerId: string;
  workerId: string;
  leadCostCredits: number;
  leadCostMinor: number;
  feeMinor: number;
  rebateMinor: number;
  effectiveFeeMinor: number;
  pctBps: number;
  maxMinor: number | null;
  limitedBy: string;
  ruleId: string;
  ruleVersion: number;
  currency: string;
  createdAt: Date;
}

export function toDomainLeadRebate(row: LeadRebateRow): LeadRebate {
  return {
    id: row.id,
    bookingId: row.bookingId,
    leadId: row.leadId,
    offerId: row.offerId,
    workerId: row.workerId,
    leadCostCredits: row.leadCostCredits,
    leadCostMinor: row.leadCostMinor,
    feeMinor: row.feeMinor,
    rebateMinor: row.rebateMinor,
    effectiveFeeMinor: row.effectiveFeeMinor,
    pctBps: row.pctBps,
    maxMinor: row.maxMinor,
    limitedBy: row.limitedBy as LeadRebateLimit,
    ruleId: row.ruleId,
    ruleVersion: row.ruleVersion,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The purchased offer a worker holds on a lead (rebate attribution). */
export async function prismaFindPurchasedLeadOffer(
  workerId: string,
  leadId: string
): Promise<PurchasedLead | null> {
  const row = await getPrisma().leadOffer.findFirst({
    where: { workerId, leadId, status: "purchased" },
    select: { id: true, leadId: true, priceCredits: true },
  });
  return row ? { offerId: row.id, leadId: row.leadId, priceCredits: row.priceCredits } : null;
}

/**
 * Append the rebate row. P2002 (a second attempt on the same booking) is
 * swallowed and the existing row returned: the rebate already happened, so
 * re-reporting it is correct and re-charging it is impossible.
 */
export async function prismaSaveLeadRebate(rebate: LeadRebate): Promise<LeadRebate> {
  const prisma = getPrisma();
  try {
    const row = await prisma.leadRebate.create({
      data: {
        bookingId: rebate.bookingId,
        leadId: rebate.leadId,
        offerId: rebate.offerId,
        workerId: rebate.workerId,
        leadCostCredits: rebate.leadCostCredits,
        leadCostMinor: rebate.leadCostMinor,
        feeMinor: rebate.feeMinor,
        rebateMinor: rebate.rebateMinor,
        effectiveFeeMinor: rebate.effectiveFeeMinor,
        pctBps: rebate.pctBps,
        maxMinor: rebate.maxMinor,
        limitedBy: rebate.limitedBy,
        ruleId: rebate.ruleId,
        ruleVersion: rebate.ruleVersion,
        currency: rebate.currency,
        createdAt: new Date(rebate.createdAt),
      },
    });
    return toDomainLeadRebate(row as LeadRebateRow);
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      const existing = await prisma.leadRebate.findUnique({ where: { bookingId: rebate.bookingId } });
      if (existing) return toDomainLeadRebate(existing as LeadRebateRow);
    }
    throw error;
  }
}

/** Recent rebates, newest first (admin audit list). */
export async function prismaListLeadRebates(limit = 50): Promise<LeadRebate[]> {
  const rows = await getPrisma().leadRebate.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.trunc(limit)),
  });
  return rows.map((r) => toDomainLeadRebate(r as LeadRebateRow));
}

/** One booking's rebate, when it had one. */
export async function prismaGetLeadRebateForBooking(bookingId: string): Promise<LeadRebate | null> {
  const row = await getPrisma().leadRebate.findUnique({ where: { bookingId } });
  return row ? toDomainLeadRebate(row as LeadRebateRow) : null;
}
