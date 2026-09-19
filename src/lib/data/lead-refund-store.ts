import { logAdminActivity, ACTION_CODES } from "./activity";
import { grantCredits } from "./credit-ledger";
import { getLeadOfferById } from "./lead-market-store";
import { approvedRefundCredits, validateRefundRequest, type LeadRefundReason, type LeadRefundRequest, type LeadRefundStatus } from "./lead-refunds";

function realEnabled(): boolean { return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL); }
function prisma() { return import("./lead-refund-prisma"); }
interface Store { seq: number; requests: LeadRefundRequest[]; }
const key = "__workersArenaLeadRefunds";
const root = globalThis as Record<string, unknown>;
const STORE: Store = (root[key] as Store | undefined) ?? (root[key] = { seq: 0, requests: [] });
export function resetLeadRefundStore(): void { STORE.seq = 0; STORE.requests = []; }

export async function requestLeadRefund(input: { offerId: string; workerId: string; reason: string; evidence?: string }): Promise<{ ok: true; request: LeadRefundRequest } | { ok: false; error: string }> {
  if (realEnabled()) {
    const result = await (await prisma()).prismaRequestLeadRefund(input);
    if (result.ok) {
      await logAdminActivity({ code: ACTION_CODES.LEAD_REFUND_REQUESTED, actionEn: `Worker ${input.workerId} requested ${result.request.requestedCredits} lead credits back (${result.request.reason})`, actionAr: `طلب العامل ${input.workerId} استرداد ${result.request.requestedCredits} رصيد (${result.request.reason})`, actor: input.workerId, type: "payment" });
    }
    return result;
  }
  const offer = getLeadOfferById(input.offerId);
  const existing = STORE.requests.find((r) => r.offerId === input.offerId) ?? null;
  const valid = validateRefundRequest(offer, existing, input);
  if (!valid.ok) return valid;
  const request: LeadRefundRequest = {
    id: `lref-${++STORE.seq}`,
    offerId: input.offerId,
    leadId: offer!.leadId,
    workerId: input.workerId,
    reason: valid.reason,
    requestedCredits: valid.requestedCredits,
    approvedCredits: 0,
    status: "pending",
    ...(input.evidence?.trim() ? { evidence: input.evidence.trim() } : {}),
    submittedAt: new Date().toISOString(),
  };
  STORE.requests.push(request);
  await logAdminActivity({ code: ACTION_CODES.LEAD_REFUND_REQUESTED, actionEn: `Worker ${input.workerId} requested ${request.requestedCredits} lead credits back (${request.reason})`, actionAr: `طلب العامل ${input.workerId} استرداد ${request.requestedCredits} رصيد (${request.reason})`, actor: input.workerId, type: "payment" });
  return { ok: true, request };
}

export async function decideLeadRefund(input: { requestId: string; approve: boolean; approvedCredits?: number; adminNote?: string; decidedBy: string }): Promise<LeadRefundRequest | null> {
  if (realEnabled()) {
    const result = await (await prisma()).prismaDecideLeadRefund(input);
    if (result) {
      await logAdminActivity({ code: input.approve ? ACTION_CODES.LEAD_REFUND_APPROVED : ACTION_CODES.LEAD_REFUND_REJECTED, actionEn: `${input.decidedBy} ${input.approve ? "approved" : "rejected"} lead refund ${result.id} (${result.approvedCredits} credits)`, actionAr: `${input.decidedBy} ${input.approve ? "وافق على" : "رفض"} استرداد العميل ${result.id} (${result.approvedCredits} رصيد)`, actor: input.decidedBy, type: "payment" });
    }
    return result;
  }
  const index = STORE.requests.findIndex((r) => r.id === input.requestId);
  if (index < 0 || STORE.requests[index]!.status !== "pending") return null;
  const current = STORE.requests[index]!;
  const amount = input.approve ? approvedRefundCredits(current, input.approvedCredits) : 0;
  const next: LeadRefundRequest = { ...current, status: input.approve ? "approved" : "rejected", approvedCredits: amount, ...(input.adminNote ? { adminNote: input.adminNote } : {}), decidedAt: new Date().toISOString(), decidedBy: input.decidedBy };
  if (amount > 0) await grantCredits({ workerId: current.workerId, amount, kind: "adjustment", reason: `Lead refund ${current.id}: ${current.reason}`, offerId: `refund:${current.id}`, createdBy: input.decidedBy });
  STORE.requests[index] = next;
  await logAdminActivity({ code: input.approve ? ACTION_CODES.LEAD_REFUND_APPROVED : ACTION_CODES.LEAD_REFUND_REJECTED, actionEn: `${input.decidedBy} ${input.approve ? "approved" : "rejected"} lead refund ${current.id} (${amount} credits)`, actionAr: `${input.decidedBy} ${input.approve ? "وافق على" : "رفض"} استرداد العميل ${current.id} (${amount} رصيد)`, actor: input.decidedBy, type: "payment" });
  return next;
}

export async function listLeadRefunds(status?: LeadRefundStatus): Promise<LeadRefundRequest[]> {
  if (realEnabled()) return (await prisma()).prismaListLeadRefunds(status);
  return [...STORE.requests].filter((r) => !status || r.status === status).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}
export async function getWorkerLeadRefunds(workerId: string): Promise<LeadRefundRequest[]> {
  if (realEnabled()) return (await prisma()).prismaListWorkerLeadRefunds(workerId);
  return (await listLeadRefunds()).filter((r) => r.workerId === workerId);
}
