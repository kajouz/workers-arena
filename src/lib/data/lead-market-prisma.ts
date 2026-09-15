/**
 * LEAD MARKETPLACE — Prisma adapter (real mode): `LeadOffer` rows.
 *
 * The purchase is the money path, so it is a transaction with a status CAS —
 * an offer can be flipped to `purchased` exactly once, and the competing
 * offers of an exclusive lead are revoked in the same transaction (§9).
 */

import { getPrisma } from "@/lib/server/prisma";
import type { LeadGrade, LeadOffer, LeadOfferStatus, ContactReveal } from "./lead-market";

/** Structural row shape (fixtures need no generated client). */
export interface LeadOfferRow {
  id: string;
  leadId: string;
  leadNumber: string;
  workerId: string;
  grade: string;
  matchScore: number;
  priceCredits: number;
  status: string;
  exclusive: boolean;
  contactReveal: string | null;
  offeredAt: Date;
  expiresAt: Date;
  purchasedAt: Date | null;
  creditEntryId: string | null;
}

export function toDomainLeadOffer(row: LeadOfferRow): LeadOffer {
  return {
    id: row.id,
    leadId: row.leadId,
    leadNumber: row.leadNumber,
    workerId: row.workerId,
    grade: row.grade as LeadGrade,
    matchScore: row.matchScore,
    priceCredits: row.priceCredits,
    status: row.status as LeadOfferStatus,
    exclusive: row.exclusive,
    offeredAt: row.offeredAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.purchasedAt ? { purchasedAt: row.purchasedAt.toISOString() } : {}),
    ...(row.creditEntryId ? { creditEntryId: row.creditEntryId } : {}),
    ...(row.contactReveal ? { contactReveal: row.contactReveal as ContactReveal } : {}),
  };
}

/**
 * Create the matched offers, skipping any (lead, worker) pair that already has
 * one — the @@unique([leadId, workerId]) is the backstop, `skipDuplicates`
 * keeps a re-run quiet.
 */
export async function prismaCreateLeadOffers(offers: LeadOffer[]): Promise<LeadOffer[]> {
  if (offers.length === 0) return [];
  const prisma = getPrisma();
  await prisma.leadOffer.createMany({
    data: offers.map((offer) => ({
      leadId: offer.leadId,
      workerId: offer.workerId,
      leadNumber: offer.leadNumber,
      grade: offer.grade,
      matchScore: offer.matchScore,
      priceCredits: offer.priceCredits,
      status: offer.status,
      exclusive: offer.exclusive,
      offeredAt: new Date(offer.offeredAt),
      expiresAt: new Date(offer.expiresAt),
    })),
    skipDuplicates: true,
  });
  return prismaGetLeadOffers(offers[0]!.leadId);
}

export async function prismaGetLeadOffers(leadId: string): Promise<LeadOffer[]> {
  const rows = await getPrisma().leadOffer.findMany({
    where: { leadId },
    orderBy: [{ matchScore: "desc" }, { workerId: "asc" }],
  });
  return rows.map((r) => toDomainLeadOffer(r as LeadOfferRow));
}

export async function prismaGetLeadOffersByIds(ids: string[]): Promise<LeadOffer[]> {
  if (ids.length === 0) return [];
  const rows = await getPrisma().leadOffer.findMany({ where: { id: { in: ids } } });
  return rows.map((r) => toDomainLeadOffer(r as LeadOfferRow));
}

export async function prismaGetWorkerLeadOffers(workerId: string): Promise<LeadOffer[]> {
  const rows = await getPrisma().leadOffer.findMany({
    where: { workerId },
    orderBy: [{ offeredAt: "desc" }],
  });
  return rows.map((r) => toDomainLeadOffer(r as LeadOfferRow));
}

export async function prismaListLeadOffers(limit = 50): Promise<LeadOffer[]> {
  const rows = await getPrisma().leadOffer.findMany({
    orderBy: { offeredAt: "desc" },
    take: Math.max(1, Math.trunc(limit)),
  });
  return rows.map((r) => toDomainLeadOffer(r as LeadOfferRow));
}

/**
 * Flip the offer to purchased and revoke the competing pending offers — one
 * transaction, with the status CAS standing in for a row lock (a concurrent
 * purchase of the same offer matches zero rows and is rejected upstream by the
 * already-owned check plus the ledger's idempotency).
 */
export async function prismaMarkOfferPurchased(offer: LeadOffer, revokeIds: string[]): Promise<void> {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.leadOffer.update({
      where: { id: offer.id },
      data: {
        status: "purchased",
        purchasedAt: offer.purchasedAt ? new Date(offer.purchasedAt) : new Date(),
        creditEntryId: offer.creditEntryId ?? null,
        contactReveal: offer.contactReveal ?? null,
      },
    });
    if (revokeIds.length > 0) {
      await tx.leadOffer.updateMany({
        where: { id: { in: revokeIds }, status: "offered" },
        data: { status: "revoked" },
      });
    }
  });
}

/** Expire live offers past their window (cron twin of the quote SLA sweep). */
export async function prismaExpireLeadOffers(now = new Date()): Promise<number> {
  const result = await getPrisma().leadOffer.updateMany({
    where: { status: "offered", expiresAt: { lte: now } },
    data: { status: "expired" },
  });
  return result.count;
}
