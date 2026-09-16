/**
 * ────────────────────────────────────────────────────────────────────────────
 * PLATFORM FEE ENGINE — versioned, admin-configurable take-rate rules
 * (monetization plan §5 configurable fee system + §6 immutable snapshot)
 * ────────────────────────────────────────────────────────────────────────────
 * The M5 take rate (docs/booking-take-rate.md) was one global constant:
 * 700 bps, min $5, max $300, Enterprise exempt. That constant still works
 * (it IS the default rule set), but every fee is now resolved through a
 * VERSIONED rule set an admin can edit, so the platform can price:
 *
 *   • per plan tier   (free 12% … business 3–5%)
 *   • per category    (category-specific take rates)
 *   • emergency jobs  (urgent 24/7 work)
 *   • promotions      (windowed campaigns, optional code + scope)
 *   • flat / min / max / fixed components
 *
 * Two invariants make this auditable, and both are enforced here:
 *
 *  1. DETERMINISM — the fee is a pure function of (rule set, subtotal,
 *     context). No clock, no randomness: `at` is passed in, so the
 *     RespondDialog preview and the stored snapshot can never drift.
 *  2. IMMUTABILITY — a quote-accept stores a PlatformFeeSnapshot carrying the
 *     RULE VERSION that produced it. Later price changes never rewrite
 *     history, and any snapshot can be re-derived from its rule set.
 *
 * Pure + client-safe on purpose (no prisma, no fs, no zod): the worker's
 * RespondDialog imports it to preview exactly what the server will store.
 */

import type { CurrencyCode } from "@/lib/utils";
import type { LeadMarketConfig } from "./lead-market";
import type { PlanCatalogOverrides } from "./plan-catalog-overrides";

/** The monetization plan's five tiers. This is a CONFIG layer over the
 * existing `SubscriptionPlan` enum (basic/professional/premium/enterprise) —
 * no DB enum migration (see the plan decision: config layer, reversible). */
export type FeePlanTier = "free" | "starter" | "professional" | "growth" | "business";

export const FEE_PLAN_TIERS: readonly FeePlanTier[] = [
  "free",
  "starter",
  "professional",
  "growth",
  "business",
] as const;

/**
 * Subscription plan → monetization tier. `basic` is the entry paid plan
 * (→ starter), `premium` sits between professional and business (→ growth).
 * A worker with no subscription is the FREE tier: that is the acquisition
 * tier the plan asks for, and it prices through this map too.
 */
export const PLAN_TIER_BY_PLAN: Readonly<Record<string, FeePlanTier>> = {
  basic: "starter",
  professional: "professional",
  premium: "growth",
  enterprise: "business",
};

/** The tier for a subscription plan (case-insensitive; unknown/absent → free). */
export function planTierFor(plan?: string | null): FeePlanTier {
  if (!plan) return "free";
  return PLAN_TIER_BY_PLAN[plan.trim().toLowerCase()] ?? "free";
}

/** A single fee rule. Rates are basis points (1% = 100 bps); money is MINOR
 * units of `FeeRuleSet.currency` — never floats. */
export interface FeeRule {
  /** Take rate in basis points (700 = 7.0%). */
  rateBps: number;
  /** Floor applied to the percentage component (minor units). */
  minMinor: number;
  /** Cap applied to the percentage component; null = uncapped. */
  maxMinor: number | null;
  /** Flat amount added AFTER the clamp (minor units). */
  fixedMinor: number;
  /** Waive the fee entirely (the Business tier perk — configurable, not
   * hard-coded to "enterprise is free"). */
  exempt: boolean;
}

/** A partial rule — how overrides are written (any field may be omitted). */
export type FeeRuleOverride = Partial<FeeRule>;

/**
 * A windowed promotional fee rule (§24 promotional engine's take-rate lever):
 * a reduced rate that applies while the window is open and its scope matches.
 */
export interface FeePromotion {
  id: string;
  label: string;
  rateBps: number;
  minMinor?: number;
  maxMinor?: number | null;
  fixedMinor?: number;
  exempt?: boolean;
  /** ISO window; either side may be omitted (open-ended). */
  startsAt?: string;
  endsAt?: string;
  /** Scope — plan tier, category slug, and/or a promo code. All set fields
   * must match (AND), so a promotion can be as broad or narrow as needed. */
  planTier?: FeePlanTier;
  categorySlug?: string;
  promoCode?: string;
  /** Paused campaigns stay configured but stop applying (default: enabled). */
  enabled?: boolean;
  /** Platform credits granted to a worker who buys (or renews) a plan inside
   * this campaign's window — the "+50 credits" signup booster. Granted once
   * per worker per promotion, recorded in the credit ledger. Irrelevant for a
   * category-scoped campaign (see `promotionBonusFor`). */
  bonusCredits?: number;
}

