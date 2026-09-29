/**
 * ────────────────────────────────────────────────────────────────────────────
 * WEEKLY NUMBERS SHEET — the revenue plan's Step 1 scoreboard
 * ────────────────────────────────────────────────────────────────────────────
 * One row per week of the numbers the business is steered by: revenue by
 * stream, commission recorded vs actually collected, the share of jobs paid in
 * cash, how fast manual OMT/Whish payments are confirmed, renewals vs lapses,
 * and how many customer requests came in.
 *
 * PURE on purpose (no prisma, no clock): the repo seam hands in rows from
 * whichever adapter is live, and `nowMs` is injected, so the admin page, the
 * CSV export and the tests all bucket identically.
 *
 * Weeks start Monday 00:00 UTC. Every row is attributed to ONE date:
 *   • purchase revenue   → the day the admin confirmed it (paidAt), minus
 *                          refunds on the day they were refunded
 *   • commission         → the week the job was completed; "collected" is what
 *                          has been collected on those jobs SO FAR (a cohort
 *                          view — a cash job's claim settled later still lands
 *                          on the week the job finished)
 *   • confirmations      → the week the payment was confirmed
 *   • subscription events→ the week they were recorded
 *   • customer requests  → the week the request was made (a multi-candidate
 *                          quote request counts once, not once per invite)
 */

import type { Booking, ReconciliationPayment } from "./types";
import type { SettlementJob } from "./booking-settlement";
import type { SubscriptionLifecycleEvent } from "./subscription-lifecycle";

/** Manual-payment scopes that are platform revenue. Booking legs are the
 * customer's money held for the worker — only the commission on them counts. */
export const REVENUE_SCOPES = ["subscription", "credit", "verification", "featured", "emergency", "campaign"] as const;
export type RevenueScope = (typeof REVENUE_SCOPES)[number];

/** The plan's target: a manual payment is confirmed within 2 hours. */
export const CONFIRM_TARGET_MS = 2 * 60 * 60 * 1000;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface WeeklyNumbers {
  /** Monday of the week, YYYY-MM-DD (UTC). */
  weekStart: string;
  /** The current week — still running, so its numbers will grow. */
  partial: boolean;
  /** Confirmed purchase revenue by stream, net of refunds (minor units). */
  revenueMinor: Record<RevenueScope, number>;
  /** Commission stamped on jobs completed this week. */
  commissionRecordedMinor: number;
  /** Of that, what the platform has collected so far. */
  commissionCollectedMinor: number;
  /** Purchase revenue + collected commission. */
  totalRevenueMinor: number;
  jobsCompleted: number;
  /** Jobs settled in cash between the parties (the platform holds nothing). */
  jobsPaidOutside: number;
  paymentsConfirmed: number;
  confirmedWithinTarget: number;
  /** Median hours from payment created → admin confirmed; null with none. */
  medianConfirmHours: number | null;
  renewals: number;
  /** Expired + cancelled subscriptions. */
  lapses: number;
  trialsStarted: number;
  customerRequests: number;
}

export interface WeeklySheet {
  generatedAt: string;
  /** Newest week first. */
  weeks: WeeklyNumbers[];
  /** Workers whose plan (paid or trial) is active right now. */
  activePlans: number;
  /** Manual payments still waiting for an admin, and how many are past 2h. */
  pendingPayments: number;
  pendingOverTarget: number;
}

export interface WeeklyNumbersInput {
  payments: ReconciliationPayment[];
  jobs: Array<Pick<SettlementJob, "settlement" | "completedAt">>;
  subscriptionEvents: Array<Pick<SubscriptionLifecycleEvent, "type" | "createdAt">>;
  workers: Array<{ subscription: { status: string; expiresAt: string } }>;
  bookings: Array<Pick<Booking, "id" | "quoteRequestId" | "events">>;
}

/** Monday 00:00 UTC of the week containing `ms`. */
export function weekStartMs(ms: number): number {
  const d = new Date(ms);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return midnight - ((d.getUTCDay() + 6) % 7) * DAY_MS;
}

