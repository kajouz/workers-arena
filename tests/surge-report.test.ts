import { describe, expect, it } from "vitest";
import {
  computeSurgeReport,
  decideVerdict,
  SURGE_VERDICT_THRESHOLDS,
  type SurgeSummary,
} from "../src/lib/data/surge-report";
import type { LeadOffer } from "../src/lib/data/lead-market";
import type { LeadRefundRequest } from "../src/lib/data/lead-refunds";

/** Fixed "now" so every test is deterministic. */
const NOW = Date.parse("2026-09-20T12:00:00.000Z");

function offer(overrides: Partial<LeadOffer> = {}): LeadOffer {
  return {
    id: `offer-${Math.random().toString(36).slice(2, 8)}`,
    leadId: `lead-${Math.random().toString(36).slice(2, 6)}`,
    leadNumber: "QR-2026-00001",
    workerId: "w1",
    grade: "emergency",
    matchScore: 90,
    priceCredits: 35,
    status: "offered",
    exclusive: true,
    offeredAt: "2026-09-10T12:00:00.000Z",
    expiresAt: "2026-09-10T14:00:00.000Z",
    ...overrides,
  };
}

function refund(overrides: Partial<LeadRefundRequest> = {}): LeadRefundRequest {
  return {
    id: `lref-${Math.random().toString(36).slice(2, 8)}`,
    offerId: "offer-1",
    leadId: "lead-1",
    workerId: "w1",
    reason: "invalid-contact",
    requestedCredits: 35,
    approvedCredits: 0,
    status: "pending",
    submittedAt: "2026-09-11T12:00:00.000Z",
    ...overrides,
  };
}

/** A cohort of `purchased` purchases out of `total` emergency offers. */
function cohort(total: number, purchased: number, overrides: Partial<LeadOffer> = {}): LeadOffer[] {
  return Array.from({ length: total }, (_, i) =>
    offer({
      status: i < purchased ? "purchased" : "offered",
      ...overrides,
    })
  );
}