/**
 * A versioned, admin-editable rule set. Every save writes a NEW version and
 * deactivates the previous one (append-only history — the configuration twin
 * of the snapshot's immutability).
 */
export interface FeeRuleSet {
  id: string;
  /** Monotonic rule version. Stamped into every snapshot produced under it. */
  version: number;
  currency: CurrencyCode;
  label?: string;
  /** The baseline every override starts from. */
  defaults: FeeRule;
  /** Per-tier overrides (the §5 ladder). */
  planTiers: Partial<Record<FeePlanTier, FeeRuleOverride>>;
  /** Category-slug → override (contextual pricing). */
  categories: Record<string, FeeRuleOverride>;
  /** Urgent / 24-7 jobs (the §12 emergency lever). */
  emergency?: FeeRuleOverride;
  /** Windowed promotional rules. */
  promotions: FeePromotion[];
  /** §7–§10 lead-market policy (grade prices in credits, matching weights,
   * offers per lead, exclusivity, contact-reveal policy). Typed structurally to
   * keep this module free of a runtime dependency on the lead engine — the
   * store normalizes it with `normalizeLeadMarketConfig` on every read/write. */
  leadMarket?: LeadMarketConfig;
  /** Admin-editable subscription plan pricing (§5 plans) — overrides over the
   * shipped `PLAN_CATALOG`. Typed structurally for the same reason as
   * `leadMarket`; the store normalizes it on every read/write. */
  planCatalog?: PlanCatalogOverrides;
  updatedAt: string;
  updatedBy?: string;
}

/** Everything the resolver needs to price a job. All optional — a bare quote
 * prices at the default rule. */
export interface FeeContext {
  /** Subscription plan (a `SubscriptionPlan` value, any case). */
  plan?: string | null;
  /** Explicit tier override — wins over `plan` (used when the caller already
   * resolved the tier, e.g. a quote-request bid container). */
  planTier?: FeePlanTier;
  /** Service category slug. */
  categorySlug?: string;
  /** Urgent 24/7 job. */
  emergency?: boolean;
  /** Promotion code presented by the worker/customer. */
  promoCode?: string;
  /** Evaluation timestamp (ISO). Defaults to now — pass it for determinism. */
  at?: string;
}

/** Which layers actually shaped a resolved rule (audit + UI explanation). */
export type FeeRuleSource =
  | "plan-exempt"
  | "promotion"
  | "emergency"
  | "category"
  | "plan-tier"
  | "default";

/** The rule in force for one job, plus the provenance needed to explain it. */
export interface ResolvedFeeRule {
  rule: FeeRule;
  /** The plan tier the fee was priced at. */
  tier: FeePlanTier;
  /** The rule set version id this came from (stamped into the snapshot). */
  ruleId: string;
  ruleVersion: number;
  /** The promotion that applied, when one did. */
  promotionId?: string;
  /** Applied layers, most specific first — the "why am I paying this?" line. */
  sources: FeeRuleSource[];
}

/** The outcome of pricing a percentage rule — every component kept so the UI
 * can say whether the floor or the cap bit. */
export interface FeeComputation {
  /** The charge, minor units. */
  feeMinor: number;
  /** The pure percentage component before clamping (minor units). */
  percentMinor: number;
  /** The clamped percentage component that the charge was built from. */
  clampedMinor: number;
  rateBps: number;
  fixedMinor: number;
  minApplied: boolean;
  maxApplied: boolean;
  exempt: boolean;
}

/**
 * §6 — the immutable record stamped once at accept-with-quote. Carries every
 * input of the calculation (rule version, rate, floor/cap, plan, currency,
 * timestamp) so the fee is reproducible and auditable years later, even after
 * the admin has re-priced the platform. Never updated, never recomputed.
 */
