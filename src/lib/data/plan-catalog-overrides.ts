/**
 * ────────────────────────────────────────────────────────────────────────────
 * PLAN CATALOG OVERRIDES — the admin-editable layer over the shipped catalog
 * ────────────────────────────────────────────────────────────────────────────
 * The shipped `PLAN_CATALOG` (subscription-plans.ts) is the engineering
 * default. This module lets an ADMIN reprice the four plans without a deploy:
 * per-plan price, lead quota, extra-lead price, trial, and per-category-tier
 * multipliers all ride the versioned FeeRuleSet (the same carriage the lead
 * market and referral configs use), so a change is audited and versioned like
 * every other pricing decision on the platform.
 *
 * PURE on purpose: no prisma, no fs, no zod. The store clamps through
 * `normalizePlanCatalogOverrides` on every read AND write, so a hand-edited
 * jsonb row can never mint a $-1 plan or a 10 000-credit quota.
 */

import { CATEGORY_TIER_MAP, PLAN_CATALOG, getPlanCatalog, type PlanCatalogEntry } from "./subscription-plans";

/** A single plan's editable pricing knobs (all clamped on normalization). */
export interface PlanCatalogOverride {
  /** Monthly price in USD (0 allowed — a genuinely free tier). */
  monthlyPriceUsd?: number;
  /** Included lead credits per month (-1 = unlimited). */
  includedLeads?: number;
  /** Price per extra lead (USD). */
  extraLeadPriceUsd?: number;
  /** Search boost multiplier (1 = none). */
  searchBoost?: number;
}

/** Editable category-tier multipliers (what the pricing page chips apply). */
export type CategoryTierOverrides = Partial<Record<"low" | "mid" | "high", number>>;

/** The admin-editable catalog payload carried on a FeeRuleSet version. */
export interface PlanCatalogOverrides {
  /** Present keys override the shipped catalog; absent keys keep defaults. */
  plans?: Partial<Record<"basic" | "professional" | "premium" | "enterprise", PlanCatalogOverride>>;
  /** Legacy/global trial period in days (0 disables the trial entirely). */
  trialDays?: number;
  /** Per-plan trial policy. Missing keys fall back to the recommended defaults. */
  trialDaysByPlan?: Partial<Record<"basic" | "professional" | "premium" | "enterprise", number>>;
  /** Per-tier price multipliers (1 = no adjustment). */
  categoryTiers?: CategoryTierOverrides;
}

/** The shipped configuration, as a fully-resolved catalog (all keys present,
 * every knob concrete) — the fallback for anything the admin never touched. */
export const DEFAULT_PLAN_CATALOG_OVERRIDES: ResolvedPlanCatalog = {
  plans: Object.fromEntries(
    PLAN_CATALOG.map((entry) => [
      entry.plan,
      {
        monthlyPriceUsd: entry.monthlyPriceUsd,
        includedLeads: entry.includedLeads,
        extraLeadPriceUsd: entry.extraLeadPriceUsd,
        searchBoost: entry.searchBoost,
      },
    ])
  ) as ResolvedPlanCatalog["plans"],
  trialDays: 30,
  trialDaysByPlan: { basic: 30, professional: 30, premium: 14, enterprise: 0 },
  categoryTiers: { low: 0.5, mid: 1, high: 1.5 },
};

/** Clamp helpers — the store runs every payload through these. */
const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

/** A plan row after normalization — every knob concrete (no partials). */
export interface ResolvedPlanRow {
  monthlyPriceUsd: number;
  includedLeads: number;
  extraLeadPriceUsd: number;
  searchBoost: number;
}

/** What the normalizer always returns: a COMPLETE catalog, ready to render. */
export interface ResolvedPlanCatalog {
  plans: Record<"basic" | "professional" | "premium" | "enterprise", ResolvedPlanRow>;
  trialDays: number;
  trialDaysByPlan: Record<"basic" | "professional" | "premium" | "enterprise", number>;
  categoryTiers: { low: number; mid: number; high: number };
}

