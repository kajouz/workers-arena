/**
 * ────────────────────────────────────────────────────────────────────────────
 * WORKER ROI — what the marketplace cost a worker and what it returned
 * ────────────────────────────────────────────────────────────────────────────
 * The lead marketplace ([lead-marketplace.md]) sells matches and the §11 rebate
 * gives part of the fee back, but neither answers the question a professional
 * actually asks: **did this month's spend pay for itself?** This module answers
 * it from facts the platform already records — no new counters, nothing stored:
 *
 *   • leads bought and what they cost   → the purchased `LeadOffer` rows
 *   • quotes sent, jobs won, jobs done  → the booking EVENT TRAIL (the audit
 *                                          record already carries every date)
 *   • GMV, platform fees, rebates       → the booking's own stamped fields
 *   • subscription cost                 → the plan in force, per-month
 *
 * PURE AND CLIENT-SAFE: same inputs, same cents; the page, the tests and any
 * future admin/export surface all call this, so no surface can disagree about
 * what a month returned.
 *
 * ── Which month does a fact belong to? ──────────────────────────────────────
 * Every metric is attributed to the moment the MONEY or the EVENT happened, not
 * to when the row was created, because a job's request, quote, win and payout
 * can straddle months:
 *
 *   leads bought  → `LeadOffer.purchasedAt`
 *   quotes sent   → the booking event that carried the quote (the bid, or the
 *                   accept-with-quote — same instant the price was agreed)
 *   jobs won      → the first `pendingPayment`/`confirmed` event
 *   GMV + fees    → the `completed` event (when the worker actually got paid)
 *
 * The consequence is deliberate and worth stating: a lead bought in September
 * whose job completes in October shows up as *September spend, October revenue*.
 * That lag is the honest shape of this business, so the summary reports the
 * pipeline (won-but-not-completed) beside the realised numbers instead of
 * smoothing it away.
 *
 * Windows are UTC calendar months. A row whose date cannot be parsed is skipped
 * rather than guessed into a month.
 */

import type { LeadGrade, LeadOffer } from "./lead-market";
import type { Booking, BookingStatus, SubscriptionPlan } from "./types";

/* ───────────────────────────────── Month windows ───────────────────────────────── */