export interface PlatformFeeSnapshot {
  id: string;
  /** The job the fee belongs to (a booking id; a quote-request id for a bid). */
  jobId: string;
  /** The quote/bid record the amount came from (booking or booking-message id). */
  quoteId: string;
  workerId: string;
  customerId?: string;
  /** The worker's subscription plan at stamp time. */
  plan?: string;
  planTier: FeePlanTier;
  /** Rule-set version that produced the fee. */
  ruleId: string;
  ruleVersion: number;
  rateBps: number;
  minMinor: number;
  maxMinor: number | null;
  fixedMinor: number;
  /** The quote total the fee was taken from (minor units). */
  subtotalMinor: number;
  /** The platform's cut (minor units). */
  feeMinor: number;
  /** subtotalMajor − fee: what the worker receives (minor units). */
  netMinor: number;
  minApplied: boolean;
  maxApplied: boolean;
  exempt: boolean;
  sources: FeeRuleSource[];
  promotionId?: string;
  currency: CurrencyCode;
  /** ISO — when the fee was calculated (stamp time). */
  computedAt: string;
}

/**
 * THE DEFAULT RULE SET — reproduces the shipped M5 take rate exactly
 * (7.0%, min $5, max $300, Business/Enterprise exempt), so enabling the
 * engine changes no existing fee. `FEE_LADDER_PRESET` is the §5 ladder an
 * admin can apply in one click, and the opposite: adopting it is a pricing
 * decision, not a code change.
 */
export const DEFAULT_FEE_RULE_SET: FeeRuleSet = {
  id: "fee-rules-v1",
  version: 1,
  currency: "USD",
  label: "Default — 7% (min $5, max $300), Business exempt",
  defaults: { rateBps: 700, minMinor: 500, maxMinor: 30_000, fixedMinor: 0, exempt: false },
  planTiers: { business: { exempt: true } },
  categories: {},
  promotions: [],
  updatedAt: "2026-08-12T00:00:00.000Z",
};

/** The §5 ladder as a preset (12/9/7/5/4% with the same floor and cap, and a
 * reduced Business rate instead of a waiver). Applying it is an admin action. */
export const FEE_LADDER_PRESET: Record<FeePlanTier, FeeRuleOverride> = {
  free: { rateBps: 1200 },
  starter: { rateBps: 900 },
  professional: { rateBps: 700 },
  growth: { rateBps: 500 },
  business: { rateBps: 400, exempt: false },
};

/** Merge a base rule with an override (undefined fields never erase values). */
export function mergeFeeRule(base: FeeRule, override?: FeeRuleOverride): FeeRule {
  if (!override) return { ...base };
  return {
    rateBps: override.rateBps ?? base.rateBps,
    minMinor: override.minMinor ?? base.minMinor,
    // maxMinor is explicitly nullable: `null` means "uncapped" and must be
    // distinguishable from "not overridden".
    maxMinor: override.maxMinor !== undefined ? override.maxMinor : base.maxMinor,
    fixedMinor: override.fixedMinor ?? base.fixedMinor,
    exempt: override.exempt ?? base.exempt,
  };
}

/** A promotion only applies while it is enabled AND inside its window. */
export function feePromotionLive(promo: FeePromotion, atMs: number): boolean {
  return promo.enabled !== false && feePromotionActive(promo, atMs);
}

/**
 * Which promotion (if any) grants a credit bonus when a worker buys a plan
 * (or renews) at `at`. Deliberately narrower than the fee matcher:
 *
 *  • the campaign must be enabled, inside its window, and carry `bonusCredits`
 *  • a CATEGORY-scoped campaign is about job pricing, not signups → no grant
 *  • a CODE-scoped campaign needs the code, and the purchase flow has no code
 *    field → no grant (the redemption surface for codes ships with the lead
 *    marketplace)
 *  • the plan tier must match when the campaign names one
 *
 * First match wins, matching the engine's ordering rule.
 */
export function promotionBonusFor(
  promotions: FeePromotion[],
  ctx: { plan?: string | null; at?: string }
): { promotion: FeePromotion; credits: number } | null {
  const atMs = Date.parse(ctx.at ?? "") || Date.now();
  const tier = planTierFor(ctx.plan);
  for (const promo of promotions) {
    if (promo.enabled === false) continue;
    if (!feePromotionActive(promo, atMs)) continue;
    if (!promo.bonusCredits || promo.bonusCredits <= 0) continue;
    if (promo.categorySlug || promo.promoCode) continue;
    if (promo.planTier && promo.planTier !== tier) continue;
    return { promotion: promo, credits: Math.trunc(promo.bonusCredits) };
  }
  return null;
}

