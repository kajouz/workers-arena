import { describe, expect, it } from "vitest";
import { computeSmartPricing } from "@/lib/pricing/smart-pricing";

describe("Phase 2 smart lead pricing", () => {
  it("adds the emergency dispatch factor and keeps the result bounded", () => {
    const normal = computeSmartPricing({
      now: new Date("2026-02-10T12:00:00.000Z"),
      categorySlug: "plumbing",
      citySlug: "beirut",
      availableWorkers: 10,
      pendingLeads: 1,
    });
    const emergency = computeSmartPricing({
      now: new Date("2026-02-10T12:00:00.000Z"),
      categorySlug: "plumbing",
      citySlug: "beirut",
      availableWorkers: 10,
      pendingLeads: 1,
      isEmergency: true,
    });

    expect(emergency.multiplier).toBeGreaterThan(normal.multiplier);
    expect(emergency.multiplier).toBeLessThanOrEqual(2);
    expect(emergency.reason).toContain("emergency dispatch");
  });

  it("does not produce a negative or runaway multiplier with no supply", () => {
    const result = computeSmartPricing({
      now: new Date("2026-07-18T18:00:00.000Z"),
      categorySlug: "hvac",
      citySlug: "beirut",
      availableWorkers: 0,
      pendingLeads: 20,
      isEmergency: true,
    });
    expect(result.multiplier).toBeGreaterThanOrEqual(0.7);
    expect(result.multiplier).toBeLessThanOrEqual(2);
  });
});
