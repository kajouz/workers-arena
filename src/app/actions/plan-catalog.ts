"use server";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PLAN CATALOG ADMIN ACTIONS — reprice the subscription plans without a deploy
 * ────────────────────────────────────────────────────────────────────────────
 * A plan-price change is a money mutation, so this follows the fee-rules
 * pattern exactly: admin-only, zod-validated, and saved as a NEW version of
 * the FeeRuleSet (append-only history — every past pricing decision stays
 * auditable and re-derivable).
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/auth-demo";
import { saveFeeRuleSet, loadPlanCatalog } from "@/lib/data/fee-rules-store";

/** The four plans' editable rows, in the units the admin types. */
const planRowSchema = z.object({
  monthlyPriceUsd: z.coerce.number().min(0).max(10_000),
  includedLeads: z.coerce.number().int().min(-1).max(10_000),
  extraLeadPriceUsd: z.coerce.number().min(0).max(1_000),
  searchBoost: z.coerce.number().min(0.5).max(5),
});

const payloadSchema = z.object({
  plans: z.object({
    basic: planRowSchema,
    professional: planRowSchema,
    premium: planRowSchema,
    enterprise: planRowSchema,
  }),
  trialDays: z.coerce.number().int().min(0).max(90),
  categoryTiers: z.object({
    low: z.coerce.number().min(0).max(3),
    mid: z.coerce.number().min(0).max(3),
    high: z.coerce.number().min(0).max(3),
  }),
});

export type PlanCatalogPayload = z.infer<typeof payloadSchema>;

export interface SavePlanCatalogResult {
  ok?: boolean;
  error?: "unauthorized" | "invalid" | "failed";
  version?: number;
}

/** Save the edited catalog as a new rule-set version. Admin-only. */
export async function savePlanCatalogAction(payload: PlanCatalogPayload): Promise<SavePlanCatalogResult> {
  const session = await getSession();
  if (!session || session.role !== "admin") return { error: "unauthorized" };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { error: "invalid" };

  try {
    const saved = await saveFeeRuleSet(
      {
        change: "subscription plan pricing",
        planCatalog: parsed.data,
      },
      { id: session.id, name: session.name }
    );
    // The pricing page, renewal dialog, trial gate and take-rate calculator all
    // read the catalog.
    revalidatePath("/admin/revenue-settings");
    revalidatePath("/");
    revalidatePath("/dashboard");
    return { ok: true, version: saved.version };
  } catch {
    return { error: "failed" };
  }
}

/** The current catalog for the admin panel's initial state. */
export async function getPlanCatalogAction(): Promise<PlanCatalogPayload> {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return {
      plans: {
        basic: { monthlyPriceUsd: 15, includedLeads: 3, extraLeadPriceUsd: 0.05, searchBoost: 1 },
        professional: { monthlyPriceUsd: 39, includedLeads: 10, extraLeadPriceUsd: 0.04, searchBoost: 1.25 },
        premium: { monthlyPriceUsd: 99, includedLeads: 25, extraLeadPriceUsd: 0.03, searchBoost: 1.5 },
        enterprise: { monthlyPriceUsd: 199, includedLeads: -1, extraLeadPriceUsd: 0, searchBoost: 2 },
      },
      trialDays: 30,
      categoryTiers: { low: 0.5, mid: 1, high: 1.5 },
    };
  }
  const catalog = await loadPlanCatalog();
  return {
    plans: catalog.plans,
    trialDays: catalog.trialDays,
    categoryTiers: catalog.categoryTiers,
  };
}