/** A UTC calendar month — the reporting window. */
export interface RoiMonth {
  /** `YYYY-MM`. */
  key: string;
  /** Inclusive lower bound (ISO). */
  startIso: string;
  /** Exclusive upper bound (ISO). */
  endIso: string;
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The UTC month key (`YYYY-MM`) a moment belongs to. */
export function roiMonthKeyOf(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Parse a `YYYY-MM` key into its UTC window, or null when the key is malformed.
 * Never throws: a hand-typed `?month=` in a URL must not 500 the page.
 */
export function roiMonthWindow(key: string): RoiMonth | null {
  const match = MONTH_KEY.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1970 || year > 9999) return null;
  const start = Date.UTC(year, month - 1, 1);
  const end = Date.UTC(year, month, 1);
  return { key, startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

/** Shift a month key by `delta` months (negative goes back), clamping the day. */
export function shiftRoiMonth(key: string, delta: number): string {
  const match = MONTH_KEY.exec(key);
  if (!match) return key;
  const total = Number(match[1]) * 12 + (Number(match[2]) - 1) + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12 + 12) % 12;
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * The last `count` month keys ending at `key` (inclusive), oldest first — the
 * trend series. `count` is clamped to something a page can render.
 */
export function recentRoiMonthKeys(key: string, count = 6): string[] {
  const n = Math.max(1, Math.min(Math.trunc(count), 24));
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(shiftRoiMonth(key, -i));
  return keys;
}

/* ─────────────────────────────── Event dates ─────────────────────────────── */

/**
 * The statuses that prove a quote was SENT. `quoted` is a multi-candidate bid;
 * `pendingPayment`/`confirmed` are an accept-with-quote or a chat quote — in
 * both the price was agreed at that instant, so that event's time IS the quote
 * date. Anything earlier (requested/quoting/selected) has no price yet.
 */
const QUOTE_STATUSES: BookingStatus[] = ["quoted", "pendingPayment", "confirmed", "inProgress", "completionPending", "completed"];
/** The statuses that prove the customer secured this worker at a price. */
const WON_STATUSES: BookingStatus[] = ["pendingPayment", "confirmed"];
/** The status that proves the money landed. */
const COMPLETED_STATUSES: BookingStatus[] = ["completed"];

/** The first event time whose status is in `statuses` (the trail is ordered). */
function firstEventAt(booking: Booking, statuses: BookingStatus[]): string | null {
  for (const event of booking.events ?? []) {
    if (statuses.includes(event.status)) return event.time;
  }
  return null;
}

/**
 * When the worker's quote went out, or null when this booking has no quote.
 *
 * A booking with a price but no matching event is a data anomaly (a row written
 * before its audit trail); it is attributed to the trail's first event so the
 * quote is still counted rather than silently dropped from the funnel.
 */
export function quoteSentAt(booking: Booking): string | null {
  if (booking.quote === undefined || booking.quote === null) return null;
  return firstEventAt(booking, QUOTE_STATUSES) ?? booking.events?.[0]?.time ?? null;
}

/** When the customer secured this worker at a price, or null if never won. */
export function jobWonAt(booking: Booking): string | null {
  return firstEventAt(booking, WON_STATUSES);
}

/** When the job completed (the payout moment), or null if it never did. */
export function jobCompletedAt(booking: Booking): string | null {
  return firstEventAt(booking, COMPLETED_STATUSES);
}

/* ─────────────────────────────────── Input ─────────────────────────────────── */

/** The subscription whose cost belongs to the month. */
export interface RoiSubscription {
  plan: SubscriptionPlan;
  /** What the plan costs per billing period, MINOR units. */
  priceMinor: number;
  /** 1 for monthly, 12 for annual — the divisor that gives a monthly cost. */
  periodMonths: number;
  startedAt: string;
  expiresAt: string;
}

export interface WorkerRoiInput {
  /** ALL of this worker's lead offers — the engine windows and attributes them. */
  offers: LeadOffer[];
  /** ALL of this worker's bookings, WITH their event trails. */
  bookings: Booking[];
  /** The plan in force (null when the worker has no subscription). */
  subscription?: RoiSubscription | null;
  /** The month to summarise. */
  month: RoiMonth;
  /** Reporting currency (the bookings' own); defaults to USD. */
  currency?: string;
}

/* ────────────────────────────────── Output ────────────────────────────────── */

export interface WorkerRoi {
  month: { key: string; startIso: string; endIso: string };
  currency: string;

  /* Demand — what was bought. */
  leadsBought: number;
  leadsBoughtByGrade: Record<LeadGrade, number>;
  leadSpendCredits: number;
  leadSpendMinor: number;

  /* Pipeline — what was worked. */
  quotesSent: number;
  quotesSentFromLeads: number;
  jobsWon: number;
  jobsWonFromLeads: number;
  /** GMV of jobs won in the window that had not completed by its end. */
  pipelineGmvMinor: number;

  /* Revenue — what was realised (completed inside the window). */
  jobsCompleted: number;
  gmvMinor: number;
  gmvFromLeadsMinor: number;
  /** Platform fees stamped on those jobs, before the §11 rebate. */
  feesMinor: number;
  /** §11 — what bought leads gave back on them. */
  rebatesMinor: number;
  /** feesMinor − rebatesMinor: what the platform actually kept. */
  effectiveFeesMinor: number;
  /** gmvMinor − effectiveFeesMinor: what the worker banks. */
  earningsMinor: number;

  /* Cost — what the month cost. */
  subscriptionCostMinor: number;
  /** Cash actually invoiced this month (a renewal/annual invoice lands in one). */
  subscriptionPaidMinor: number;
  /** leadSpendMinor + subscriptionCostMinor. */
  totalSpendMinor: number;

  /* Return — the answer. */
  /** gmvMinor ÷ totalSpendMinor, 2dp. Null when nothing was spent. */
  returnMultiple: number | null;
  /** earningsMinor ÷ totalSpendMinor, 2dp. Null when nothing was spent. */
  netMultiple: number | null;
  /** jobsWon ÷ quotesSent, whole percent. Null with no quotes. */
  winRatePct: number | null;
  /** jobsWonFromLeads ÷ leadsBought, whole percent. Null with no leads. */
  leadWinRatePct: number | null;
  /** gmvFromLeadsMinor ÷ leadsBought, minor units. Null with no leads. */
  gmvPerLeadMinor: number | null;
}

const GRADE_KEYS: LeadGrade[] = ["bronze", "silver", "gold", "emergency"];

const round2 = (value: number): number => Math.round(value * 100) / 100;
const pct = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Is `iso` inside the window? Unparsable dates are never inside. */
function inWindow(iso: string | null | undefined, month: RoiMonth): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return ms >= Date.parse(month.startIso) && ms < Date.parse(month.endIso);
}

/* ─────────────────────────────────── Engine ─────────────────────────────────── */

/**
 * Summarise one month. Pure: every number below is derived from the arguments,
 * so a page render and a test compute the same thing from the same facts.
 */
export function computeWorkerRoi(input: WorkerRoiInput): WorkerRoi {
  const { month } = input;
  const startMs = Date.parse(month.startIso);
  const endMs = Date.parse(month.endIso);

  /* A bought lead is the proof of marketplace work — for attribution, the whole
   * history counts, not just this month's purchases, because a lead bought in
   * August can produce a job in September (the lag the header describes). */
  const purchasedLeadIds = new Set<string>();
  for (const offer of input.offers) {
    if (offer.status === "purchased") purchasedLeadIds.add(offer.leadId);
  }

  /* ── Demand ── */
  const leadsBoughtByGrade: Record<LeadGrade, number> = { bronze: 0, silver: 0, gold: 0, emergency: 0 };
  let leadsBought = 0;
  let leadSpendCredits = 0;
  for (const offer of input.offers) {
    if (offer.status !== "purchased") continue;
    if (!inWindow(offer.purchasedAt, month)) continue;
    leadsBought += 1;
    leadsBoughtByGrade[offer.grade] = (leadsBoughtByGrade[offer.grade] ?? 0) + 1;
    leadSpendCredits += Math.max(0, Math.trunc(offer.priceCredits));
  }
  // 1 credit = $1 by convention (docs/lead-marketplace.md §6), in minor units.
  const leadSpendMinor = leadSpendCredits * 100;

  /* ── Pipeline and revenue, one pass over the bookings ── */
  let quotesSent = 0;
  let quotesSentFromLeads = 0;
  let jobsWon = 0;
  let jobsWonFromLeads = 0;
  let pipelineGmvMinor = 0;
  let jobsCompleted = 0;
  let gmvMinor = 0;
  let gmvFromLeadsMinor = 0;
  let feesMinor = 0;
  let rebatesMinor = 0;
  let currency = input.currency ?? "USD";

  for (const booking of input.bookings) {
    const fromLead = Boolean(booking.quoteRequestId && purchasedLeadIds.has(booking.quoteRequestId));
    const quoteValue = Math.max(0, Math.trunc(booking.quote ?? 0));
    const fee = Math.max(0, Math.trunc(booking.platformFee ?? 0));
    const rebate = Math.max(0, Math.trunc(booking.leadRebateMinor ?? 0));

    /* Quote sent — a price exists and the trail says when it went out. */
    if (inWindow(quoteSentAt(booking), month)) {
      quotesSent += 1;
      if (fromLead) quotesSentFromLeads += 1;
    }

    /* Won — the customer secured this worker at a price. */
    const wonAt = jobWonAt(booking);
    if (wonAt && inWindow(wonAt, month)) {
      jobsWon += 1;
      if (fromLead) jobsWonFromLeads += 1;
      const completedAt = jobCompletedAt(booking);
      const completedMs = completedAt ? Date.parse(completedAt) : NaN;
      // Won this month, not (yet) completed by the end of it → pipeline.
      if (!completedAt || !(Number.isFinite(completedMs) && completedMs < endMs)) {
        pipelineGmvMinor += quoteValue;
      }
    }

    /* Completed — the money month. GMV, fees and the rebate land together. */
    if (inWindow(jobCompletedAt(booking), month)) {
      jobsCompleted += 1;
      gmvMinor += quoteValue;
      feesMinor += fee;
      rebatesMinor += Math.min(rebate, fee); // bounded: a rebate never exceeds its fee
      if (fromLead) gmvFromLeadsMinor += quoteValue;
      if (booking.currency) currency = booking.currency;
    }
  }

  const effectiveFeesMinor = Math.max(0, feesMinor - rebatesMinor);
  const earningsMinor = gmvMinor - effectiveFeesMinor;

  /* ── Subscription cost ──
   * The month carries the plan's MONTHLY-EQUIVALENT cost (an annual plan is
   * divided across its 12 months) so one annual invoice never distorts a single
   * month's multiple; the cash actually invoiced in the window is reported
   * separately as `subscriptionPaidMinor`. A plan whose term does not overlap
   * the month costs nothing. */
  let subscriptionCostMinor = 0;
  let subscriptionPaidMinor = 0;
  const sub = input.subscription;
  if (sub) {
    const startedMs = Date.parse(sub.startedAt);
    const expiresMs = Date.parse(sub.expiresAt);
    const overlaps =
      Number.isFinite(startedMs) && Number.isFinite(expiresMs) && startedMs < endMs && expiresMs >= startMs;
    if (overlaps) {
      subscriptionCostMinor = Math.round(Math.max(0, sub.priceMinor) / Math.max(1, sub.periodMonths));
      if (startedMs >= startMs && startedMs < endMs) subscriptionPaidMinor = Math.max(0, sub.priceMinor);
    }
  }

  const totalSpendMinor = leadSpendMinor + subscriptionCostMinor;

  return {
    month: { key: month.key, startIso: month.startIso, endIso: month.endIso },
    currency,
    leadsBought,
    leadsBoughtByGrade,
    leadSpendCredits,
    leadSpendMinor,
    quotesSent,
    quotesSentFromLeads,
    jobsWon,
    jobsWonFromLeads,
    pipelineGmvMinor,
    jobsCompleted,
    gmvMinor,
    gmvFromLeadsMinor,
    feesMinor,
    rebatesMinor,
    effectiveFeesMinor,
    earningsMinor,
    subscriptionCostMinor,
    subscriptionPaidMinor,
    totalSpendMinor,
    returnMultiple: totalSpendMinor > 0 ? round2(gmvMinor / totalSpendMinor) : null,
    netMultiple: totalSpendMinor > 0 ? round2(earningsMinor / totalSpendMinor) : null,
    winRatePct: pct(jobsWon, quotesSent),
    leadWinRatePct: pct(jobsWonFromLeads, leadsBought),
    gmvPerLeadMinor: leadsBought > 0 ? Math.round(gmvFromLeadsMinor / leadsBought) : null,
  };
}

/** The same summary for several months, oldest first (the trend series). */
export function computeWorkerRoiSeries(
  input: Omit<WorkerRoiInput, "month">,
  months: RoiMonth[]
): WorkerRoi[] {
  return months.map((month) => computeWorkerRoi({ ...input, month }));
}

/**
 * A month with nothing at all — useful for a series point that predates the
 * data, so the trend renders a real zero instead of a gap.
 */
export function emptyWorkerRoi(month: RoiMonth, currency = "USD"): WorkerRoi {
  return computeWorkerRoi({ offers: [], bookings: [], month, currency });
}

/** Sum a set of months into one year-to-date style total (the series footer). */
export function totalWorkerRoi(rows: WorkerRoi[]): WorkerRoi {
  const first = rows[0];
  if (!first) throw new Error("totalWorkerRoi needs at least one month");
  const sum = (pick: (row: WorkerRoi) => number): number => rows.reduce((acc, row) => acc + pick(row), 0);
  const leadsBoughtByGrade = { ...first.leadsBoughtByGrade };
  for (const key of GRADE_KEYS) leadsBoughtByGrade[key] = sum((row) => row.leadsBoughtByGrade[key]);
  const feesMinor = sum((r) => r.feesMinor);
  const rebatesMinor = sum((r) => r.rebatesMinor);
  const effectiveFeesMinor = Math.max(0, feesMinor - rebatesMinor);
  const gmvMinor = sum((r) => r.gmvMinor);
  const earningsMinor = gmvMinor - effectiveFeesMinor;
  const totalSpendMinor = sum((r) => r.totalSpendMinor);
  const jobsWon = sum((r) => r.jobsWon);
  const quotesSent = sum((r) => r.quotesSent);
  const leadsBought = sum((r) => r.leadsBought);
  const jobsWonFromLeads = sum((r) => r.jobsWonFromLeads);
  const gmvFromLeadsMinor = sum((r) => r.gmvFromLeadsMinor);
  return {
    month: { key: `${first.month.key} → ${rows[rows.length - 1].month.key}`, startIso: first.month.startIso, endIso: rows[rows.length - 1].month.endIso },
    currency: first.currency,
    leadsBought,
    leadsBoughtByGrade,
    leadSpendCredits: sum((r) => r.leadSpendCredits),
    leadSpendMinor: sum((r) => r.leadSpendMinor),
    quotesSent,
    quotesSentFromLeads: sum((r) => r.quotesSentFromLeads),
    jobsWon,
    jobsWonFromLeads,
    pipelineGmvMinor: rows[rows.length - 1].pipelineGmvMinor,
    jobsCompleted: sum((r) => r.jobsCompleted),
    gmvMinor,
    gmvFromLeadsMinor,
    feesMinor,
    rebatesMinor,
    effectiveFeesMinor,
    earningsMinor,
    subscriptionCostMinor: sum((r) => r.subscriptionCostMinor),
    subscriptionPaidMinor: sum((r) => r.subscriptionPaidMinor),
    totalSpendMinor,
    returnMultiple: totalSpendMinor > 0 ? round2(gmvMinor / totalSpendMinor) : null,
    netMultiple: totalSpendMinor > 0 ? round2(earningsMinor / totalSpendMinor) : null,
    winRatePct: pct(jobsWon, quotesSent),
    leadWinRatePct: pct(jobsWonFromLeads, leadsBought),
    gmvPerLeadMinor: leadsBought > 0 ? Math.round(gmvFromLeadsMinor / leadsBought) : null,
  };
}
