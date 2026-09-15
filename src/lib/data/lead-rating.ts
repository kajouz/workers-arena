/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD QUALITY RATING — worker feedback loop (docs/lead-marketplace.md §12)
 * ────────────────────────────────────────────────────────────────────────────
 * After a purchased lead converts (or doesn't), the worker rates it 1–5 stars.
 * The aggregate signal feeds back into:
 *
 *   1. Per-grade pricing adjustments — gold leads rated poorly get cheaper;
 *      bronze leads rated highly may get more expensive.
 *   2. Matching weight calibration — low-rated grades get less weight in
 *      candidate scoring, so the engine stops over-offering them.
 *   3. Grade threshold tuning — if silver leads consistently score 4+,
 *      the silver threshold may rise, promoting fewer marginal leads.
 *
 * PURE AND CLIENT-SAFE: same inputs, same output; the page, tests and any
 * future admin/export surface all call this, so no surface can disagree.
 */

import type { LeadGrade, LEAD_GRADES } from "./lead-market";

/* ─────────────────────────────────── Input ─────────────────────────────────── */

/** A single worker rating of a purchased lead. */
export interface LeadRating {
  id: string;
  offerId: string;
  workerId: string;
  leadId: string;
  grade: LeadGrade;
  /** 1–5 quality stars: 1 = bad lead (wrong area, fake, unresponsive), 5 = perfect. */
  quality: number;
  /** Free text reason (optional). */
  reason?: string | null;
  reasonAr?: string | null;
  /** Whether the lead converted to a booking. */
  converted: boolean;
  /** Whether the customer was reachable within 24h. */
  reachable?: boolean | null;
  createdAt: string;
}

/** The validation result of a rating attempt. */
export interface RatingValidation {
  ok: true;
  quality: number;
}

export interface RatingError {
  ok: false;
  error:
    | "not-purchased"
    | "already-rated"
    | "invalid-quality"
    | "invalid-worker"
    | "offer-not-found";
}

/**
 * Validate a lead rating attempt. Pure — only checks the business rules.
 * The caller (server action) resolves the offer; this only validates the
 * rating value and ensures the worker owns the offer.
 */
export function validateLeadRating(
  offer: { id: string; workerId: string; status: string } | null,
  existingRating: { offerId: string } | null,
  quality: number,
  workerId: string
): RatingValidation | RatingError {
  if (!offer) return { ok: false, error: "offer-not-found" };
  if (offer.status !== "purchased") return { ok: false, error: "not-purchased" };
  if (offer.workerId !== workerId) return { ok: false, error: "invalid-worker" };
  if (existingRating) return { ok: false, error: "already-rated" };
  if (!Number.isInteger(quality) || quality < 1 || quality > 5) {
    return { ok: false, error: "invalid-quality" };
  }
  return { ok: true, quality };
}

/* ──────────────────────────────── Aggregation ──────────────────────────────── */

/** Per-grade aggregate statistics. */
export interface GradeRatingStats {
  grade: LeadGrade;
  count: number;
  avgQuality: number;
  /** What fraction of rated leads converted to bookings. */
  conversionRate: number;
  /** What fraction of rated leads had reachable customers. */
  reachabilityRate: number;
  /** Quality breakdown: count per star (1–5). */
  distribution: Record<number, number>;
}

/** All four grades' stats, keyed by grade. */
export type GradeRatingSummary = Record<LeadGrade, GradeRatingStats>;

const GRADE_LIST: LeadGrade[] = ["bronze", "silver", "gold", "emergency"];

/**
 * Aggregate a list of ratings into per-grade stats. Pure.
 * The result drives both the admin panel and the pricing adjustment function.
 */
export function aggregateRatings(ratings: LeadRating[]): GradeRatingSummary {
  const buckets: Record<LeadGrade, LeadRating[]> = {
    bronze: [],
    silver: [],
    gold: [],
    emergency: [],
  };

  for (const r of ratings) {
    if (buckets[r.grade]) buckets[r.grade].push(r);
  }

  const summary: GradeRatingSummary = {} as GradeRatingSummary;
  for (const grade of GRADE_LIST) {
    const items = buckets[grade];
    const count = items.length;
    if (count === 0) {
      summary[grade] = {
        grade,
        count: 0,
        avgQuality: 0,
        conversionRate: 0,
        reachabilityRate: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
      continue;
    }
    const totalQuality = items.reduce((s, r) => s + r.quality, 0);
    const converted = items.filter((r) => r.converted).length;
    const reachableItems = items.filter((r) => r.reachable !== null && r.reachable !== undefined);
    const reachable = reachableItems.filter((r) => r.reachable).length;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of items) {
      distribution[r.quality] = (distribution[r.quality] ?? 0) + 1;
    }
    summary[grade] = {
      grade,
      count,
      avgQuality: Math.round((totalQuality / count) * 10) / 10,
      conversionRate: Math.round((converted / count) * 100),
      reachabilityRate: reachableItems.length > 0 ? Math.round((reachable / reachableItems.length) * 100) : 0,
      distribution,
    };
  }
  return summary;
}

/* ─────────────────────────── Pricing adjustment ────────────────────────────── */

/**
 * The admin-configurable pricing adjustment rules. Each grade has:
 *   - A quality threshold: grades whose avg quality is below this get cheaper.
 *   - A price multiplier: the factor applied to the base price.
 *   - A ceiling: the maximum multiplier (prevent runaway price increases).
 */
export interface PricingAdjustmentConfig {
  /** Avg quality below this → discount. Default: 3.0 */
  lowQualityThreshold: number;
  /** Avg quality above this → surcharge. Default: 4.0 */
  highQualityThreshold: number;
  /** Discount factor for low-quality grades (e.g. 0.8 = 20% off). */
  lowQualityMultiplier: number;
  /** Surcharge factor for high-quality grades (e.g. 1.2 = 20% more). */
  highQualityMultiplier: number;
  /** Hard cap on the multiplier (prevent runaway). */
  maxMultiplier: number;
  /** Minimum number of ratings before adjustments kick in. */
  minRatingsForAdjustment: number;
}

export const DEFAULT_PRICING_ADJUSTMENT: PricingAdjustmentConfig = {
  lowQualityThreshold: 3.0,
  highQualityThreshold: 4.0,
  lowQualityMultiplier: 0.8,
  highQualityMultiplier: 1.2,
  maxMultiplier: 2.0,
  minRatingsForAdjustment: 5,
};

/**
 * Compute the per-grade price multiplier from aggregated ratings. Pure.
 * Returns 1.0 (no adjustment) when there aren't enough ratings.
 */
export function pricingMultiplierForGrade(
  stats: GradeRatingStats,
  config: PricingAdjustmentConfig = DEFAULT_PRICING_ADJUSTMENT
): number {
  if (stats.count < config.minRatingsForAdjustment) return 1.0;
  if (stats.avgQuality < config.lowQualityThreshold) {
    return Math.min(config.lowQualityMultiplier, config.maxMultiplier);
  }
  if (stats.avgQuality > config.highQualityThreshold) {
    return Math.min(config.highQualityMultiplier, config.maxMultiplier);
  }
  return 1.0;
}

/**
 * Compute all four grades' multipliers in one call. Pure.
 * The admin panel and the pricing engine both call this.
 */
export function pricingMultipliers(
  summary: GradeRatingSummary,
  config: PricingAdjustmentConfig = DEFAULT_PRICING_ADJUSTMENT
): Record<LeadGrade, number> {
  const result: Record<LeadGrade, number> = {
    bronze: 1.0,
    silver: 1.0,
    gold: 1.0,
    emergency: 1.0,
  };
  for (const grade of GRADE_LIST) {
    result[grade] = pricingMultiplierForGrade(summary[grade], config);
  }
  return result;
}

/**
 * Apply pricing adjustments to a base credit price. Pure.
 * Returns the adjusted price (clamped to at least 1 credit).
 */
export function adjustedPrice(
  baseCredits: number,
  multiplier: number
): number {
  return Math.max(1, Math.round(baseCredits * multiplier));
}

/* ─────────────────────────── Matching weight adjustment ────────────────────── */

/**
 * Weight adjustment based on average quality. High-quality grades get a
 * boost; low-quality grades get a penalty. The adjustment is applied as
 * an additive factor to the matching weights (not multiplicative, so it
 * can't overpower the other signals).
 */
export function matchingWeightAdjustment(
  stats: GradeRatingStats,
  config: PricingAdjustmentConfig = DEFAULT_PRICING_ADJUSTMENT
): number {
  if (stats.count < config.minRatingsForAdjustment) return 0;
  // Scale: avg 5.0 → +5, avg 1.0 → -5, avg 3.0 → 0
  return Math.round((stats.avgQuality - 3.0) * 5);
}

/**
 * Compute all four grades' matching weight adjustments in one call.
 */
export function matchingWeightAdjustments(
  summary: GradeRatingSummary,
  config: PricingAdjustmentConfig = DEFAULT_PRICING_ADJUSTMENT
): Record<LeadGrade, number> {
  const result: Record<LeadGrade, number> = {
    bronze: 0,
    silver: 0,
    gold: 0,
    emergency: 0,
  };
  for (const grade of GRADE_LIST) {
    result[grade] = matchingWeightAdjustment(summary[grade], config);
  }
  return result;
}
