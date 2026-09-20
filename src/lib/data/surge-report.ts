/**
 * ────────────────────────────────────────────────────────────────────────────
 * SURGE REPORT — the 30-day evaluation of the emergency 1.5× dispatch premium
 * ────────────────────────────────────────────────────────────────────────────
 * Phase 2 of the enhancement plan says: measure emergency conversion and
 * refund rates for 30 days before tuning the 1.5× emergency factor in
 * `computeSmartPricing` (src/lib/pricing/smart-pricing.ts). THIS module is
 * that measurement, as a pure engine:
 *
 *   • input   → plain offer/refund arrays (dual-adapter stores already read
 *               demo ⇄ Prisma, so no persistence of its own is needed);
 *   • output  → cohort stats per ISO week, headline rates, the premium's
 *               revenue split (base vs surge credits), and a deterministic
 *               verdict the admin UI translates bilingually.
 *
 * Same inputs → same output, every call. No clocks, no randomness: `nowMs`
 * is a parameter.
 */

import type { LeadOffer, LeadGrade } from "./lead-market";
import type { LeadRefundRequest } from "./lead-refunds";
import { isoWeekKey, isoWeekStart } from "./lead-quality-analytics";

/* ─────────────────────────── Verdict machinery ─────────────────────────── */

/**
 * The thresholds behind the verdict, exported so tests, the UI legend and
 * this engine can never disagree about what "healthy" means.
 *
 * Conversion here is offer-level: purchased offers ÷ emergency offers shown.
 * The refund rate is credit-weighted: approved refund credits ÷ purchased
 * credits — a $35 lead refunded counts ten times a $3.50 one.
 */
export const SURGE_VERDICT_THRESHOLDS = {
  /** Below this many emergency offers in the window, no verdict is honest. */
  minOffers: 20,
  /** Below this many purchases, conversion signals are noise. */
  minPurchases: 10,
  /** Conversion at or above this is healthy (workers buy the premium). */
  healthyConversionPct: 40,
  /** Conversion below this means the premium is suppressing demand. */
  overpricedConversionPct: 25,
  /** Approved refund credits at or below this share of purchased credits. */
  healthyRefundPct: 10,
  /** Approved refund credits above this share means a quality problem. */
  riskyRefundPct: 20,
} as const;

export type SurgeVerdictCode =
  | "insufficient-data"
  | "healthy"
  | "overpriced"
  | "quality-risk"
  | "watch";

/* ──────────────────────────────── Shapes ──────────────────────────────── */

/** One ISO week's emergency-lead cohort. */
export interface SurgeWeekBucket {
  /** ISO week key, e.g. "2026-W36". */
  weekKey: string;
  /** Monday of that week in ISO. */
  weekStart: string;
  offers: number;
  purchased: number;
  /** purchased ÷ offers, percent, rounded. */
  conversionPct: number;
  refundRequests: number;
  approvedRefundCredits: number;
  /** Average locked pricing multiplier across the week's offers (1 when none carry one). */
  avgMultiplier: number;
}

/** Headline cohort numbers for the window. */
export interface SurgeSummary {
  offers: number;
  purchased: number;
  conversionPct: number;
  /** Mean locked multiplier over all window offers (1 when none carry one). */
  avgMultiplier: number;
  /** Purchased credits had the multiplier been 1 — the counterfactual base. */
  baseCredits: number;
  /** The surge's gross take: purchased credits − baseCredits (≥ 0). */
  premiumCredits: number;
  /** Approved refunds re-attributed to the premium by each offer's premium share. */
  refundedPremiumCredits: number;
  /** premiumCredits − refundedPremiumCredits — what the surge actually netted. */
  netPremiumCredits: number;
  refundRequests: number;
  pendingRefunds: number;
  approvedRefunds: number;
  /** Approved refund credits ÷ purchased credits, percent, rounded. */
  approvedRefundRatePct: number;
}

/** Where the window's locked multipliers land (pricing audit). */
export interface SurgeMultiplierBuckets {
  exactly1: number;
  upTo1_3: number;
  upTo1_6: number;
  above1_6: number;
}

export interface SurgeReport {
  /** The evaluated window in days (as requested — never negative). */
  windowDays: number;
  /** Window start (inclusive), ISO. */
  from: string;
  /** Window end (exclusive = the `nowMs` instant), ISO. */
  to: string;
  summary: SurgeSummary;
  /** The gold-grade cohort over the same window — the natural benchmark. */
  goldBaseline: { offers: number; purchased: number; conversionPct: number };
  verdict: {
    code: SurgeVerdictCode;
    /** The facts the code was derived from, for the UI's tooltip/reason line. */
    conversionPct: number;
    approvedRefundRatePct: number;
    offers: number;
    purchases: number;
  };
  /** Weeks oldest-first, only weeks with at least one offer. */
  weeks: SurgeWeekBucket[];
  multipliers: SurgeMultiplierBuckets;
}