describe("surge report (30-day emergency premium evaluation)", () => {
  it("returns an empty-but-shaped report with an insufficient-data verdict", () => {
    const report = computeSurgeReport([], [], { nowMs: NOW });
    expect(report.windowDays).toBe(30);
    expect(report.summary.offers).toBe(0);
    expect(report.summary.conversionPct).toBe(0);
    expect(report.summary.avgMultiplier).toBe(1);
    expect(report.summary.premiumCredits).toBe(0);
    expect(report.verdict.code).toBe("insufficient-data");
    expect(report.weeks).toEqual([]);
    expect(report.multipliers).toEqual({ exactly1: 0, upTo1_3: 0, upTo1_6: 0, above1_6: 0 });
  });

  it("excludes offers outside the window and grades other than emergency", () => {
    const offers = [
      offer({ id: "in-1", offeredAt: "2026-08-21T12:00:00.000Z" }), // exactly 30d before NOW → in
      offer({ id: "out-1", offeredAt: "2026-08-21T11:59:59.999Z" }), // 1ms older → out
      offer({ id: "out-2", offeredAt: "2026-08-01T12:00:00.000Z" }), // way out
      offer({ id: "gold-1", grade: "gold", offeredAt: "2026-09-10T12:00:00.000Z" }),
      offer({ id: "in-2", offeredAt: "2026-09-19T12:00:00.000Z" }),
    ];
    const report = computeSurgeReport(offers, [], { nowMs: NOW });
    expect(report.summary.offers).toBe(2); // in-1 + in-2
    expect(report.goldBaseline.offers).toBe(1);
  });

  it("computes conversion, base/premium split and the multiplier average", () => {
    // 20 offers, 10 purchased at 1.5× on a 35-credit price → base 23, premium 12.
    const offers = cohort(20, 10, { priceCredits: 35, pricingMultiplier: 1.5 });
    const report = computeSurgeReport(offers, [], { nowMs: NOW });
    expect(report.summary.offers).toBe(20);
    expect(report.summary.purchased).toBe(10);
    expect(report.summary.conversionPct).toBe(50);
    expect(report.summary.avgMultiplier).toBe(1.5);
    // base = round(35 / 1.5) = 23 per purchase → 230 total; premium = 35 − 23 = 12 → 120.
    expect(report.summary.baseCredits).toBe(230);
    expect(report.summary.premiumCredits).toBe(120);
    expect(report.summary.netPremiumCredits).toBe(120);
    // multiplier buckets: all 20 carry 1.5 → upTo1_6
    expect(report.multipliers).toEqual({ exactly1: 0, upTo1_3: 0, upTo1_6: 20, above1_6: 0 });
  });

  it("treats offers without a locked multiplier as flat (base = price)", () => {
    const offers = cohort(20, 10, { pricingMultiplier: undefined });
    const report = computeSurgeReport(offers, [], { nowMs: NOW });
    expect(report.summary.avgMultiplier).toBe(1);
    expect(report.summary.baseCredits).toBe(350); // 10 × 35
    expect(report.summary.premiumCredits).toBe(0);
    expect(report.multipliers.exactly1).toBe(20);
  });

  it("counts pending refunds separately and rate-limits approved credits", () => {
    const purchased = cohort(20, 10, { priceCredits: 35, pricingMultiplier: 1.5 });
    const first = purchased[0]!;
    const second = purchased[1]!;
    const refunds = [
      refund({ offerId: first.id, status: "approved", approvedCredits: 35 }),
      refund({ offerId: second.id, status: "pending" }),
    ];
    const report = computeSurgeReport(purchased, refunds, { nowMs: NOW });
    expect(report.summary.refundRequests).toBe(2);
    expect(report.summary.pendingRefunds).toBe(1);
    expect(report.summary.approvedRefunds).toBe(1);
    // purchased credits = 350; approved = 35 → 10%.
    expect(report.summary.approvedRefundRatePct).toBe(10);
    // 35 refunded on a 1.5× offer: premium share 12/35 → round(35 × 12/35) = 12.
    expect(report.summary.refundedPremiumCredits).toBe(12);
    expect(report.summary.netPremiumCredits).toBe(120 - 12);
  });

  it("never lets a refund on a legacy flat offer attribute premium", () => {
    const purchased = cohort(20, 10, { pricingMultiplier: undefined });
    const refunds = [refund({ offerId: purchased[0]!.id, status: "approved", approvedCredits: 35 })];
    const report = computeSurgeReport(purchased, refunds, { nowMs: NOW });
    expect(report.summary.refundedPremiumCredits).toBe(0);
  });

  it("bins the cohort by ISO week with per-week conversion", () => {
    const week1 = Array.from({ length: 4 }, () => offer({ offeredAt: "2026-09-02T12:00:00.000Z", status: "purchased" }));
    const week2 = Array.from({ length: 6 }, () => offer({ offeredAt: "2026-09-16T12:00:00.000Z" }));
    const report = computeSurgeReport([...week1, ...week2], [], { nowMs: NOW });
    expect(report.weeks).toHaveLength(2);
    expect(report.weeks[0]!.conversionPct).toBe(100);
    expect(report.weeks[1]!.conversionPct).toBe(0);
    expect(report.weeks[0]!.weekKey).toMatch(/^2026-W\d{2}$/);
  });

  it("skips offers with unparsable offeredAt", () => {
    const offers = [offer({ id: "bad", offeredAt: "not-a-date" }), offer({ id: "good" })];
    const report = computeSurgeReport(offers, [], { nowMs: NOW });
    expect(report.summary.offers).toBe(1);
  });

  it("verdict precedence: insufficient data beats everything", () => {
    const base: SurgeSummary = {
      offers: SURGE_VERDICT_THRESHOLDS.minOffers,
      purchased: SURGE_VERDICT_THRESHOLDS.minPurchases,
      conversionPct: 0,
      avgMultiplier: 1.5,
      baseCredits: 0,
      premiumCredits: 0,
      refundedPremiumCredits: 0,
      netPremiumCredits: 0,
      refundRequests: 0,
      pendingRefunds: 0,
      approvedRefunds: 0,
      approvedRefundRatePct: 0,
    };
    expect(decideVerdict({ ...base, offers: 19 }, SURGE_VERDICT_THRESHOLDS).code).toBe("insufficient-data");
    expect(decideVerdict({ ...base, purchased: 9 }, SURGE_VERDICT_THRESHOLDS).code).toBe("insufficient-data");
  });

  it("verdict precedence: quality-risk before overpriced before healthy", () => {
    const base: SurgeSummary = {
      offers: 100,
      purchased: 50,
      conversionPct: 50,
      avgMultiplier: 1.5,
      baseCredits: 0,
      premiumCredits: 0,
      refundedPremiumCredits: 0,
      netPremiumCredits: 0,
      refundRequests: 0,
      pendingRefunds: 0,
      approvedRefunds: 0,
      approvedRefundRatePct: 5,
    };
    expect(decideVerdict(base, SURGE_VERDICT_THRESHOLDS).code).toBe("healthy");
    // High refunds win even with great conversion.
    expect(decideVerdict({ ...base, approvedRefundRatePct: 21 }, SURGE_VERDICT_THRESHOLDS).code).toBe("quality-risk");
    // Low conversion (but acceptable refunds) is overpriced.
    expect(decideVerdict({ ...base, conversionPct: 24 }, SURGE_VERDICT_THRESHOLDS).code).toBe("overpriced");
    // Between the bands → watch.
    expect(decideVerdict({ ...base, conversionPct: 30 }, SURGE_VERDICT_THRESHOLDS).code).toBe("watch");
  });

  it("an end-to-end healthy cohort reaches the healthy verdict", () => {
    const offers = cohort(25, 15, { priceCredits: 35, pricingMultiplier: 1.5 });
    const report = computeSurgeReport(offers, [], { nowMs: NOW });
    expect(report.verdict.code).toBe("healthy");
    expect(report.verdict.conversionPct).toBe(60);
  });
});
