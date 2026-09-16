import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_CATALOG_OVERRIDES,
  effectiveMonthlyPriceWithOverrides,
  normalizePlanCatalogOverrides,
  resolvePlanCatalogEntry,
} from "../src/lib/data/plan-catalog-overrides";
import { saveFeeRuleSet, loadPlanCatalog, activeFeeRuleSetSync } from "../src/lib/data/fee-rules-store";

describe("normalizePlanCatalogOverrides", () => {
  it("returns the shipped defaults for a null payload", () => {
    expect(normalizePlanCatalogOverrides(null)).toEqual(DEFAULT_PLAN_CATALOG_OVERRIDES);
  });

  it("fills absent plan keys from the shipped defaults (partial override)", () => {
    const out = normalizePlanCatalogOverrides({ plans: { basic: { monthlyPriceUsd: 12 } } });
    expect(out.plans.basic.monthlyPriceUsd).toBe(12);
    expect(out.plans.basic.includedLeads).toBe(3); // untouched → default
    expect(out.plans.professional.monthlyPriceUsd).toBe(39);
  });

  it("clamps nonsense: negative prices, huge quotas, wild multipliers", () => {
    const out = normalizePlanCatalogOverrides({
      plans: {
        basic: { monthlyPriceUsd: -5, includedLeads: 999_999, extraLeadPriceUsd: 5_000, searchBoost: 50 },
      },
      trialDays: 5_000,
      categoryTiers: { low: -2, mid: 10, high: 2 },
    });
    expect(out.plans.basic.monthlyPriceUsd).toBe(0);
    expect(out.plans.basic.includedLeads).toBe(10_000);
    expect(out.plans.basic.extraLeadPriceUsd).toBe(1_000);
    expect(out.plans.basic.searchBoost).toBe(5);
    expect(out.trialDays).toBe(90);
    expect(out.categoryTiers.low).toBe(0);
    expect(out.categoryTiers.mid).toBe(3);
    expect(out.categoryTiers.high).toBe(2);
  });

  it("treats garbage values as absent (falls back to the default)", () => {
    const out = normalizePlanCatalogOverrides({
      plans: { premium: { monthlyPriceUsd: Number.NaN } },
    } as never);
    expect(out.plans.premium.monthlyPriceUsd).toBe(99);
  });
});

describe("resolvePlanCatalogEntry / effectiveMonthlyPriceWithOverrides", () => {
  it("merges admin overrides over the shipped entry", () => {
    const overrides = normalizePlanCatalogOverrides({ plans: { premium: { monthlyPriceUsd: 79 } } });
    expect(resolvePlanCatalogEntry(overrides, "premium").monthlyPriceUsd).toBe(79);
    expect(resolvePlanCatalogEntry(overrides, "premium").includedLeads).toBe(25); // shipped
    expect(resolvePlanCatalogEntry(overrides, "basic").monthlyPriceUsd).toBe(15); // untouched
  });

  it("prices through the (admin-editable) category multipliers", () => {
    const overrides = normalizePlanCatalogOverrides({});
    expect(effectiveMonthlyPriceWithOverrides(overrides, "basic", "cleaning")).toBe(7.5); // 0.5×
    expect(effectiveMonthlyPriceWithOverrides(overrides, "basic", "ac-technician")).toBe(22.5); // 1.5×
    const steep = normalizePlanCatalogOverrides({ categoryTiers: { high: 2 } });
    expect(effectiveMonthlyPriceWithOverrides(steep, "basic", "ac-technician")).toBe(30);
  });
});

describe("store carriage (demo mode)", () => {
  const original = activeFeeRuleSetSync();

  it("saveFeeRuleSet carries + normalizes the plan catalog, versioned", async () => {
    const saved = await saveFeeRuleSet({ planCatalog: { plans: { basic: { monthlyPriceUsd: 9 } } } });
    expect(saved.version).toBe(original.version + 1);
    const loaded = await loadPlanCatalog();
    expect(loaded.plans.basic.monthlyPriceUsd).toBe(9);
    expect(loaded.plans.premium.monthlyPriceUsd).toBe(99); // untouched → carried
    expect(loaded.trialDays).toBe(30);
  });

  it("clamps a hand-edited payload on write", async () => {
    await saveFeeRuleSet({
      planCatalog: { trialDays: 1_000, categoryTiers: { high: 99 } },
    } as never);
    const loaded = await loadPlanCatalog();
    expect(loaded.trialDays).toBe(90);
    expect(loaded.categoryTiers.high).toBe(3);
  });
});
