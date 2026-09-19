/**
 * ────────────────────────────────────────────────────────────────────────────
 * SUBSCRIPTION PLAN CATALOG — Lebanon-adjusted pricing with volume tiers,
 * category-adjusted base prices, trial support, and team plans
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Design principles (per the revenue analysis):
 *  1. Lower entry points ($15 not $29) — Lebanon median income ~$150–200
 *  2. Volume-based upgrade incentive — each tier includes lead quotas
 *  3. Category-adjusted pricing — low-value trades pay less
 *  4. Trial period — first month free to reduce conversion friction
 *  5. Team plan — per-worker pricing for companies with 3+ workers
 *  6. Annual discount — 3 months free (25%) not 2 months (17%)
 *
 * This module is PURE (no prisma, no fs, no zod). It mirrors the structure
 * of subscriptions.ts but replaces the hardcoded PLANS map with a richer
 * catalog. The SubscriptionPlan type in types.ts stays unchanged — these
 * catalog entries are a CONFIG layer, not a DB migration.
 */

import type { SubscriptionPlan, BillingPeriod } from "./types";

// ── Category tier classification ──────────────────────────────────────────
// Trades are grouped by average job value. The tier multiplier adjusts
// the base plan price proportionally.

export type CategoryTier = "low" | "mid" | "high";

/** Category slug → tier mapping. Unlisted categories default to "mid". */
export const CATEGORY_TIER_MAP: Record<string, CategoryTier> = {
  // Low-value (avg job $30–80)
  cleaning: "low",
  gardening: "low",
  "pest-control": "low",
  "glass-works": "low",

  // Mid-value (avg job $80–300)
  plumbing: "mid",
  electrical: "mid",
  carpentry: "mid",
  painting: "mid",
  masonry: "mid",
  welding: "mid",
  "aluminum-works": "mid",
  blacksmith: "mid",
  locksmith: "mid",
  movers: "mid",

  // High-value (avg job $300–1000+)
  "ac-technician": "high",
  "satellite-technician": "high",
  mechanic: "high",
  roofing: "high",
};

/** Multiplier applied to the base plan price per category tier. */
export const CATEGORY_TIER_MULTIPLIER: Record<CategoryTier, number> = {
  low: 0.5, // cleaning pays half
  mid: 1.0, // plumbing pays full price
  high: 1.5, // HVAC pays 1.5×
};

/** Resolve a category slug to its price multiplier (default 1.0). */
export function categoryPriceMultiplier(categorySlug?: string | null): number {
  if (!categorySlug) return 1.0;
  const tier = CATEGORY_TIER_MAP[categorySlug.trim().toLowerCase()] ?? "mid";
  return CATEGORY_TIER_MULTIPLIER[tier];
}

// ── Plan catalog ──────────────────────────────────────────────────────────

export interface PlanCatalogEntry {
  /** The SubscriptionPlan enum value — maps 1:1 to the existing type. */
  plan: SubscriptionPlan;
  /** Human-readable label (EN). */
  labelEn: string;
  /** Human-readable label (AR). */
  labelAr: string;
  /** Brand hue for the plan badge. */
  hue: number;
  /** Monthly price in USD (base — category multiplier applies on top). */
  monthlyPriceUsd: number;
  /** Lead credits included per month. 0 = no lead access. */
  includedLeads: number;
  /** Price per additional lead beyond the included quota (USD). */
  extraLeadPriceUsd: number;
  /** Whether this plan is fee-exempt (the "Business" perk). */
  feeExempt: boolean;
  /** Search boost factor (1.0 = no boost). */
  searchBoost: number;
  /** Whether a verification badge is included. */
  verificationIncluded: boolean;
  /** Whether 24/7 emergency listing is available. */
  emergencyAvailable: boolean;
  /** Whether the plan includes priority support. */
  prioritySupport: boolean;
  /** Whether free ad credits are included. */
  adCredits: number;
  /** Whether the plan supports team management. */
  teamManagement: boolean;
  /** Per-worker monthly price for team plans (0 = not a team plan). */
  teamPerWorkerPriceUsd: number;
  /** Minimum workers required for team pricing. */
  teamMinWorkers: number;
  /** Sort order in the pricing page. */
  sortOrder: number;
}