/** True while a promotion's window is open at `atMs` (either bound optional). */
export function feePromotionActive(promo: FeePromotion, atMs: number): boolean {
  if (promo.startsAt) {
    const start = Date.parse(promo.startsAt);
    if (Number.isFinite(start) && atMs < start) return false;
  }
  if (promo.endsAt) {
    const end = Date.parse(promo.endsAt);
    if (Number.isFinite(end) && atMs > end) return false;
  }
  return true;
}

/** True when a promotion's scope matches the context (all set fields must match). */
export function feePromotionMatches(promo: FeePromotion, ctx: FeeContext, tier: FeePlanTier): boolean {
  if (promo.planTier && promo.planTier !== tier) return false;
  if (promo.categorySlug && promo.categorySlug !== ctx.categorySlug) return false;
  // A code-scoped promotion requires the matching code; a code-less promotion
  // applies without one. Case-insensitive so "welcome" matches "WELCOME".
  if (promo.promoCode) {
    if (!ctx.promoCode || ctx.promoCode.trim().toLowerCase() !== promo.promoCode.trim().toLowerCase()) {
      return false;
    }
  }
  return true;
}

/**
 * Resolve the rule in force for one job. Layer order (later layers win, except
 * an exemption which is absolute):
 *   default → plan tier → category → emergency → promotion → plan exemption
 *
 * Exemption is checked LAST and short-circuits: a waived plan is a contractual
 * promise ("Business pays no transaction fee"), so no promotion can re-charge
 * it. Everything else follows specificity: an emergency override beats the
 * plain category rate, and an explicit campaign beats both.
 */
export function resolveFeeRule(ruleSet: FeeRuleSet, ctx: FeeContext = {}): ResolvedFeeRule {
  const tier = ctx.planTier ?? planTierFor(ctx.plan);
  const sources: FeeRuleSource[] = ["default"];

  let rule = mergeFeeRule(ruleSet.defaults);

  const tierOverride = ruleSet.planTiers[tier];
  if (tierOverride) {
    rule = mergeFeeRule(rule, tierOverride);
    sources.push("plan-tier");
  }

  // Absolute layer, checked FIRST: a waived plan is a contractual promise
  // ("Business pays no transaction fee"), so no category, emergency or
  // promotion rate may re-charge it — and the rate recorded in the snapshot is
  // the PLAN's own, not one of a promotion that could never apply.
  if (rule.exempt) {
    return {
      rule: { ...rule, exempt: true },
      tier,
      ruleId: ruleSet.id,
      ruleVersion: ruleSet.version,
      sources: ["plan-exempt"],
    };
  }

  if (ctx.categorySlug && ruleSet.categories[ctx.categorySlug]) {
    rule = mergeFeeRule(rule, ruleSet.categories[ctx.categorySlug]);
    sources.push("category");
  }

  if (ctx.emergency && ruleSet.emergency) {
    rule = mergeFeeRule(rule, ruleSet.emergency);
    sources.push("emergency");
  }

  // The FIRST matching promotion wins: the list is ordered by the admin, most
  // specific first, so a narrow "emergency plumbing week" campaign is not
  // silently overwritten by a broader one listed after it.
  const atMs = Date.parse(ctx.at ?? "") || Date.now();
  let promotionId: string | undefined;
  for (const promo of ruleSet.promotions) {
    if (promo.enabled === false) continue;
    if (!feePromotionMatches(promo, ctx, tier)) continue;
    if (!feePromotionActive(promo, atMs)) continue;
    rule = mergeFeeRule(rule, promo);
    promotionId = promo.id;
    sources.push("promotion");
    break;
  }

  // A promotion may itself waive the fee (a launch campaign) — same absolute
  // treatment, but the provenance records the campaign that did it.
  if (rule.exempt) {
    return {
      rule: { ...rule, exempt: true },
      tier,
      ruleId: ruleSet.id,
      ruleVersion: ruleSet.version,
      promotionId,
      sources: promotionId ? sources : ["plan-exempt"],
    };
  }

  return { rule, tier, ruleId: ruleSet.id, ruleVersion: ruleSet.version, promotionId, sources };
}

/**
 * Price a percentage rule (minor units, integer math only):
 *   fee = min(clamp(round(subtotal × bps / 10 000), min, max) + fixed, subtotal)
 *
 * Round-half-up, then the floor/cap, then the flat component, then a final
 * guard so the platform can never charge more than the job is worth. Zero for
 * an exempt rule or a non-positive/non-finite subtotal.
 */
