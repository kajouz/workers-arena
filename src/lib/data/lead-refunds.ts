/** Phase 1 lead-quality protection: append-only refund requests for purchased leads. */

export const LEAD_REFUND_REASONS = [
  "invalid-contact",
  "duplicate-lead",
  "wrong-category",
  "wrong-area",
  "not-requested",
  "unreachable",
] as const;
export type LeadRefundReason = (typeof LEAD_REFUND_REASONS)[number];
export type LeadRefundStatus = "pending" | "approved" | "rejected";

export interface LeadRefundRequest {
  id: string;
  offerId: string;
  leadId: string;
  workerId: string;
  reason: LeadRefundReason;
  requestedCredits: number;
  approvedCredits: number;
  status: LeadRefundStatus;
  evidence?: string;
  adminNote?: string;
  submittedAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface LeadRefundError { ok: false; error: "invalid" | "not-purchased" | "already-requested" | "not-found" | "unauthorized"; }
export interface LeadRefundSuccess { ok: true; request: LeadRefundRequest; }

/** Only purchased offers can enter review, and a request is one-shot per offer. */
export function validateRefundRequest(
  offer: { id: string; leadId: string; workerId: string; status: string; priceCredits: number } | null,
  existing: LeadRefundRequest | null,
  input: { workerId: string; reason: string; evidence?: string }
): { ok: true; reason: LeadRefundReason; requestedCredits: number } | LeadRefundError {
  if (!offer) return { ok: false, error: "not-found" };
  if (offer.status !== "purchased") return { ok: false, error: "not-purchased" };
  if (offer.workerId !== input.workerId) return { ok: false, error: "unauthorized" };
  if (existing) return { ok: false, error: "already-requested" };
  if (!(LEAD_REFUND_REASONS as readonly string[]).includes(input.reason)) return { ok: false, error: "invalid" };
  const evidence = (input.evidence ?? "").trim();
  if (evidence.length > 1000) return { ok: false, error: "invalid" };
  return { ok: true, reason: input.reason as LeadRefundReason, requestedCredits: Math.max(1, Math.trunc(offer.priceCredits)) };
}

/** Admin decisions may be partial, never negative, and never exceed the request. */
export function approvedRefundCredits(request: Pick<LeadRefundRequest, "requestedCredits">, amount?: number): number {
  const requested = Math.max(0, Math.trunc(request.requestedCredits));
  return Math.min(requested, Math.max(0, Math.trunc(amount ?? requested)));
}
