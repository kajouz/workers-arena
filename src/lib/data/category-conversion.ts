/**
 * ────────────────────────────────────────────────────────────────────────────
 * CATEGORY CONVERSION METRICS — the lead funnel, per trade (§2.1 discovery)
 * ────────────────────────────────────────────────────────────────────────────
 * The Phase-2 measurement companion to the surge report: for each category,
 * how do qualified leads convert down the funnel?
 *
 *   leads offered → purchased → job won (rebate attributed or self-reported)
 *
 * Inputs are plain rows the caller resolves (offers with their lead's
 * categorySlug, the completion-attributed rebates, and the workers'
 * self-reported job conversions) — the engine itself is pure and dual-adapter
 * agnostic. The admin lead-quality page renders the table.
 *
 * Same inputs → same outputs, every call. No clocks: `nowMs` is a parameter.
 */

import type { LeadGrade } from "./lead-market";

/** One offer, pre-joined with its lead's category. */
export interface CategoryOfferInput {
  offerId: string;
  leadId: string;
  categorySlug: string;
  grade: LeadGrade | string;
  status: string;
  priceCredits: number;
  offeredAt: string;
}

/** A completion-attributed rebate (a bought lead that became a paid job). */
export interface CategoryRebateInput {
  leadId: string;
  createdAt: string;
}

/** A worker's self-reported outcome for a purchased lead. */
export interface CategoryRatingInput {
  offerId: string;
  converted: boolean;
}

export interface CategoryConversionRow {
  categorySlug: string;
  /** Distinct leads offered in the cohort. */
  leads: number;
  offers: number;
  purchased: number;
  /** purchased ÷ offers, percent (rounded). */
  purchaseRate: number;
  /** Distinct leads with a won job (rebate attributed OR rating.converted). */
  jobsWon: number;
  /** jobsWon ÷ leads, percent (rounded). */
  jobRate: number;
  /** Credits charged for purchased offers. */
  grossCredits: number;
}

export interface CategoryConversionReport {
  /** The measured window in days (0 = all time). */
  windowDays: number;
  from: string;
  to: string;
  /** Window cohort, sorted by leads desc. */
  window: CategoryConversionRow[];
  /** All-time, sorted by leads desc. */
  allTime: CategoryConversionRow[];
}

/** Compute per-category funnel metrics. Pure. */
export function computeCategoryConversion(
  offers: CategoryOfferInput[],
  rebates: CategoryRebateInput[],
  ratings: CategoryRatingInput[],
  options: { windowDays?: number; nowMs?: number } = {}
): CategoryConversionReport {
  const windowDays = Math.max(0, Math.trunc(options.windowDays ?? 30));
  const nowMs = options.nowMs ?? Date.now();
  const fromMs = windowDays > 0 ? nowMs - windowDays * 86_400_000 : 0;

  const convertedOfferIds = new Set(ratings.filter((r) => r.converted).map((r) => r.offerId));
  const rebateLeadIds = new Set(rebates.map((r) => r.leadId));

  const build = (from: number): CategoryConversionRow[] => {
    const cohort = offers.filter((o) => {
      const t = Date.parse(o.offeredAt);
      return Number.isFinite(t) && t >= from && t < nowMs + 1;
    });
    const byCategory = new Map<string, CategoryConversionRow & { leadIds: Set<string>; wonLeadIds: Set<string> }>();
    for (const offer of cohort) {
      let row = byCategory.get(offer.categorySlug);
      if (!row) {
        row = {
          categorySlug: offer.categorySlug,
          leads: 0,
          offers: 0,
          purchased: 0,
          purchaseRate: 0,
          jobsWon: 0,
          jobRate: 0,
          grossCredits: 0,
          leadIds: new Set(),
          wonLeadIds: new Set(),
        };
        byCategory.set(offer.categorySlug, row);
      }
      row.offers += 1;
      row.leadIds.add(offer.leadId);
      if (offer.status === "purchased") {
        row.purchased += 1;
        row.grossCredits += Math.max(0, Math.trunc(offer.priceCredits));
        if (convertedOfferIds.has(offer.offerId) || rebateLeadIds.has(offer.leadId)) {
          row.wonLeadIds.add(offer.leadId);
        }
      }
    }
    return [...byCategory.values()]
      .map((row) => ({
        categorySlug: row.categorySlug,
        leads: row.leadIds.size,
        offers: row.offers,
        purchased: row.purchased,
        purchaseRate: pct(row.purchased, row.offers),
        jobsWon: row.wonLeadIds.size,
        jobRate: pct(row.wonLeadIds.size, row.leadIds.size),
        grossCredits: row.grossCredits,
      }))
      .sort((a, b) => b.leads - a.leads || b.purchased - a.purchased || a.categorySlug.localeCompare(b.categorySlug));
  };

  return {
    windowDays,
    from: new Date(fromMs).toISOString(),
    to: new Date(nowMs).toISOString(),
    window: build(fromMs),
    allTime: build(0),
  };
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
