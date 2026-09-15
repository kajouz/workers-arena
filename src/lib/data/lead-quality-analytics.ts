/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD QUALITY ANALYTICS — pure engine (§12 analytics extension)
 * ────────────────────────────────────────────────────────────────────────────
 * Computes time-series aggregates from lead ratings so the admin dashboard
 * can show trends without re-deriving the data. Same inputs → same output,
 * every call.
 *
 * The granularity is weekly (ISO weeks) — fine enough to see trends, coarse
 * enough to avoid noisy daily spikes. The engine bins ratings by their
 * createdAt week, then computes per-grade aggregates for each week.
 */

import type { LeadGrade } from "./lead-market";
import {
  aggregateRatings,
  pricingMultiplierForGrade,
  matchingWeightAdjustment,
  DEFAULT_PRICING_ADJUSTMENT,
  type LeadRating,
  type GradeRatingStats,
  type PricingAdjustmentConfig,
} from "./lead-rating";

/* ─────────────────────────────────── Input ─────────────────────────────────── */

/** A single rating, narrowed to the fields the analytics engine needs. */
export type RatingInput = Pick<LeadRating, "grade" | "quality" | "converted" | "reachable" | "createdAt">;

/* ────────────────────────────────── Output ────────────────────────────────── */

/** One week's aggregate for one grade. */
export interface GradeWeekStats {
  grade: LeadGrade;
  /** ISO week key, e.g. "2026-W36". */
  weekKey: string;
  /** Week start (Monday) in ISO. */
  weekStart: string;
  count: number;
  avgQuality: number;
  conversionRate: number;
  reachabilityRate: number;
  /** The pricing multiplier this grade's quality would produce. */
  priceMultiplier: number;
  /** The matching weight adjustment this grade would produce. */
  matchingAdjustment: number;
  /** Quality distribution: count per star (1–5). */
  distribution: Record<number, number>;
}

/** One week's aggregate across all grades. */
export interface WeekAggregate {
  weekKey: string;
  weekStart: string;
  totalCount: number;
  overallAvgQuality: number;
  overallConversionRate: number;
  /** Per-grade stats for this week. */
  byGrade: Record<LeadGrade, GradeWeekStats>;
}

/** The full analytics summary. */
export interface LeadQualityAnalytics {
  /** Weekly aggregates, oldest first. */
  weeks: WeekAggregate[];
  /** Lifetime per-grade stats (all ratings). */
  lifetimeByGrade: Record<LeadGrade, GradeRatingStats>;
  /** Lifetime pricing multipliers. */
  lifetimeMultipliers: Record<LeadGrade, number>;
  /** Total ratings across all time. */
  totalRatings: number;
  /** Date range covered. */
  earliestRating: string | null;
  latestRating: string | null;
}

/* ────────────────────────────────── Helpers ────────────────────────────────── */

/**
 * The ISO week key (`YYYY-Www`) a date belongs to.
 * Week starts on Monday (ISO 8601).
 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Set to nearest Thursday (current date + 4 - current day number, making Sunday=7)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * The Monday (ISO week start) for a given date.
 */
export function isoWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday = 7
  d.setUTCDate(d.getUTCDate() - day + 1); // Monday
  return d.toISOString().slice(0, 10);
}

const GRADE_LIST: LeadGrade[] = ["bronze", "silver", "gold", "emergency"];

/* ─────────────────────────────────── Engine ─────────────────────────────────── */

/**
 * Compute lead quality analytics from a list of ratings. Pure.
 *
 * Ratings are binned by ISO week, then per-grade stats are computed for
 * each week. The lifetime stats use the same `aggregateRatings` function
 * as the admin panel, so the numbers always agree.
 */
