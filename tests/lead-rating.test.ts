import { describe, expect, it } from "vitest";
import {
  validateLeadRating,
  aggregateRatings,
  pricingMultiplierForGrade,
  pricingMultipliers,
  adjustedPrice,
  matchingWeightAdjustment,
  matchingWeightAdjustments,
  DEFAULT_PRICING_ADJUSTMENT,
  type LeadRating,
  type GradeRatingSummary,
} from "../src/lib/data/lead-rating";

function rating(overrides: Partial<LeadRating> = {}): LeadRating {
  return {
    id: `rlr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    offerId: "offer-1",
    workerId: "worker-1",
    leadId: "lead-1",
    grade: "bronze",
    quality: 3,
    reason: null,
    reasonAr: null,
    converted: false,
    reachable: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("lead rating engine", () => {
  describe("validateLeadRating", () => {
    it("accepts a valid rating", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        null,
        4,
        "w1"
      );
      expect(result.ok).toBe(true);
    });

    it("rejects when offer not found", () => {
      const result = validateLeadRating(null, null, 4, "w1");
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("offer-not-found");
    });

    it("rejects when not purchased", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "offered" },
        null,
        4,
        "w1"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("not-purchased");
    });

    it("rejects when wrong worker", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        null,
        4,
        "w2"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid-worker");
    });

    it("rejects duplicate rating", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        { offerId: "o1" },
        4,
        "w1"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("already-rated");
    });

    it("rejects invalid quality", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        null,
        6,
        "w1"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid-quality");
    });

    it("rejects zero quality", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        null,
        0,
        "w1"
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid-quality");
    });

    it("accepts boundary quality 1", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        null,
        1,
        "w1"
      );
      expect(result.ok).toBe(true);
    });

    it("accepts boundary quality 5", () => {
      const result = validateLeadRating(
        { id: "o1", workerId: "w1", status: "purchased" },
        null,
        5,
        "w1"
      );
      expect(result.ok).toBe(true);
    });
  });

  describe("aggregateRatings", () => {
    it("returns zero stats for empty input", () => {
      const summary = aggregateRatings([]);
      for (const grade of ["bronze", "silver", "gold", "emergency"] as const) {
        expect(summary[grade].count).toBe(0);
        expect(summary[grade].avgQuality).toBe(0);
      }
    });

    it("computes per-grade stats correctly", () => {
      const ratings = [
        rating({ grade: "bronze", quality: 2, converted: false }),
        rating({ grade: "bronze", quality: 4, converted: true, reachable: true }),
        rating({ grade: "gold", quality: 5, converted: true, reachable: true }),
        rating({ grade: "gold", quality: 3, converted: false, reachable: false }),
      ];
      const summary = aggregateRatings(ratings);

      expect(summary.bronze.count).toBe(2);
      expect(summary.bronze.avgQuality).toBe(3); // (2+4)/2
      expect(summary.bronze.conversionRate).toBe(50); // 1/2 = 50%
      expect(summary.bronze.reachabilityRate).toBe(100); // 1/1 = 100% (only 1 has reachable != null)

      expect(summary.gold.count).toBe(2);
      expect(summary.gold.avgQuality).toBe(4); // (5+3)/2
      expect(summary.gold.conversionRate).toBe(50);
      expect(summary.gold.reachabilityRate).toBe(50);

      expect(summary.silver.count).toBe(0);
      expect(summary.emergency.count).toBe(0);
    });

    it("builds correct quality distribution", () => {
      const ratings = [
        rating({ quality: 1 }),
        rating({ quality: 1 }),
        rating({ quality: 5 }),
      ];
      const summary = aggregateRatings(ratings);
      expect(summary.bronze.distribution[1]).toBe(2);
      expect(summary.bronze.distribution[5]).toBe(1);
      expect(summary.bronze.distribution[3]).toBe(0);
    });
  });

  describe("pricingMultiplierForGrade", () => {
    it("returns 1.0 when not enough ratings", () => {
      const stats = {
        grade: "bronze" as const,
        count: 2,
        avgQuality: 1.5,
        conversionRate: 0,
        reachabilityRate: 0,
        distribution: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
      expect(pricingMultiplierForGrade(stats)).toBe(1.0);
    });

    it("returns discount for low-quality grade", () => {
      const stats = {
        grade: "bronze" as const,
        count: 10,
        avgQuality: 2.0,
        conversionRate: 0,
        reachabilityRate: 0,
        distribution: { 1: 0, 2: 10, 3: 0, 4: 0, 5: 0 },
      };
      expect(pricingMultiplierForGrade(stats)).toBe(0.8);
    });

    it("returns surcharge for high-quality grade", () => {
      const stats = {
        grade: "gold" as const,
        count: 10,
        avgQuality: 4.5,
        conversionRate: 100,
        reachabilityRate: 100,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 10 },
      };
      expect(pricingMultiplierForGrade(stats)).toBe(1.2);
    });

    it("returns 1.0 for average quality", () => {
      const stats = {
        grade: "silver" as const,
        count: 10,
        avgQuality: 3.5,
        conversionRate: 50,
        reachabilityRate: 50,
        distribution: { 1: 0, 2: 0, 3: 5, 4: 5, 5: 0 },
      };
      expect(pricingMultiplierForGrade(stats)).toBe(1.0);
    });
  });

  describe("adjustedPrice", () => {
    it("applies multiplier and rounds", () => {
      expect(adjustedPrice(10, 1.2)).toBe(12);
      expect(adjustedPrice(10, 0.8)).toBe(8);
    });

    it("floors at 1 credit", () => {
      expect(adjustedPrice(1, 0.5)).toBe(1);
      expect(adjustedPrice(0, 1.5)).toBe(1);
    });
  });

  describe("matchingWeightAdjustment", () => {
    it("returns 0 for insufficient ratings", () => {
      const stats = {
        grade: "bronze" as const,
        count: 2,
        avgQuality: 1.0,
        conversionRate: 0,
        reachabilityRate: 0,
        distribution: { 1: 2, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
      expect(matchingWeightAdjustment(stats)).toBe(0);
    });

    it("returns negative for low quality", () => {
      const stats = {
        grade: "bronze" as const,
        count: 10,
        avgQuality: 1.0,
        conversionRate: 0,
        reachabilityRate: 0,
        distribution: { 1: 10, 2: 0, 3: 0, 4: 0, 5: 0 },
      };
      expect(matchingWeightAdjustment(stats)).toBe(-10);
    });

    it("returns positive for high quality", () => {
      const stats = {
        grade: "gold" as const,
        count: 10,
        avgQuality: 5.0,
        conversionRate: 100,
        reachabilityRate: 100,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 10 },
      };
      expect(matchingWeightAdjustment(stats)).toBe(10);
    });

    it("returns 0 for average quality", () => {
      const stats = {
        grade: "silver" as const,
        count: 10,
        avgQuality: 3.0,
        conversionRate: 50,
        reachabilityRate: 50,
        distribution: { 1: 0, 2: 0, 3: 10, 4: 0, 5: 0 },
      };
      expect(matchingWeightAdjustment(stats)).toBe(0);
    });
  });

  describe("pricingMultipliers", () => {
    it("returns all 1.0 for empty summary", () => {
      const summary = aggregateRatings([]);
      const multipliers = pricingMultipliers(summary);
      for (const grade of ["bronze", "silver", "gold", "emergency"] as const) {
        expect(multipliers[grade]).toBe(1.0);
      }
    });
  });
});