export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    plan: "basic",
    labelEn: "Starter",
    labelAr: "مبدأية",
    hue: 205,
    monthlyPriceUsd: 15,
    includedLeads: 3,
    extraLeadPriceUsd: 0.05,
    feeExempt: false,
    searchBoost: 1.0,
    verificationIncluded: false,
    emergencyAvailable: false,
    prioritySupport: false,
    adCredits: 0,
    teamManagement: false,
    teamPerWorkerPriceUsd: 0,
    teamMinWorkers: 0,
    sortOrder: 0,
  },
  {
    plan: "professional",
    labelEn: "Growth",
    labelAr: "نمو",
    hue: 150,
    monthlyPriceUsd: 39,
    includedLeads: 10,
    extraLeadPriceUsd: 0.04,
    feeExempt: false,
    searchBoost: 1.25,
    verificationIncluded: true,
    emergencyAvailable: false,
    prioritySupport: false,
    adCredits: 0,
    teamManagement: false,
    teamPerWorkerPriceUsd: 0,
    teamMinWorkers: 0,
    sortOrder: 1,
  },
  {
    plan: "premium",
    labelEn: "Pro",
    labelAr: "احترافي",
    hue: 30,
    monthlyPriceUsd: 99,
    includedLeads: 25,
    extraLeadPriceUsd: 0.03,
    feeExempt: false,
    searchBoost: 1.5,
    verificationIncluded: true,
    emergencyAvailable: true,
    prioritySupport: true,
    adCredits: 50,
    teamManagement: false,
    teamPerWorkerPriceUsd: 0,
    teamMinWorkers: 0,
    sortOrder: 2,
  },
  {
    plan: "enterprise",
    labelEn: "Business",
    labelAr: "أعمال",
    hue: 265,
    monthlyPriceUsd: 199,
    includedLeads: -1, // unlimited
    extraLeadPriceUsd: 0,
    // Business receives a reduced transaction fee, not a full exemption.
    // This preserves platform revenue while making the plan's economics easy
    // to explain: higher volume earns a lower take rate.
    feeExempt: false,
    searchBoost: 2.0,
    verificationIncluded: true,
    emergencyAvailable: true,
    prioritySupport: true,
    adCredits: 200,
    teamManagement: true,
    teamPerWorkerPriceUsd: 15,
    teamMinWorkers: 3,
    sortOrder: 3,
  },
] as const;

// ── Pricing helpers ───────────────────────────────────────────────────────

/**
 * Annual billing: pay for 9 months, get 12 (3 months free = 25% discount).
 * This is a significant upgrade from the previous 17% (10 paid months).
 */
export const ANNUAL_PAID_MONTHS = 9;
export const ANNUAL_TERM_MONTHS = 12;

/** Look up a plan's catalog entry (case-insensitive). */
export function getPlanCatalog(plan: SubscriptionPlan): PlanCatalogEntry {
  return PLAN_CATALOG.find((p) => p.plan === plan) ?? PLAN_CATALOG[0];
}

/** Effective monthly price for a worker, factoring in category tier. */
export function effectiveMonthlyPrice(
  plan: SubscriptionPlan,
  categorySlug?: string | null
): number {
  const base = getPlanCatalog(plan).monthlyPriceUsd;
  return Math.round(base * categoryPriceMultiplier(categorySlug) * 100) / 100;
}

/** Price for a billing period (USD). */
export function planPrice(
  plan: SubscriptionPlan,
  period: BillingPeriod = "monthly",
  categorySlug?: string | null
): number {
  const monthly = effectiveMonthlyPrice(plan, categorySlug);
  return period === "annual" ? monthly * ANNUAL_PAID_MONTHS : monthly;
}

/** How many months a period extends the subscription. */
export function periodMonths(period: BillingPeriod): number {
  return period === "annual" ? ANNUAL_TERM_MONTHS : 1;
}

/** Annual savings in USD for a plan + category. */
export function annualSavings(
  plan: SubscriptionPlan,
  categorySlug?: string | null
): number {
  const monthly = effectiveMonthlyPrice(plan, categorySlug);
  return Math.round(monthly * 3 * 100) / 100; // 3 months free
}

// ── Trial support ─────────────────────────────────────────────────────────

