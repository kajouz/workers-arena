import { describe, expect, it } from "vitest";
import { buildAdminWeeklyDigest, surgeTuningLine } from "../src/lib/data/admin-weekly-digest";
import { computeSurgeReport } from "../src/lib/data/surge-report";
import { whatsappDeliveryHealth } from "../src/lib/data/whatsapp-deliveries";
import type { LeadOffer } from "../src/lib/data/lead-market";
import type { LeadRefundRequest } from "../src/lib/data/lead-refunds";
import type { WhatsAppDelivery } from "../src/lib/data/whatsapp-deliveries";
import type { RetentionAtRiskWorker } from "../src/lib/data/retention";

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
  whatsappHealth: whatsappDeliveryHealth([], { nowMs: NOW }),
  failedDeliveries: [] as WhatsAppDelivery[],
  pendingRefunds: [] as LeadRefundRequest[],
  atRiskRenewals: [] as RetentionAtRiskWorker[],
  csvPath: "https://app.test/api/admin/revenue/surge-report?days=30",
  nowMs: NOW,
};

const failedDelivery: WhatsAppDelivery = {
  id: "wa-failed-1",
  kind: "subscription",
  provider: "whatsapp-cloud",
  recipientPhone: "+9613488191",
  notificationType: "subscription",
  status: "failed",
  attempts: 3,
  lastError: "(#131047) Re-engagement message",
  createdAt: new Date(NOW - 2 * 86_400_000).toISOString(),
  updatedAt: new Date(NOW - 86_400_000).toISOString(),
};

const pendingRefund: LeadRefundRequest = {
  id: "lref-9",
  offerId: "offer-9",
  leadId: "qr-9",
  workerId: "khaled-plum",
  reason: "unreachable",
  requestedCredits: 53,
  approvedCredits: 0,
  status: "pending",
  submittedAt: new Date(NOW - 4 * 86_400_000).toISOString(),
};

const atRiskWorker: RetentionAtRiskWorker = {
  id: "w-risk",
  nameEn: "Omar Fadel",
  nameAr: "عمر فضل",
  plan: "professional",
  daysUntilExpiry: 6,
  lastActivity: new Date(NOW - 3 * 86_400_000).toISOString(),
  hue: 40,
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

  /* ── The operational triage sections (failed / refunds / renewals) ── */

  it("renders empty sections as explicit all-clear lines", () => {
    const surge = computeSurgeReport(healthyOffers(), [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge });
    expect(digest.bodyEn).toContain("Failed WhatsApp deliveries: None");
    expect(digest.bodyEn).toContain("Pending lead refunds (review queue): None waiting");
    expect(digest.bodyEn).toContain("At-risk renewals (next 30 days): No subscriptions");
  });

  it("lists failed deliveries with phone, kind, attempts and error text", () => {
    const surge = computeSurgeReport(healthyOffers(), [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge, failedDeliveries: [failedDelivery] });
    expect(digest.bodyEn).toContain("+9613488191 · subscription · 3×");
    expect(digest.bodyEn).toContain("(#131047) Re-engagement message");
    // The HTML email carries the same item (raw text, already escaped by the
    // renderer where needed).
    expect(digest.htmlEn).toContain("+9613488191 · subscription · 3×");
    expect(digest.htmlEn).toContain("(#131047) Re-engagement message");
  });

  it("lists pending refunds oldest-first with credits and reason", () => {
    const surge = computeSurgeReport(healthyOffers(), [pendingRefund], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge, pendingRefunds: [pendingRefund] });
    expect(digest.bodyEn).toContain("lref-9 · khaled-plum · 53 credits · unreachable");
    expect(digest.htmlEn).toContain("lref-9");
  });

  it("lists at-risk renewals with plan and days left", () => {
    const surge = computeSurgeReport(healthyOffers(), [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge, atRiskRenewals: [atRiskWorker] });
    expect(digest.bodyEn).toContain("Omar Fadel · professional · 6d");
    // The Arabic body uses the worker's Arabic name.
    expect(digest.bodyAr).toContain("عمر فضل · professional · 6d");
    expect(digest.htmlAr).toContain("عمر فضل");
  });

  it("the Arabic body carries Arabic section labels", () => {
    const surge = computeSurgeReport(healthyOffers(), [], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge, failedDeliveries: [failedDelivery] });
    expect(digest.bodyAr).toContain("رسائل واتساب الفاشلة");
    expect(digest.bodyAr).toContain("استردادات عملاء معلّقة");
    expect(digest.bodyAr).toContain("تجديدات معرّضة للخطر");
  });

  it("HTML bodies are complete documents-in-a-div with both sections and the CSV link", () => {
    const surge = computeSurgeReport(healthyOffers(), [pendingRefund], { nowMs: NOW });
    const digest = buildAdminWeeklyDigest({ ...baseInput, surge, pendingRefunds: [pendingRefund] });
    for (const html of [digest.htmlEn, digest.htmlAr]) {
      expect(html).toContain("<div style=");
      expect(html).toContain(baseInput.csvPath);
      expect(html).toContain("<ul>");
    }
  });
});
