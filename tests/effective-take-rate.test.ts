import { describe, expect, it } from "vitest";
import { effectiveTakeRate } from "../src/lib/data/subscription-plans";
import { DEFAULT_FEE_RULE_SET, FEE_LADDER_PRESET, type FeeRuleSet } from "../src/lib/data/fee-rules";

// The homepage calculator must charge what an accept stamps: the live rule
// set's rate per plan tier, with the $5 floor on small jobs.
describe("effectiveTakeRate — priced through the fee engine", () => {
  it("uses the shipped default rules: 7% for Starter, 4% for Business", () => {
    // 10 jobs × $200: Starter $15 + 10 × $14 fee = $155 of $2,000 = 7.75%.
    expect(effectiveTakeRate("basic", 10, 200)).toBeCloseTo(7.75, 2);
    // Business $199 + 10 × $8 fee = $279 of $2,000 = 13.95%.
    expect(effectiveTakeRate("enterprise", 10, 200)).toBeCloseTo(13.95, 2);
  });

  it("applies the $5 floor on small jobs", () => {
    // $40 job at 7% is $2.80, floored to $5: $15 + 10 × $5 = $65 of $400.
    expect(effectiveTakeRate("basic", 10, 40)).toBeCloseTo(16.25, 2);
  });

  it("follows an admin-applied ladder and an admin-edited plan price", () => {
    const ladder: FeeRuleSet = { ...DEFAULT_FEE_RULE_SET, planTiers: FEE_LADDER_PRESET };
    // Starter at 9%: $15 + 10 × $18 = $195 of $2,000.
    expect(effectiveTakeRate("basic", 10, 200, null, { ruleSet: ladder })).toBeCloseTo(9.75, 2);
    // Same, with the plan repriced to $20.
    expect(effectiveTakeRate("basic", 10, 200, null, { ruleSet: ladder, monthlyPriceUsd: 20 })).toBeCloseTo(10, 2);
  });
});