export function computeFee(subtotalMinor: number, rule: FeeRule): FeeComputation {
  const base: FeeComputation = {
    feeMinor: 0,
    percentMinor: 0,
    clampedMinor: 0,
    rateBps: rule.rateBps,
    fixedMinor: rule.fixedMinor,
    minApplied: false,
    maxApplied: false,
    exempt: rule.exempt,
  };
  if (rule.exempt || !Number.isFinite(subtotalMinor) || subtotalMinor <= 0) return base;

  const percentMinor = Math.round((subtotalMinor * rule.rateBps) / 10_000);
  const capped = rule.maxMinor === null ? percentMinor : Math.min(percentMinor, rule.maxMinor);
  const clampedMinor = Math.max(capped, rule.minMinor);
  const charge = Math.min(clampedMinor + rule.fixedMinor, subtotalMinor);

  return {
    feeMinor: Math.max(charge, 0),
    percentMinor,
    clampedMinor,
    rateBps: rule.rateBps,
    fixedMinor: rule.fixedMinor,
    minApplied: percentMinor < rule.minMinor,
    maxApplied: rule.maxMinor !== null && percentMinor > rule.maxMinor,
    exempt: false,
  };
}

/** Resolve + price in one step — the call every adapter makes. */
export function priceJob(
  ruleSet: FeeRuleSet,
  subtotalMinor: number,
  ctx: FeeContext = {}
): { resolved: ResolvedFeeRule; computation: FeeComputation } {
  const resolved = resolveFeeRule(ruleSet, ctx);
  return { resolved, computation: computeFee(subtotalMinor, resolved.rule) };
}

/** Inputs for the §6 snapshot builder. */
export interface FeeSnapshotInput {
  id: string;
  jobId: string;
  quoteId: string;
  workerId: string;
  customerId?: string;
  plan?: string | null;
  subtotalMinor: number;
  resolved: ResolvedFeeRule;
  computation: FeeComputation;
  /** ISO stamp time. REQUIRED — the builder never reads the clock. */
  computedAt: string;
  currency?: CurrencyCode;
}

/**
 * Build the immutable §6 snapshot. Pure: the caller supplies the id and the
 * timestamp, so the same accept always produces a byte-identical record and
 * tests can assert it exactly.
 */
export function buildFeeSnapshot(input: FeeSnapshotInput): PlatformFeeSnapshot {
  const { rule, ruleId, ruleVersion, promotionId, sources } = input.resolved;
  const { feeMinor, minApplied, maxApplied, exempt } = input.computation;
  const subtotalMinor = Math.max(0, Math.trunc(input.subtotalMinor));
  return {
    id: input.id,
    jobId: input.jobId,
    quoteId: input.quoteId,
    workerId: input.workerId,
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.plan ? { plan: input.plan } : {}),
    planTier: input.resolved.tier,
    ruleId,
    ruleVersion,
    rateBps: rule.rateBps,
    minMinor: rule.minMinor,
    maxMinor: rule.maxMinor,
    fixedMinor: rule.fixedMinor,
    subtotalMinor,
    feeMinor,
    netMinor: subtotalMinor - feeMinor,
    minApplied,
    maxApplied,
    exempt,
    sources,
    ...(promotionId ? { promotionId } : {}),
    currency: input.currency ?? "USD",
    computedAt: input.computedAt,
  };
}

/** Human-readable explanation of a resolved rule — the "why am I paying
 * this?" line the UI shows under the quote (EN; the AR string is built by the
 * component from i18n keys). */
export function feeRuleReason(resolved: ResolvedFeeRule): string {
  if (resolved.rule.exempt) return "Fee waived by your plan";
  if (resolved.promotionId) return "Promotional take rate";
  if (resolved.sources.includes("emergency")) return "Emergency service rate";
  if (resolved.sources.includes("category")) return "Category rate";
  if (resolved.sources.includes("plan-tier")) return "Plan rate";
  return "Standard rate";
}

/**
 * Normalize a rule set from storage: fill every field, clamp nonsense to
 * sane values, and drop malformed promotions. Storage (jsonb) is untrusted —
 * a hand-edited row must not be able to charge a 100 000% fee.
 */
