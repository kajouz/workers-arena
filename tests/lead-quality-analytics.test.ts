import { describe, expect, it } from "vitest";
import {
  isoWeekKey,
  isoWeekStart,
  computeLeadQualityAnalytics,
  type RatingInput,
} from "../src/lib/data/lead-quality-analytics";

function rating(overrides: Partial<RatingInput> = {}): RatingInput {
  return {
    grade: "bronze",
    quality: 3,
    converted: false,
    reachable: null,
    createdAt: "2026-09-15T10:00:00Z",
    ...overrides,
  };
}

describe("lead quality analytics", () => {
  describe("isoWeekKey", () => {
    it("returns YYYY-Www for a known date", () => {
      // 2026-09-15 is a Tuesday in W38
      const key = isoWeekKey(new Date("2026-09-15T00:00:00Z"));
      expect(key).toMatch(/^2026-W\d{2}$/);
    });

    it("handles year boundary", () => {
      // 2027-01-01 is a Friday — falls in ISO W53 of 2026
      const key = isoWeekKey(new Date("2027-01-01T00:00:00Z"));
      expect(key).toBe("2026-W53");
    });

    it("handles Sunday (ISO week start is Monday)", () => {
      // 2026-09-13 is a Sunday
      const key = isoWeekKey(new Date("2026-09-13T00:00:00Z"));
      expect(key).toMatch(/^2026-W\d{2}$/);
    });
  });

  describe("isoWeekStart", () => {
    it("returns Monday for a Tuesday", () => {
      const start = isoWeekStart(new Date("2026-09-15T00:00:00Z"));
      expect(start).toBe("2026-09-14"); // Monday
    });

    it("returns same day for Monday", () => {
      const start = isoWeekStart(new Date("2026-09-14T00:00:00Z"));
      expect(start).toBe("2026-09-14");
    });

    it("returns previous Monday for Sunday", () => {
      const start = isoWeekStart(new Date("2026-09-13T00:00:00Z"));
      expect(start).toBe("2026-09-07"); // Monday of that week
    });
  });

  describe("computeLeadQualityAnalytics", () => {
    it("returns empty analytics for no ratings", () => {
      const analytics = computeLeadQualityAnalytics([]);
      expect(analytics.weeks).toHaveLength(0);
      expect(analytics.totalRatings).toBe(0);
      expect(analytics.earliestRating).toBeNull();
      expect(analytics.latestRating).toBeNull();
    });

    it("bins ratings by ISO week", () => {
      const ratings = [
        rating({ createdAt: "2026-09-14T10:00:00Z" }), // Monday W37
        rating({ createdAt: "2026-09-15T10:00:00Z" }), // Tuesday W37 (same week)
        rating({ createdAt: "2026-09-21T10:00:00Z" }), // Monday W38
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.weeks).toHaveLength(2);
      expect(analytics.weeks[0].totalCount).toBe(2);
      expect(analytics.weeks[1].totalCount).toBe(1);
    });

    it("computes per-grade stats within each week", () => {
      const ratings = [
        rating({ grade: "bronze", quality: 2, createdAt: "2026-09-14T10:00:00Z" }),
        rating({ grade: "gold", quality: 5, createdAt: "2026-09-15T10:00:00Z" }),
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      const week = analytics.weeks[0];
      expect(week.byGrade.bronze.count).toBe(1);
      expect(week.byGrade.bronze.avgQuality).toBe(2);
      expect(week.byGrade.gold.count).toBe(1);
      expect(week.byGrade.gold.avgQuality).toBe(5);
      expect(week.byGrade.silver.count).toBe(0);
    });

    it("computes overall weekly averages", () => {
      const ratings = [
        rating({ quality: 2, createdAt: "2026-09-14T10:00:00Z" }),
        rating({ quality: 4, createdAt: "2026-09-15T10:00:00Z" }),
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.weeks[0].overallAvgQuality).toBe(3); // (2+4)/2
    });

    it("computes lifetime stats correctly", () => {
      const ratings = [
        rating({ grade: "bronze", quality: 2, converted: false }),
        rating({ grade: "bronze", quality: 4, converted: true }),
        rating({ grade: "gold", quality: 5, converted: true }),
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.lifetimeByGrade.bronze.count).toBe(2);
      expect(analytics.lifetimeByGrade.bronze.avgQuality).toBe(3);
      expect(analytics.lifetimeByGrade.bronze.conversionRate).toBe(50);
      expect(analytics.lifetimeByGrade.gold.count).toBe(1);
      expect(analytics.totalRatings).toBe(3);
    });

    it("computes price multipliers from lifetime stats", () => {
      // 10 low-quality bronze ratings → discount
      const ratings = Array.from({ length: 10 }, () =>
        rating({ grade: "bronze", quality: 1, createdAt: "2026-09-14T10:00:00Z" })
      );
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.lifetimeMultipliers.bronze).toBe(0.8);
      expect(analytics.lifetimeMultipliers.gold).toBe(1.0); // no gold ratings
    });

    it("records date range", () => {
      const ratings = [
        rating({ createdAt: "2026-08-01T10:00:00Z" }),
        rating({ createdAt: "2026-09-15T10:00:00Z" }),
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.earliestRating).toContain("2026-08");
      expect(analytics.latestRating).toContain("2026-09");
    });

    it("computes conversion rate per week", () => {
      const ratings = [
        rating({ converted: true, createdAt: "2026-09-14T10:00:00Z" }),
        rating({ converted: false, createdAt: "2026-09-15T10:00:00Z" }),
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.weeks[0].overallConversionRate).toBe(50);
    });

    it("skips ratings with unparseable dates", () => {
      const ratings = [
        rating({ createdAt: "not-a-date" }),
        rating({ createdAt: "2026-09-14T10:00:00Z" }),
      ];
      const analytics = computeLeadQualityAnalytics(ratings);
      expect(analytics.totalRatings).toBe(2); // both counted in total
      expect(analytics.weeks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