/* ──────────────────────────────── Engine ──────────────────────────────── */

/** An offer is in the cohort when offeredAt parses and sits in [from, to). */
function inWindow(offer: Pick<LeadOffer, "offeredAt">, fromMs: number, toMs: number): boolean {
  const t = Date.parse(offer.offeredAt);
  return Number.isFinite(t) && t >= fromMs && t < toMs;
}

/**
 * Credits the offer would have cost at multiplier 1. Rounded to whole
 * credits (the ledger is integer); the premium is the remainder, so
 * base + premium always equals the price actually charged.
 */
function baseCreditsOf(priceCredits: number, multiplier: number): number {
  const safePrice = Math.max(0, Math.trunc(priceCredits));
  if (!(multiplier > 0) || !Number.isFinite(multiplier) || multiplier === 1) return safePrice;
  return Math.round(safePrice / multiplier);
}

/**
 * Compute the surge report. Pure.
 *
 * Cohort rule: a lead belongs to the window in which it was OFFERED, and its
 * purchase/refund outcomes are attributed to that cohort wherever they land
 * in time — a lead offered on day 29 is counted even if it converts on day
 * 35. That is the honest way to measure "leads shown in the last 30 days".
 */
export function computeSurgeReport(
  offers: LeadOffer[],
  refunds: LeadRefundRequest[],
  options: { windowDays?: number; nowMs?: number } = {}
): SurgeReport {
  const windowDays = Math.max(1, Math.trunc(options.windowDays ?? 30));
  const nowMs = options.nowMs ?? Date.now();
  const fromMs = nowMs - windowDays * 86_400_000;

  const emergencyOffers = offers.filter(
    (o) => o.grade === "emergency" && inWindow(o, fromMs, nowMs)
  );
  const goldOffers = offers.filter(
    (o) => o.grade === "gold" && inWindow(o, fromMs, nowMs)
  );

  const summary = summarize(emergencyOffers, refunds);

  const goldPurchased = goldOffers.filter((o) => o.status === "purchased").length;
  const goldBaseline = {
    offers: goldOffers.length,
    purchased: goldPurchased,
    conversionPct: pct(goldPurchased, goldOffers.length),
  };

  // Weekly buckets over the emergency cohort.
  const bins = new Map<string, LeadOffer[]>();
  for (const offer of emergencyOffers) {
    const key = isoWeekKey(new Date(offer.offeredAt));
    const bin = bins.get(key);
    if (bin) bin.push(offer);
    else bins.set(key, [offer]);
  }
  const weeks: SurgeWeekBucket[] = [...bins.keys()]
    .sort()
    .map((weekKey) => {
      const weekOffers = bins.get(weekKey)!;
      const purchased = weekOffers.filter((o) => o.status === "purchased").length;
      const offerIds = new Set(weekOffers.map((o) => o.id));
      const weekRefunds = refunds.filter((r) => offerIds.has(r.offerId));
      const approved = weekRefunds
        .filter((r) => r.status === "approved")
        .reduce((s, r) => s + Math.max(0, Math.trunc(r.approvedCredits)), 0);
      const multipliers = weekOffers
        .map((o) => o.pricingMultiplier)
        .filter((m): m is number => typeof m === "number" && m > 0 && Number.isFinite(m));
      return {
        weekKey,
        weekStart: isoWeekStart(new Date(weekOffers[0]!.offeredAt)),
        offers: weekOffers.length,
        purchased,
        conversionPct: pct(purchased, weekOffers.length),
        refundRequests: weekRefunds.length,
        approvedRefundCredits: approved,
        avgMultiplier:
          multipliers.length > 0
            ? Math.round((multipliers.reduce((s, m) => s + m, 0) / multipliers.length) * 100) / 100
            : 1,
      };
    });

  const multipliers = bucketMultipliers(emergencyOffers);
  const verdict = decideVerdict(summary, SURGE_VERDICT_THRESHOLDS);

  return {
    windowDays,
    from: new Date(fromMs).toISOString(),
    to: new Date(nowMs).toISOString(),
    summary,
    goldBaseline,
    verdict,
    weeks,
    multipliers,
  };
}