export function normalizeFeeRuleSet(input: Partial<FeeRuleSet> & Pick<FeeRuleSet, "id" | "version">): FeeRuleSet {
  const base = DEFAULT_FEE_RULE_SET;
  const rule = (raw?: FeeRuleOverride | FeeRule | null): FeeRule => {
    const merged = mergeFeeRule(base.defaults, raw ?? undefined);
    const rateBps = Math.min(Math.max(Math.trunc(merged.rateBps), 0), 10_000);
    const minMinor = Math.max(0, Math.trunc(merged.minMinor));
    const maxMinor =
      merged.maxMinor === null ? null : Math.max(minMinor, Math.trunc(merged.maxMinor ?? base.defaults.maxMinor ?? 0));
    return { rateBps, minMinor, maxMinor, fixedMinor: Math.max(0, Math.trunc(merged.fixedMinor)), exempt: Boolean(merged.exempt) };
  };

  const planTiers: Partial<Record<FeePlanTier, FeeRuleOverride>> = {};
  for (const tier of FEE_PLAN_TIERS) {
    if (input.planTiers?.[tier]) planTiers[tier] = input.planTiers[tier];
  }

  const categories: Record<string, FeeRuleOverride> = {};
  for (const [slug, override] of Object.entries(input.categories ?? {})) {
    if (slug && override) categories[slug] = override;
  }

  return {
    id: input.id,
    version: Math.max(1, Math.trunc(input.version)),
    currency: (input.currency ?? base.currency) as CurrencyCode,
    ...(input.label ? { label: input.label } : {}),
    defaults: rule(input.defaults),
    planTiers,
    categories,
    ...(input.emergency ? { emergency: input.emergency } : {}),
    promotions: normalizePromotions(input.promotions),
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    ...(input.updatedBy ? { updatedBy: input.updatedBy } : {}),
  };
}

/**
 * Normalize a promotion list from storage or an admin form: drop malformed
 * rows, clamp the rate to 0–100%, clamp the credit bonus to a sane ceiling (a
 * mistyped bonus must never mint 10 million credits), and coerce the window to
 * valid ISO when parsable (an unparsable date is dropped, which makes the
 * bound open-ended rather than silently closing the campaign in 1970).
 */
export function normalizePromotions(input: unknown): FeePromotion[] {
  if (!Array.isArray(input)) return [];
  const out: FeePromotion[] = [];
  for (const raw of input) {
    const promo = raw as Partial<FeePromotion> | null;
    if (!promo || typeof promo.id !== "string" || !promo.id.trim()) continue;
    if (typeof promo.label !== "string" || !promo.label.trim()) continue;
    const iso = (value?: string): string | undefined => {
      if (!value) return undefined;
      return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
    };
    const bonus =
      typeof promo.bonusCredits === "number" && Number.isFinite(promo.bonusCredits)
        ? Math.min(Math.max(Math.trunc(promo.bonusCredits), 0), 100_000)
        : 0;
    out.push({
      id: promo.id.trim().slice(0, 64),
      label: promo.label.trim().slice(0, 120),
      rateBps: Math.min(Math.max(Math.trunc(promo.rateBps ?? 0), 0), 10_000),
      ...(promo.minMinor !== undefined ? { minMinor: Math.max(0, Math.trunc(promo.minMinor)) } : {}),
      ...(promo.maxMinor !== undefined
        ? { maxMinor: promo.maxMinor === null ? null : Math.max(0, Math.trunc(promo.maxMinor)) }
        : {}),
      ...(promo.fixedMinor !== undefined ? { fixedMinor: Math.max(0, Math.trunc(promo.fixedMinor)) } : {}),
      ...(promo.exempt !== undefined ? { exempt: Boolean(promo.exempt) } : {}),
      ...(iso(promo.startsAt) ? { startsAt: iso(promo.startsAt) } : {}),
      ...(iso(promo.endsAt) ? { endsAt: iso(promo.endsAt) } : {}),
      ...(promo.planTier && FEE_PLAN_TIERS.includes(promo.planTier) ? { planTier: promo.planTier } : {}),
      ...(promo.categorySlug ? { categorySlug: String(promo.categorySlug).slice(0, 80) } : {}),
      ...(promo.promoCode ? { promoCode: String(promo.promoCode).trim().slice(0, 40) } : {}),
      ...(promo.enabled === false ? { enabled: false } : {}),
      ...(bonus > 0 ? { bonusCredits: bonus } : {}),
    });
  }
  return out;
}

/** Every plan tier's effective rule — powers the admin preset/preview table. */
export function tierRateTable(ruleSet: FeeRuleSet): Array<{ tier: FeePlanTier; rule: FeeRule; sources: FeeRuleSource[] }> {
  return FEE_PLAN_TIERS.map((tier) => {
    const resolved = resolveFeeRule(ruleSet, { planTier: tier });
    return { tier, rule: resolved.rule, sources: resolved.sources };
  });
}