export function computeLeadQualityAnalytics(
  ratings: RatingInput[],
  config: PricingAdjustmentConfig = DEFAULT_PRICING_ADJUSTMENT
): LeadQualityAnalytics {
  if (ratings.length === 0) {
    const emptyGrade = (grade: LeadGrade): GradeWeekStats => ({
      grade,
      weekKey: "",
      weekStart: "",
      count: 0,
      avgQuality: 0,
      conversionRate: 0,
      reachabilityRate: 0,
      priceMultiplier: 1.0,
      matchingAdjustment: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    });
    const emptyLifetime = aggregateRatings([]);
    return {
      weeks: [],
      lifetimeByGrade: emptyLifetime,
      lifetimeMultipliers: {
        bronze: 1.0, silver: 1.0, gold: 1.0, emergency: 1.0,
      },
      totalRatings: 0,
      earliestRating: null,
      latestRating: null,
    };
  }

  // Bin ratings by ISO week
  const weekBins = new Map<string, RatingInput[]>();
  for (const r of ratings) {
    const date = new Date(r.createdAt);
    if (!Number.isFinite(date.getTime())) continue;
    const key = isoWeekKey(date);
    const bin = weekBins.get(key);
    if (bin) bin.push(r);
    else weekBins.set(key, [r]);
  }

  // Sort weeks chronologically
  const sortedKeys = [...weekBins.keys()].sort();

  // Compute per-week, per-grade stats
  const weeks: WeekAggregate[] = sortedKeys.map((weekKey) => {
    const weekRatings = weekBins.get(weekKey)!;
    const firstDate = new Date(weekRatings[0].createdAt);
    const weekStart = isoWeekStart(firstDate);

    const byGrade = {} as Record<LeadGrade, GradeWeekStats>;
    let totalCount = 0;
    let totalQuality = 0;
    let totalConverted = 0;

    for (const grade of GRADE_LIST) {
      const gradeRatings = weekRatings.filter((r) => r.grade === grade);
      const count = gradeRatings.length;
      totalCount += count;

      if (count === 0) {
        byGrade[grade] = {
          grade,
          weekKey,
          weekStart,
          count: 0,
          avgQuality: 0,
          conversionRate: 0,
          reachabilityRate: 0,
          priceMultiplier: 1.0,
          matchingAdjustment: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        };
        continue;
      }

      const totalQ = gradeRatings.reduce((s, r) => s + r.quality, 0);
      const avgQuality = Math.round((totalQ / count) * 10) / 10;
      const converted = gradeRatings.filter((r) => r.converted).length;
      const reachableItems = gradeRatings.filter((r) => r.reachable !== null && r.reachable !== undefined);
      const reachable = reachableItems.filter((r) => r.reachable).length;

      totalQuality += totalQ;
      totalConverted += converted;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const r of gradeRatings) {
        distribution[r.quality] = (distribution[r.quality] ?? 0) + 1;
      }

      const stats: GradeRatingStats = {
        grade,
        count,
        avgQuality,
        conversionRate: Math.round((converted / count) * 100),
        reachabilityRate: reachableItems.length > 0 ? Math.round((reachable / reachableItems.length) * 100) : 0,
        distribution,
      };

      byGrade[grade] = {
        grade,
        weekKey,
        weekStart,
        count,
        avgQuality,
        conversionRate: stats.conversionRate,
        reachabilityRate: stats.reachabilityRate,
        priceMultiplier: pricingMultiplierForGrade(stats, config),
        matchingAdjustment: matchingWeightAdjustment(stats, config),
        distribution,
      };
    }

    return {
      weekKey,
      weekStart,
      totalCount,
      overallAvgQuality: totalCount > 0 ? Math.round((totalQuality / totalCount) * 10) / 10 : 0,
      overallConversionRate: totalCount > 0 ? Math.round((totalConverted / totalCount) * 100) : 0,
      byGrade,
    };
  });

  // Lifetime stats
  const lifetimeByGrade = aggregateRatings(
    ratings.map((r) => ({
      id: "",
      offerId: "",
      workerId: "",
      leadId: "",
      grade: r.grade,
      quality: r.quality,
      reason: null,
      reasonAr: null,
      converted: r.converted,
      reachable: r.reachable ?? null,
      createdAt: r.createdAt,
    }))
  );

  const lifetimeMultipliers: Record<LeadGrade, number> = {
    bronze: 1.0, silver: 1.0, gold: 1.0, emergency: 1.0,
  };
  for (const grade of GRADE_LIST) {
    lifetimeMultipliers[grade] = pricingMultiplierForGrade(lifetimeByGrade[grade], config);
  }

  const sortedDates = ratings
    .map((r) => new Date(r.createdAt).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  return {
    weeks,
    lifetimeByGrade,
    lifetimeMultipliers,
    totalRatings: ratings.length,
    earliestRating: sortedDates.length > 0 ? new Date(sortedDates[0]).toISOString() : null,
    latestRating: sortedDates.length > 0 ? new Date(sortedDates[sortedDates.length - 1]).toISOString() : null,
  };
}
