/**
 * ────────────────────────────────────────────────────────────────────────────
 * WORKER EARNINGS STATEMENT — pure engine
 * ────────────────────────────────────────────────────────────────────────────
 * Computes a monthly earnings statement from the worker's bookings, ledger
 * entries, and lead rebates. Same inputs → same output, every call.
 *
 * The statement answers: "What did I earn this month, and where did the money
 * go?" It breaks down into:
 *   1. Completed jobs (GMV, fees, rebates per job)
 *   2. Aggregate totals (GMV, fees, rebates, net earnings)
 *   3. Payouts (withdrawals processed this month)
 *   4. Balance snapshot (start of month → end of month)
 */

import type { Booking, LedgerEntry } from "./types";
import type { LeadRebate } from "./lead-rebate";

/* ─────────────────────────────────── Input ─────────────────────────────────── */

export interface EarningsMonth {
  /** `YYYY-MM`. */
  key: string;
  startIso: string;
  endIso: string;
}

export interface EarningsStatementInput {
  /** ALL of this worker's bookings, WITH their event trails. */
  bookings: Booking[];
  /** ALL of this worker's lead rebates. */
  rebates: LeadRebate[];
  /** The month to summarise. */
  month: EarningsMonth;
  /** Worker's payout ledger entries (withdrawals). */
  payouts?: LedgerEntry[];
  /** Reporting currency. */
  currency?: string;
}

/* ────────────────────────────────── Output ────────────────────────────────── */

/** A single completed job in the statement. */
export interface CompletedJobLine {
  bookingId: string;
  bookingNumber: string;
  jobTitle: string;
  customerName: string;
  /** When the job completed (ISO). */
  completedAt: string;
  /** The job value (quote), minor units. */
  gmvMinor: number;
  /** Platform fee stamped on this job, minor units. */
  feeMinor: number;
  /** §11 lead rebate applied, minor units. */
  rebateMinor: number;
  /** feeMinor − rebateMinor. */
  effectiveFeeMinor: number;
  /** gmvMinor − effectiveFeeMinor. */
  netEarningsMinor: number;
  /** Whether this job came from a bought lead. */
  fromLead: boolean;
  currency: string;
}

/** The full monthly earnings statement. */
export interface EarningsStatement {
  month: EarningsMonth;
  currency: string;

  /* Job lines */
  completedJobs: CompletedJobLine[];
  completedCount: number;

  /* Aggregates */
  gmvMinor: number;
  feesMinor: number;
  rebatesMinor: number;
  effectiveFeesMinor: number;
  netEarningsMinor: number;

  /* From leads specifically */
  gmvFromLeadsMinor: number;
  feesFromLeadsMinor: number;
  rebatesFromLeadsMinor: number;

  /* Payouts */
  payoutsMinor: number;
  payoutsCount: number;
  /** Breakdown of individual payout lines. */
  payoutLines: PayoutLine[];

  /* Derived */
  /** Average earnings per completed job. */
  avgEarningsPerJobMinor: number;
  /** Effective fee rate (effective fees / GMV), in basis points. */
  effectiveFeeRateBps: number;
  /** Net balance = netEarnings − payouts. */
  netBalanceMinor: number;
}

/** A single payout (withdrawal) line in the statement. */
export interface PayoutLine {
  entryId: string;
  status: LedgerEntry["status"];
  amountMinor: number; // always positive for display
  reason: string;
  time: string;
}

/* ────────────────────────────────── Helpers ────────────────────────────────── */

/** Is `iso` inside the window? */
function inWindow(iso: string | null | undefined, month: EarningsMonth): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms >= Date.parse(month.startIso) && ms < Date.parse(month.endIso);
}

/** Find the first event whose status matches. */
function firstEventAt(
  booking: Booking,
  statuses: string[]
): string | null {
  for (const event of booking.events ?? []) {
    if (statuses.includes(event.status)) return event.time;
  }
  return null;
}

const COMPLETED_STATUSES = ["completed"];