/** Default trial period for the entry plans. */
export const TRIAL_PERIOD_DAYS = 30;

/** Recommended Phase 1 trial policy: 30 days for Starter/Growth, 14 days for
 * Pro, and Business is assisted rather than automatically provisioned. */
export const TRIAL_DAYS_BY_PLAN: Record<SubscriptionPlan, number> = {
  basic: 30,
  professional: 30,
  premium: 14,
  enterprise: 0,
};

export function trialDaysForPlan(plan: SubscriptionPlan): number {
  return TRIAL_DAYS_BY_PLAN[plan] ?? TRIAL_PERIOD_DAYS;
}

/** Whether a new worker is eligible for a free trial. */
export function isTrialEligible(subscription?: { startedAt?: string } | null): boolean {
  if (!subscription) return true; // no subscription yet
  // Already had a trial (any plan) — not eligible again
  return false;
}

/** Trial-specific pricing — first month is $0. */
export function trialPrice(
  plan: SubscriptionPlan,
  categorySlug?: string | null
): number {
  return 0; // Free first month on any plan
}

// ── Team plan helpers ─────────────────────────────────────────────────────

/** Whether a plan supports team management. */
export function isTeamPlan(plan: SubscriptionPlan): boolean {
  return getPlanCatalog(plan).teamManagement;
}

/** Monthly cost for a team with N workers on the given plan. */
export function teamMonthlyCost(
  plan: SubscriptionPlan,
  workerCount: number,
  categorySlug?: string | null
): number {
  const catalog = getPlanCatalog(plan);
  if (!catalog.teamManagement) return effectiveMonthlyPrice(plan, categorySlug) * workerCount;

  // First (teamMinWorkers - 1) workers at full price, rest at per-worker rate
  const fullPriceWorkers = Math.min(workerCount, catalog.teamMinWorkers - 1);
  const perWorkerWorkers = Math.max(0, workerCount - fullPriceWorkers);
  const baseMonthly = effectiveMonthlyPrice(plan, categorySlug);

  return (
    fullPriceWorkers * baseMonthly +
    perWorkerWorkers * catalog.teamPerWorkerPriceUsd
  );
}

// ── Lead quota helpers ────────────────────────────────────────────────────

/** Whether the plan has unlimited leads. */
export function hasUnlimitedLeads(plan: SubscriptionPlan): boolean {
  return getPlanCatalog(plan).includedLeads === -1;
}

/** Included lead quota for a plan (-1 = unlimited). */
export function includedLeads(plan: SubscriptionPlan): number {
  return getPlanCatalog(plan).includedLeads;
}

/** Price for an additional lead (USD, 0 for unlimited plans). */
export function extraLeadPrice(plan: SubscriptionPlan): number {
  return getPlanCatalog(plan).extraLeadPriceUsd;
}

// ── Upgrade incentive calculator ──────────────────────────────────────────

/**
 * Calculate the effective take rate a worker pays per plan at a given job
 * volume. This is the "upgrade pays for itself" math shown on the pricing page.
 *
 * @param plan - the subscription plan
 * @param jobsPerMonth - average jobs per month
 * * @param avgJobValueUsd - average job value in USD
 * @param categorySlug - optional category for adjusted pricing
 * @returns effective monthly cost (subscription + platform fees) as a percentage
 */
export function effectiveTakeRate(
  plan: SubscriptionPlan,
  jobsPerMonth: number,
  avgJobValueUsd: number,
  categorySlug?: string | null
): number {
  const catalog = getPlanCatalog(plan);
  const subscriptionCost = effectiveMonthlyPrice(plan, categorySlug);

  // Default take rate tiers (from fee-rules.ts)
  const feeRateBps: Record<SubscriptionPlan, number> = {
    basic: 900,        // 9%
    professional: 700, // 7%
    premium: 500,      // 5%
    enterprise: 400,   // Business: reduced 4%, not exempt
  };

  const feeRate = (feeRateBps[plan] ?? 700) / 10_000;
  const monthlyGmv = jobsPerMonth * avgJobValueUsd;
  const monthlyFees = monthlyGmv * feeRate;
  const totalCost = subscriptionCost + monthlyFees;

  return monthlyGmv > 0 ? (totalCost / monthlyGmv) * 100 : 0;
}
