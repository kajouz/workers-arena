/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD RATING — Prisma adapter (§12): worker feedback persistence
 * ────────────────────────────────────────────────────────────────────────────
 * Production counterpart of the demo functions in lead-market-store.ts.
 * Uses the `LeadRating` model (prisma/schema.prisma) and the
 * `WorkerCreditEntry` table via Prisma.
 */

import { getPrisma } from "@/lib/server/prisma";
import { validateLeadRating, type LeadRating } from "./lead-rating";

/** Convert a Prisma LeadRating row to the domain type. */
function toDomainRating(row: {
  id: string;
  offerId: string;
  workerId: string;
  leadId: string;
  grade: string;
  quality: number;
  reason: string | null;
  reasonAr: string | null;
  converted: boolean;
  reachable: boolean | null;
  createdAt: Date;
}): LeadRating {
  return {
    id: row.id,
    offerId: row.offerId,
    workerId: row.workerId,
    leadId: row.leadId,
    grade: row.grade as LeadRating["grade"],
    quality: row.quality,
    reason: row.reason,
    reasonAr: row.reasonAr,
    converted: row.converted,
    reachable: row.reachable,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Submit a worker's rating for a purchased lead. */
export async function prismaSubmitLeadRating(input: {
  offerId: string;
  workerId: string;
  quality: number;
  reason?: string;
  reasonAr?: string;
  converted?: boolean;
  reachable?: boolean;
}): Promise<{ ok: true; rating: LeadRating } | { ok: false; error: string }> {
  const db = getPrisma();
  const offer = await db.leadOffer.findUnique({ where: { id: input.offerId } });
  const existingRating = await db.leadRating.findUnique({ where: { offerId: input.offerId } });

  const validation = validateLeadRating(offer, existingRating, input.quality, input.workerId);
  if (!validation.ok) return { ok: false, error: validation.error };

  const row = await db.leadRating.create({
    data: {
      offerId: input.offerId,
      workerId: input.workerId,
      leadId: offer!.leadId,
      grade: offer!.grade,
      quality: input.quality,
      reason: input.reason ?? null,
      reasonAr: input.reasonAr ?? null,
      converted: input.converted ?? false,
      reachable: input.reachable ?? null,
    },
  });

  return { ok: true, rating: toDomainRating(row) };
}

/** Get all ratings for a specific worker. */
export async function prismaGetWorkerLeadRatings(workerId: string): Promise<LeadRating[]> {
  const db = getPrisma();
  const rows = await db.leadRating.findMany({
    where: { workerId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainRating);
}

/** Get a rating for a specific offer (or null). */
export async function prismaGetOfferRating(offerId: string): Promise<LeadRating | null> {
  const db = getPrisma();
  const row = await db.leadRating.findUnique({ where: { offerId } });
  return row ? toDomainRating(row) : null;
}

/** Get all ratings in the system (admin). */
export async function prismaGetAllLeadRatings(): Promise<LeadRating[]> {
  const db = getPrisma();
  const rows = await db.leadRating.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDomainRating);
}
