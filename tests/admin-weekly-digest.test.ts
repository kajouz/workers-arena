import { describe, expect, it } from "vitest";
import { buildAdminWeeklyDigest, surgeTuningLine } from "../src/lib/data/admin-weekly-digest";
import { computeSurgeReport } from "../src/lib/data/surge-report";
import type { LeadOffer } from "../src/lib/data/lead-market";
import type { LeadRefundRequest } from "../src/lib/data/lead-refunds";

/** Fixed "now" so every test is deterministic. */
const NOW = Date.parse("2026-09-21T08:00:00.000Z");

function offer(overrides: Partial<LeadOffer> = {}): LeadOffer {
  return {
    id: "offer-1",
    leadId: "qr-1",
    leadNumber: "QR-2026-00042",
    workerId: "w-1",
    grade: "emergency",
    matchScore: 90,
    priceCredits: 35,
    status: "offered",
    exclusive: true,
    offeredAt: new Date(NOW - 5 * 86_400_000).toISOString(),
    expiresAt: new Date(NOW + 1 * 86_400_000).toISOString(),
    ...overrides,
  };
}

function refund(overrides: Partial<LeadRefundRequest> = {}): LeadRefundRequest {
  return {
    id: "refund-1",
    offerId: "offer-1",
    workerId: "w-1",
    reason: "unreachable",
    requestedCredits: 35,
    approvedCredits: 35,
    status: "pending",
    requestedAt: new Date(NOW - 3 * 86_400_000).toISOString(),
    ...overrides,
  } as LeadRefundRequest;
}

/** A healthy 30-day cohort: 25 offers, 15 bought at 1.5×, no refunds. */
function healthyOffers(): LeadOffer[] {
  return Array.from({ length: 25 }, (_, i) =>
    offer({
      id: `offer-${i}`,
      status: i < 15 ? "purchased" : "offered",
      pricingMultiplier: 1.5,
    })
  );
}

const baseInput = {
  weekStart: new Date(NOW - 7 * 86_400_000).toISOString(),
  weekEnd: new Date(NOW).toISOString(),
  newBookings: 12,
  completedJobs: 8,
  pendingManualPayments: 2,
  pendingRefundRequests: 1,
  csvPath: "https://app.test/api/admin/revenue/surge-report?days=30",
  nowMs: NOW,
};

describe("surgeTuningLine", () => {
  const verdict = (code: string, conversionPct = 50, approvedRefundRatePct = 5) =>
    ({ code, conversionPct, approvedRefundRatePct, offers: 25, purchases: 15 }) as Parameters<typeof surgeTuningLine>[0];

  it("healthy says keep or raise", () => {
    const line = surgeTuningLine(verdict("healthy", 60), "en");
    expect(line).toMatch(/keep 1.5×/);
    expect(line).toContain("15/25");
  });

  it("overpriced says lower", () => {
    expect(surgeTuningLine(verdict("overpriced", 18), "en")).toMatch(/lowering the base price/);
  });

  it("quality-risk points at quality, not price", () => {
    expect(surgeTuningLine(verdict("quality-risk", 40, 25), "en")).toMatch(/lead quality first/);
  });

  it("insufficient-data reports the 20/10 floor", () => {
    const line = surgeTuningLine({ code: "insufficient-data", conversionPct: 10, approvedRefundRatePct: 0, offers: 8, purchases: 2 }, "en");
    expect(line).toContain("2/8");
    expect(line).toMatch(/20\/10/);
  });

  it("renders Arabic for every verdict", () => {
    for (const code of ["healthy", "overpriced", "quality-risk", "watch", "insufficient-data"] as const) {
      expect(surgeTuningLine(verdict(code), "ar")).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe("buildAdminWeeklyDigest", () => {
  it("carries the surge headline, verdict, tuning line and the CSV link", () => {
    const surge = computeSurgeReport(healthyOffers(), [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge });

    expect(digest.bodyEn).toContain("15/25 bought");
    expect(digest.bodyEn).toContain("60% conversion");
    expect(digest.bodyEn).toContain("net premium");
    expect(digest.bodyEn).toContain("Verdict: healthy");
    expect(digest.bodyEn).toContain("keep 1.5×");
    expect(digest.bodyEn).toContain(baseInput.csvPath);
    // The week is 7 days old → window day 30 marker present.
    expect(digest.bodyEn).toContain("(window day 30/30)");
    // Arabic mirror exists and is genuinely Arabic.
    expect(digest.bodyAr).toContain("الحكم: healthy");
    expect(digest.bodyAr).toMatch(/[\u0600-\u06FF]/);
    // Structured meta matches the text.
    expect(digest.meta).toMatchObject({
      verdict: "healthy",
      conversionPct: 60,
      purchases: 15,
      offers: 25,
      pendingRefundRequests: 1,
    });
  });

  it("surfaces pending refunds in the bookkeeping line", () => {
    const surge = computeSurgeReport(healthyOffers(), [refund()], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge });
    expect(digest.bodyEn).toContain("pending refunds 1");
    expect(digest.meta.pendingRefundRequests).toBe(1);
  });

  it("an insufficient-data window still ships an honest message", () => {
    const surge = computeSurgeReport([offer()], [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge });
    expect(digest.bodyEn).toContain("Verdict: insufficient-data");
    expect(digest.bodyEn).toMatch(/below the 20\/10 minimum/);
  });

  it("the message is phone-shaped: short lines, no markdown", () => {
    const surge = computeSurgeReport(healthyOffers(), [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge });
    for (const line of digest.bodyEn.split("\n")) {
      expect(line.length).toBeLessThan(160);
      expect(line).not.toMatch(/[*_`]|<\/?[a-z]+>/);
    }
  });
});
