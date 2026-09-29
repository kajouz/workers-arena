/**
 * ────────────────────────────────────────────────────────────────────────────
 * WORKERSARENA GUARANTEE — revenue plan Step 5 (more customers)
 * ────────────────────────────────────────────────────────────────────────────
 * The promise: a job booked AND paid through WorkersArena is covered. If the
 * work is faulty and the customer reports it within 7 days of completion, we
 * send the worker (or another one) back to fix it, or refund up to $100.
 *
 * It is the customer's reason to pay on the platform instead of in cash — so
 * it only covers money the platform actually holds:
 *   • the job must be completed;
 *   • it must be fully paid through WorkersArena (settlement state "funded",
 *     src/lib/data/booking-settlement.ts) — a cash job ("outside-platform"),
 *     an unpaid balance or a quote-less job is not covered;
 *   • the refund is capped at $100 and at what the platform collected.
 *
 * This file is the terms and the pure rules (safe for client components). The
 * claims live in one small table (`GuaranteeClaim`, one per booking — see
 * `guarantee.ts`), filed by the customer and resolved by an admin as redo /
 * refunded / rejected. Paying a refund out (OMT/Whish) stays a manual admin
 * step, like every other manual payment.
 */

import type { Settlement } from "./booking-settlement";

export const GUARANTEE_TERMS = {
  /** Most the platform refunds on one job, minor units ($100). */
  capMinor: 10_000,
  /** Days after completion the customer has to report a problem. */
  windowDays: 7,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type GuaranteeReason =
  | "covered"
  | "not-completed"
  | "not-paid-on-platform"
  | "window-closed";

export interface GuaranteeCover {
  covered: boolean;
  reason: GuaranteeReason;
  /** The most a refund can be: min(cap, collected). 0 when not covered. */
  coverMinor: number;
  /** When the reporting window closes (ISO), when the job is completed. */
  windowEndsAt: string | null;
}

/**
 * Is this job covered right now, and for how much? Pure.
 *
 * `completedAt` is when the job was completed (the COMPLETED event); a missing
 * or unreadable time means the window cannot be judged, so the job is not
 * covered (never assume coverage on data we could not read).
 */
export function guaranteeCover(input: {
  status: string;
  completedAt: string | null | undefined;
  settlement: Pick<Settlement, "state" | "collectedMinor">;
  nowMs: number;
}): GuaranteeCover {
  const completedMs = Date.parse(input.completedAt ?? "");
  const windowEndsMs = Number.isFinite(completedMs) ? completedMs + GUARANTEE_TERMS.windowDays * DAY_MS : NaN;
  const windowEndsAt = Number.isFinite(windowEndsMs) ? new Date(windowEndsMs).toISOString() : null;
  const none = (reason: GuaranteeReason): GuaranteeCover => ({ covered: false, reason, coverMinor: 0, windowEndsAt });

  if (input.status !== "completed" || !windowEndsAt) return none("not-completed");
  if (input.settlement.state !== "funded" && input.settlement.state !== "overpaid") {
    return none("not-paid-on-platform");
  }
  if (input.nowMs > windowEndsMs) return none("window-closed");
  return {
    covered: true,
    reason: "covered",
    coverMinor: Math.min(GUARANTEE_TERMS.capMinor, Math.max(0, Math.trunc(input.settlement.collectedMinor))),
    windowEndsAt,
  };
}

/** When the booking was completed: its latest COMPLETED event. */
export function completedAtOf(events: readonly { status: string; time: string }[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i]!.status === "completed") return events[i]!.time;
  return null;
}

/* ─────────────────────────────── Claims ─────────────────────────────── */

export type GuaranteeClaimStatus = "open" | "redo" | "refunded" | "rejected";
export type GuaranteeOutcome = Exclude<GuaranteeClaimStatus, "open">;

export interface GuaranteeClaim {
  id: string;
  bookingId: string;
  bookingNumber: string;
  workerId: string;
  customerName: string;
  description: string;
  coverMinor: number;
  currency: string;
  status: GuaranteeClaimStatus;
  refundMinor?: number;
  resolutionNote?: string;
  resolvedBy?: string;
  createdAt: string;
  resolvedAt?: string;
}

export const MAX_CLAIM_DESCRIPTION = 2000;

/** Check an admin's resolution. Pure. A refund must be within the cover. */
export function validateResolution(
  claim: Pick<GuaranteeClaim, "status" | "coverMinor">,
  outcome: GuaranteeOutcome,
  refundMinor?: number
): { ok: true; refundMinor?: number } | { ok: false; error: "already-resolved" | "invalid-refund" } {
  if (claim.status !== "open") return { ok: false, error: "already-resolved" };
  if (outcome !== "refunded") return { ok: true };
  const amount = Math.trunc(Number(refundMinor));
  if (!Number.isFinite(amount) || amount <= 0 || amount > claim.coverMinor) return { ok: false, error: "invalid-refund" };
  return { ok: true, refundMinor: amount };
}