/* ─────────────────────────────── Helpers ──────────────────────────────── */

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function summarize(offers: LeadOffer[], refunds: LeadRefundRequest[]): SurgeSummary {
  const purchased = offers.filter((o) => o.status === "purchased");
  const purchasedIds = new Set(purchased.map((o) => o.id));
  const cohortRefunds = refunds.filter((r) => purchasedIds.has(r.offerId));
  const approved = cohortRefunds.filter((r) => r.status === "approved");
  const pending = cohortRefunds.filter((r) => r.status === "pending").length;

  let baseCredits = 0;
  let premiumCredits = 0;
  let refundedPremiumCredits = 0;
  for (const offer of purchased) {
    const base = baseCreditsOf(offer.priceCredits, offer.pricingMultiplier ?? 1);
    baseCredits += base;
    premiumCredits += Math.max(0, offer.priceCredits - base);
  }
  // Re-attribute each approved refund to the surge by the offer's premium
  // share — a full refund of a 1.5× lead returns 1/3 premium, 2/3 base.
  const purchasedCredits = purchased.reduce((s, o) => s + Math.max(0, o.priceCredits), 0);
  for (const refund of approved) {
    const offer = purchased.find((o) => o.id === refund.offerId)!;
    const premium = Math.max(0, offer.priceCredits - baseCreditsOf(offer.priceCredits, offer.pricingMultiplier ?? 1));
    const share = offer.priceCredits > 0 ? premium / offer.priceCredits : 0;
    refundedPremiumCredits += Math.round(Math.max(0, Math.trunc(refund.approvedCredits)) * share);
  }

  const multipliers = offers
    .map((o) => o.pricingMultiplier)
    .filter((m): m is number => typeof m === "number" && m > 0 && Number.isFinite(m));

  const approvedRefundCredits = approved.reduce(
    (s, r) => s + Math.max(0, Math.trunc(r.approvedCredits)),
    0
  );

  return {
    offers: offers.length,
    purchased: purchased.length,
    conversionPct: pct(purchased.length, offers.length),
    avgMultiplier:
      multipliers.length > 0
        ? Math.round((multipliers.reduce((s, m) => s + m, 0) / multipliers.length) * 100) / 100
        : 1,
    baseCredits,
    premiumCredits,
    refundedPremiumCredits,
    netPremiumCredits: premiumCredits - refundedPremiumCredits,
    refundRequests: cohortRefunds.length,
    pendingRefunds: pending,
    approvedRefunds: approved.length,
    approvedRefundRatePct: pct(approvedRefundCredits, purchasedCredits),
  };
}

function bucketMultipliers(offers: LeadOffer[]): SurgeMultiplierBuckets {
  const buckets: SurgeMultiplierBuckets = { exactly1: 0, upTo1_3: 0, upTo1_6: 0, above1_6: 0 };
  for (const offer of offers) {
    const m = offer.pricingMultiplier;
    if (typeof m !== "number" || !(m > 0) || !Number.isFinite(m) || m === 1) {
      buckets.exactly1 += 1;
    } else if (m <= 1.3) {
      buckets.upTo1_3 += 1;
    } else if (m <= 1.6) {
      buckets.upTo1_6 += 1;
    } else {
      buckets.above1_6 += 1;
    }
  }
  return buckets;
}

/**
 * Deterministic verdict, in precedence order:
 *   1. too little data  → "insufficient-data"
 *   2. refunds high     → "quality-risk" (a price change cannot fix quality)
 *   3. conversion low   → "overpriced" (the premium is suppressing demand)
 *   4. both rates fine  → "healthy"
 *   5. everything else  → "watch"
 */
export function decideVerdict(
  summary: SurgeSummary,
  thresholds: typeof SURGE_VERDICT_THRESHOLDS
): SurgeReport["verdict"] {
  const facts = {
    conversionPct: summary.conversionPct,
    approvedRefundRatePct: summary.approvedRefundRatePct,
    offers: summary.offers,
    purchases: summary.purchased,
  };
  if (summary.offers < thresholds.minOffers || summary.purchased < thresholds.minPurchases) {
    return { code: "insufficient-data", ...facts };
  }
  if (summary.approvedRefundRatePct > thresholds.riskyRefundPct) {
    return { code: "quality-risk", ...facts };
  }
  if (summary.conversionPct < thresholds.overpricedConversionPct) {
    return { code: "overpriced", ...facts };
  }
  if (
    summary.conversionPct >= thresholds.healthyConversionPct &&
    summary.approvedRefundRatePct <= thresholds.healthyRefundPct
  ) {
    return { code: "healthy", ...facts };
  }
  return { code: "watch", ...facts };
}

/** The grade label the UI uses for the baseline row (kept for tests/UI parity). */
export const SURGE_BASELINE_GRADE: LeadGrade = "gold";