function emptyWeek(startMs: number, partial: boolean): WeeklyNumbers {
  return {
    weekStart: new Date(startMs).toISOString().slice(0, 10),
    partial,
    revenueMinor: { subscription: 0, credit: 0, verification: 0, featured: 0, emergency: 0, campaign: 0 },
    commissionRecordedMinor: 0,
    commissionCollectedMinor: 0,
    totalRevenueMinor: 0,
    jobsCompleted: 0,
    jobsPaidOutside: 0,
    paymentsConfirmed: 0,
    confirmedWithinTarget: 0,
    medianConfirmHours: null,
    renewals: 0,
    lapses: 0,
    trialsStarted: 0,
    customerRequests: 0,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const isRevenueScope = (scope: string): scope is RevenueScope => (REVENUE_SCOPES as readonly string[]).includes(scope);

/** Build the sheet for the last `weekCount` weeks (the current one included). */
export function weeklyNumbers(input: WeeklyNumbersInput, nowMs: number, weekCount = 8): WeeklySheet {
  const count = Math.min(Math.max(Math.trunc(weekCount) || 8, 1), 52);
  const currentStart = weekStartMs(nowMs);
  const oldestStart = currentStart - (count - 1) * WEEK_MS;
  const weeks = Array.from({ length: count }, (_, i) => emptyWeek(currentStart - i * WEEK_MS, i === 0));
  const confirmHours: number[][] = weeks.map(() => []);

  /** The row for an ISO date, or undefined outside the window. */
  const slot = (iso: string | undefined): number | undefined => {
    const ms = iso ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms) || ms < oldestStart || ms > nowMs) return undefined;
    return (currentStart - weekStartMs(ms)) / WEEK_MS;
  };

  for (const p of input.payments) {
    if (isRevenueScope(p.scope)) {
      const paid = slot(p.paidAt);
      if (paid !== undefined) weeks[paid]!.revenueMinor[p.scope] += p.amount;
      const refunded = slot(p.refundedAt);
      if (refunded !== undefined) weeks[refunded]!.revenueMinor[p.scope] -= p.amount;
    }
    // Every confirmed manual payment is admin workload, booking legs included.
    const confirmed = slot(p.paidAt);
    if (confirmed !== undefined) {
      const waitMs = Date.parse(p.paidAt!) - Date.parse(p.createdAt);
      if (Number.isFinite(waitMs)) {
        const week = weeks[confirmed]!;
        week.paymentsConfirmed += 1;
        if (waitMs <= CONFIRM_TARGET_MS) week.confirmedWithinTarget += 1;
        confirmHours[confirmed]!.push(Math.max(waitMs, 0) / 3_600_000);
      }
    }
  }

  for (const job of input.jobs) {
    const i = slot(job.completedAt);
    if (i === undefined) continue;
    const week = weeks[i]!;
    const s = job.settlement;
    week.jobsCompleted += 1;
    if (s.state === "outside-platform") week.jobsPaidOutside += 1;
    week.commissionRecordedMinor += s.feeMinor;
    week.commissionCollectedMinor += s.feeCollectedMinor + s.feeClaimCollectedMinor;
  }

  for (const event of input.subscriptionEvents) {
    const i = slot(event.createdAt);
    if (i === undefined) continue;
    if (event.type === "renewed") weeks[i]!.renewals += 1;
    else if (event.type === "expired" || event.type === "cancelled") weeks[i]!.lapses += 1;
    else if (event.type === "trial_started") weeks[i]!.trialsStarted += 1;
  }

  // One request per quote request (its invites share the id), else per booking,
  // dated by its earliest event.
  const requestStart = new Map<string, string>();
  for (const b of input.bookings) {
    const first = b.events[0]?.time;
    if (!first) continue;
    const key = b.quoteRequestId ? `qr:${b.quoteRequestId}` : `bk:${b.id}`;
    const seen = requestStart.get(key);
    if (!seen || first < seen) requestStart.set(key, first);
  }
  for (const time of requestStart.values()) {
    const i = slot(time);
    if (i !== undefined) weeks[i]!.customerRequests += 1;
  }

  weeks.forEach((week, i) => {
    week.medianConfirmHours = median(confirmHours[i]!);
    week.totalRevenueMinor =
      REVENUE_SCOPES.reduce((sum, scope) => sum + week.revenueMinor[scope], 0) + week.commissionCollectedMinor;
  });

  const pending = input.payments.filter((p) => p.status === "pending");
  return {
    generatedAt: new Date(nowMs).toISOString(),
    weeks,
    activePlans: input.workers.filter((w) => {
      const expires = Date.parse(w.subscription.expiresAt);
      return w.subscription.status !== "expired" && Number.isFinite(expires) && expires > nowMs;
    }).length,
    pendingPayments: pending.length,
    pendingOverTarget: pending.filter((p) => nowMs - Date.parse(p.createdAt) > CONFIRM_TARGET_MS).length,
  };
}

/** A share as a whole percent, or null when there is nothing to divide. */
export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** The sheet as CSV rows (header first, newest week first), money in dollars. */
export function weeklyNumbersCsvRows(sheet: WeeklySheet): Array<Array<string | number>> {
  const usd = (minor: number) => (minor / 100).toFixed(2);
  const share = (v: number | null) => (v === null ? "" : v);
  return [
    [
      "week_start", "partial", "total_revenue_usd",
      ...REVENUE_SCOPES.map((s) => `${s}_usd`),
      "commission_recorded_usd", "commission_collected_usd", "commission_collected_pct",
      "jobs_completed", "jobs_paid_cash", "cash_share_pct",
      "payments_confirmed", "confirmed_within_2h_pct", "median_confirm_hours",
      "renewals", "lapses", "renewal_rate_pct", "trials_started", "customer_requests",
    ],
    ...sheet.weeks.map((w) => [
      w.weekStart, w.partial ? "yes" : "no", usd(w.totalRevenueMinor),
      ...REVENUE_SCOPES.map((s) => usd(w.revenueMinor[s])),
      usd(w.commissionRecordedMinor), usd(w.commissionCollectedMinor),
      share(pct(w.commissionCollectedMinor, w.commissionRecordedMinor)),
      w.jobsCompleted, w.jobsPaidOutside, share(pct(w.jobsPaidOutside, w.jobsCompleted)),
      w.paymentsConfirmed, share(pct(w.confirmedWithinTarget, w.paymentsConfirmed)),
      w.medianConfirmHours === null ? "" : w.medianConfirmHours.toFixed(1),
      w.renewals, w.lapses, share(pct(w.renewals, w.renewals + w.lapses)),
      w.trialsStarted, w.customerRequests,
    ]),
  ];
}