/**
 * Normalize an untrusted overrides payload (admin form, hand-edited jsonb):
 * drop non-finite/negative garbage, clamp prices to a sane band, coerce the
 * tier multipliers to 0–3×, and keep only the four known plan keys. Anything
 * absent falls back to the shipped defaults, so a partial override is usable.
 */
export function normalizePlanCatalogOverrides(input?: PlanCatalogOverrides | null): ResolvedPlanCatalog {
  const src = input ?? {};
  const plans: ResolvedPlanCatalog["plans"] = {} as ResolvedPlanCatalog["plans"];
  const shipped = DEFAULT_PLAN_CATALOG_OVERRIDES.plans;
  for (const key of Object.keys(shipped) as Array<keyof typeof shipped>) {
    const o = src.plans?.[key];
    const def = shipped[key];
    plans[key] = {
      monthlyPriceUsd: clampNum(o?.monthlyPriceUsd ?? def.monthlyPriceUsd, 0, 10_000, def.monthlyPriceUsd),
      includedLeads: Math.round(clampNum(o?.includedLeads ?? def.includedLeads, -1, 10_000, def.includedLeads)),
      extraLeadPriceUsd: clampNum(o?.extraLeadPriceUsd ?? def.extraLeadPriceUsd, 0, 1_000, def.extraLeadPriceUsd),
      searchBoost: clampNum(o?.searchBoost ?? def.searchBoost, 0.5, 5, def.searchBoost),
    };
  }
  return {
    plans,
    trialDays: Math.round(clampNum(src.trialDays ?? 30, 0, 90, 30)),
    trialDaysByPlan: {
      basic: Math.round(clampNum(src.trialDaysByPlan?.basic ?? 30, 0, 90, 30)),
      professional: Math.round(clampNum(src.trialDaysByPlan?.professional ?? 30, 0, 90, 30)),
      premium: Math.round(clampNum(src.trialDaysByPlan?.premium ?? 14, 0, 90, 14)),
      enterprise: Math.round(clampNum(src.trialDaysByPlan?.enterprise ?? 0, 0, 90, 0)),
    },
    categoryTiers: {
      low: clampNum(src.categoryTiers?.low ?? 0.5, 0, 3, 0.5),
      mid: clampNum(src.categoryTiers?.mid ?? 1, 0, 3, 1),
      high: clampNum(src.categoryTiers?.high ?? 1.5, 0, 3, 1.5),
    },
  };
}

/**
 * Resolve the EFFECTIVE catalog entry for a plan: shipped values overridden by
 * the admin layer. Every consumer (pricing page, renewal dialog, trial) goes
 * through this or the helpers below, so an admin edit is live platform-wide
 * on the next read — no redeploy.
 */
export function resolvePlanCatalogEntry(
  overrides: PlanCatalogOverrides,
  plan: "basic" | "professional" | "premium" | "enterprise"
): PlanCatalogEntry {
  const shipped = getPlanCatalog(plan);
  const o = overrides.plans?.[plan];
  return {
    ...shipped,
    monthlyPriceUsd: o?.monthlyPriceUsd ?? shipped.monthlyPriceUsd,
    includedLeads: o?.includedLeads ?? shipped.includedLeads,
    extraLeadPriceUsd: o?.extraLeadPriceUsd ?? shipped.extraLeadPriceUsd,
    searchBoost: o?.searchBoost ?? shipped.searchBoost,
  };
}

/** The effective monthly price of a plan under admin overrides + category tier. */
export function effectiveMonthlyPriceWithOverrides(
  overrides: PlanCatalogOverrides,
  plan: "basic" | "professional" | "premium" | "enterprise",
  categorySlug?: string | null
): number {
  const entry = resolvePlanCatalogEntry(overrides, plan);
  const tiers = overrides.categoryTiers!;
  const tier = categorySlug?.trim() ? (CATEGORY_TIER_MAP[categorySlug.trim().toLowerCase()] ?? "mid") : "mid";
  const multiplier = tiers[tier] ?? 1;
  return Math.round(entry.monthlyPriceUsd * multiplier * 100) / 100;
}
