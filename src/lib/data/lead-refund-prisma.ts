import { getPrisma } from "@/lib/server/prisma";
import { grantCredits } from "./credit-ledger";
import { approvedRefundCredits, validateRefundRequest, type LeadRefundRequest, type LeadRefundStatus } from "./lead-refunds";

function toDomain(row: { id: string; offerId: string; leadId: string; workerId: string; reason: string; requestedCredits: number; approvedCredits: number; status: string; evidence: string | null; adminNote: string | null; submittedAt: Date; decidedAt: Date | null; decidedBy: string | null }): LeadRefundRequest {
  return { id: row.id, offerId: row.offerId, leadId: row.leadId, workerId: row.workerId, reason: row.reason as LeadRefundRequest["reason"], requestedCredits: row.requestedCredits, approvedCredits: row.approvedCredits, status: row.status as LeadRefundStatus, ...(row.evidence ? { evidence: row.evidence } : {}), ...(row.adminNote ? { adminNote: row.adminNote } : {}), submittedAt: row.submittedAt.toISOString(), ...(row.decidedAt ? { decidedAt: row.decidedAt.toISOString() } : {}), ...(row.decidedBy ? { decidedBy: row.decidedBy } : {}) };
}

export async function prismaRequestLeadRefund(input: { offerId: string; workerId: string; reason: string; evidence?: string }): Promise<{ ok: true; request: LeadRefundRequest } | { ok: false; error: string }> {
  const db = getPrisma();
  const offer = await db.leadOffer.findUnique({ where: { id: input.offerId } });
  const existing = await db.leadRefundRequest.findUnique({ where: { offerId: input.offerId } });
  const valid = validateRefundRequest(offer, existing ? toDomain(existing) : null, input);
  if (!valid.ok) return valid;
  try {
    const row = await db.leadRefundRequest.create({ data: { offerId: input.offerId, leadId: offer!.leadId, workerId: input.workerId, reason: valid.reason, requestedCredits: valid.requestedCredits, approvedCredits: 0, status: "pending", evidence: input.evidence?.trim() || null } });
    return { ok: true, request: toDomain(row) };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: "already-requested" };
    throw error;
  }
}

export async function prismaDecideLeadRefund(input: { requestId: string; approve: boolean; approvedCredits?: number; adminNote?: string; decidedBy: string }): Promise<LeadRefundRequest | null> {
  const db = getPrisma();
  const current = await db.leadRefundRequest.findUnique({ where: { id: input.requestId } });
  if (!current || current.status !== "pending") return null;
  const amount = input.approve ? approvedRefundCredits(current, input.approvedCredits) : 0;
  // Write the append-only credit adjustment before closing the request. If the
  // ledger write fails, the request remains pending and an admin can retry;
  // the offer's unique refund reference makes a retry idempotent.
  if (amount > 0) {
    await grantCredits({ workerId: current.workerId, amount, kind: "adjustment", reason: `Lead refund ${current.id}: ${current.reason}`, offerId: `refund:${current.id}`, createdBy: input.decidedBy });
  }
  const updated = await db.leadRefundRequest.updateMany({ where: { id: current.id, status: "pending" }, data: { status: input.approve ? "approved" : "rejected", approvedCredits: amount, adminNote: input.adminNote ?? null, decidedAt: new Date(), decidedBy: input.decidedBy } });
  if (updated.count !== 1) return null;
  const row = await db.leadRefundRequest.findUnique({ where: { id: current.id } });
  return row ? toDomain(row) : null;
}

export async function prismaListLeadRefunds(status?: LeadRefundStatus): Promise<LeadRefundRequest[]> {
  const rows = await getPrisma().leadRefundRequest.findMany({ where: status ? { status } : undefined, orderBy: { submittedAt: "desc" } });
  return rows.map(toDomain);
}
export async function prismaListWorkerLeadRefunds(workerId: string): Promise<LeadRefundRequest[]> {
  const rows = await getPrisma().leadRefundRequest.findMany({ where: { workerId }, orderBy: { submittedAt: "desc" } });
  return rows.map(toDomain);
}
