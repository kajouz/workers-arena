"use server";

/**
 * §5 — admin fee-rule actions: publish a new version of the platform's
 * take-rate rules (docs/fee-rules.md).
 *
 * A pricing change is a money mutation, so this action is admin-only, zod
 * validated, and never mutates history: `saveFeeRuleSet` APPENDS version+1 and
 * deactivates the previous row, which is what keeps every historical
 * PlatformFeeSnapshot re-derivable from the rules that produced it.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-demo";
import {
  FEE_LADDER_PRESET,
  FEE_PLAN_TIERS,
  normalizePromotions,
  type FeePlanTier,
  type FeePromotion,
  type FeeRuleOverride,
} from "@/lib/data/fee-rules";
import { saveFeeRuleSet } from "@/lib/data/fee-rules-store";

/** One editable rule row, in the units the admin types (% / major units). */
const ruleRowSchema = z.object({
  ratePct: z.coerce.number().min(0).max(100),
  min: z.coerce.number().min(0).max(100_000),
  max: z.coerce.number().min(0).max(1_000_000),
  fixed: z.coerce.number().min(0).max(100_000),
  exempt: z.coerce.boolean(),
});

const payloadSchema = z.object({
  label: z.string().max(120).optional(),
  /** Apply the §5 ladder (12/9/7/5/4%) instead of the submitted tier rows. */
  applyLadderPreset: z.boolean().optional(),
  defaults: ruleRowSchema,
  planTiers: z.record(z.string(), ruleRowSchema),
});

export type FeeRuleRow = z.infer<typeof ruleRowSchema>;
export interface FeeRulesPayload {
  label?: string;
  applyLadderPreset?: boolean;
  defaults: FeeRuleRow;
  planTiers: Record<string, FeeRuleRow>;
}

export interface SaveFeeRulesResult {
  ok?: boolean;
  error?: "unauthorized" | "invalid" | "failed";
  version?: number;
}

/** Major units → minor units (the schema stores integer cents). */
function toMinor(major: number): number {
  return Math.round(major * 100);
}

/** Percent → basis points. */
function toBps(pct: number): number {
  return Math.round(pct * 100);
}

/** One admin row → the engine's override shape (minor units + bps). */
function toOverride(row: FeeRuleRow): FeeRuleOverride {
  return {
    rateBps: toBps(row.ratePct),
    minMinor: toMinor(row.min),
    maxMinor: toMinor(row.max),
    fixedMinor: toMinor(row.fixed),
    exempt: row.exempt,
  };
}

export async function saveFeeRulesAction(payload: FeeRulesPayload): Promise<SaveFeeRulesResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "unauthorized" };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { error: "invalid" };
  const { label, applyLadderPreset, defaults, planTiers } = parsed.data;

  // The tier map is rebuilt from the canonical tier list, so a tampered payload
  // can never introduce a tier the engine does not know about.
  const nextTiers: Partial<Record<FeePlanTier, FeeRuleOverride>> = {};
  for (const tier of FEE_PLAN_TIERS) {
    const row = applyLadderPreset ? undefined : planTiers[tier];
    if (row) {
      nextTiers[tier] = toOverride(row);
    } else if (applyLadderPreset) {
      nextTiers[tier] = FEE_LADDER_PRESET[tier];
    }
  }

  try {
    const saved = await saveFeeRuleSet(
      {
        ...(label ? { label } : {}),
        defaults: toOverride(defaults),
        planTiers: nextTiers,
      },
      { id: session.id, name: session.name }
    );
    // The dashboard preview, the search fee-waived filter and the snapshot
    // audit list all read this configuration.
    revalidatePath("/admin/revenue-settings");
    revalidatePath("/dashboard");
    return { ok: true, version: saved.version };
  } catch (error) {
    console.error("[fee-rules] save failed", error);
    return { error: "failed" };
  }
}

/**
 * §24 — publish the promotion campaigns. The whole list is replaced in ONE new
 * rule-set version (append-only history, so an old snapshot's `promotionId` and
 * rule version still resolve). Validation is strict, then `normalizePromotions`
 * clamps rates/bonuses and drops malformed rows — a campaign can never mint an
 * absurd credit bonus or an unawardable rate.
 */
const promotionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  rateBps: z.number().int().min(0).max(10_000),
  minMinor: z.number().int().min(0).optional(),
  maxMinor: z.number().int().min(0).nullable().optional(),
  fixedMinor: z.number().int().min(0).optional(),
  exempt: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  planTier: z.enum([...FEE_PLAN_TIERS] as [FeePlanTier, ...FeePlanTier[]]).optional(),
  categorySlug: z.string().max(80).optional(),
  promoCode: z.string().max(40).optional(),
  enabled: z.boolean().optional(),
  bonusCredits: z.number().int().min(0).max(100_000).optional(),
});

export async function saveFeePromotionsAction(
  promotions: FeePromotion[]
): Promise<SaveFeeRulesResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "unauthorized" };

  const parsed = z.array(promotionSchema).max(50).safeParse(promotions);
  if (!parsed.success) return { error: "invalid" };
  // The enum above guarantees the tier at runtime; the cast restores the
  // literal union zod widens to `string`. Normalization then clamps.
  const normalized = normalizePromotions(parsed.data);
  if (normalized.length !== parsed.data.length) return { error: "invalid" };

  try {
    const saved = await saveFeeRuleSet(
      { promotions: normalized, change: "promotion campaigns" },
      { id: session.id, name: session.name }
    );
    revalidatePath("/admin/revenue-settings");
    return { ok: true, version: saved.version };
  } catch (error) {
    console.error("[fee-rules] promotion save failed", error);
    return { error: "failed" };
  }
}