/* ─────────────────────────────────── Engine ─────────────────────────────────── */

/**
 * Compute the monthly earnings statement. Pure.
 */
export function computeEarningsStatement(
  input: EarningsStatementInput
): EarningsStatement {
  const { month, bookings, rebates } = input;
  const currency = input.currency ?? "USD";

  // Build a lookup of rebates by bookingId
  const rebateByBooking = new Map<string, LeadRebate>();
  for (const r of rebates) {
    rebateByBooking.set(r.bookingId, r);
  }

  // Completed jobs in the window
  const completedJobs: CompletedJobLine[] = [];
  let gmvMinor = 0;
  let feesMinor = 0;
  let rebatesMinor = 0;
  let gmvFromLeadsMinor = 0;
  let feesFromLeadsMinor = 0;
  let rebatesFromLeadsMinor = 0;

  for (const booking of bookings) {
    const completedAt = firstEventAt(booking, COMPLETED_STATUSES);
    if (!inWindow(completedAt, month)) continue;

    const gmv = Math.max(0, Math.trunc(booking.quote ?? 0));
    const fee = Math.max(0, Math.trunc(booking.platformFee ?? 0));
    const rebate = Math.max(0, Math.trunc(booking.leadRebateMinor ?? 0));
    const effectiveFee = Math.max(0, fee - rebate);
    const net = gmv - effectiveFee;
    const fromLead = Boolean(booking.quoteRequestId);

    completedJobs.push({
      bookingId: booking.id,
      bookingNumber: booking.number,
      jobTitle: booking.jobTitle,
      customerName: booking.customerName,
      completedAt: completedAt!,
      gmvMinor: gmv,
      feeMinor: fee,
      rebateMinor: rebate,
      effectiveFeeMinor: effectiveFee,
      netEarningsMinor: net,
      fromLead,
      currency: booking.currency || currency,
    });

    gmvMinor += gmv;
    feesMinor += fee;
    rebatesMinor += rebate;

    if (fromLead) {
      gmvFromLeadsMinor += gmv;
      feesFromLeadsMinor += fee;
      rebatesFromLeadsMinor += rebate;
    }
  }

  // Sort by completedAt descending (most recent first)
  completedJobs.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  const effectiveFeesMinor = Math.max(0, feesMinor - rebatesMinor);
  const netEarningsMinor = gmvMinor - effectiveFeesMinor;

  // Payouts — ledger withdrawals (kind === "withdrawal") in this month
  const payoutLines: PayoutLine[] = [];
  let payoutsMinor = 0;
  for (const entry of input.payouts ?? []) {
    if (entry.kind !== "withdrawal") continue;
    if (!inWindow(entry.time, month)) continue;
    const abs = Math.abs(entry.amount);
    payoutLines.push({
      entryId: entry.id,
      status: entry.status,
      amountMinor: abs,
      reason: entry.reason ?? "",
      time: entry.time,
    });
    payoutsMinor += abs;
  }
  payoutLines.sort((a, b) => b.time.localeCompare(a.time));
  const payoutsCount = payoutLines.length;

  const completedCount = completedJobs.length;
  const avgEarningsPerJobMinor =
    completedCount > 0 ? Math.round(netEarningsMinor / completedCount) : 0;
  const effectiveFeeRateBps =
    gmvMinor > 0 ? Math.round((effectiveFeesMinor / gmvMinor) * 10_000) : 0;

  return {
    month,
    currency,
    completedJobs,
    completedCount,
    gmvMinor,
    feesMinor,
    rebatesMinor,
    effectiveFeesMinor,
    netEarningsMinor,
    gmvFromLeadsMinor,
    feesFromLeadsMinor,
    rebatesFromLeadsMinor,
    payoutsMinor,
    payoutsCount,
    payoutLines,
    avgEarningsPerJobMinor,
    effectiveFeeRateBps,
    netBalanceMinor: netEarningsMinor - payoutsMinor,
  };
}
