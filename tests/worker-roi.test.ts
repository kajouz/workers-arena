import { describe, expect, it } from "vitest";
import type { LeadOffer } from "../src/lib/data/lead-market";
import type { Booking } from "../src/lib/data/types";
import {
  roiMonthKeyOf,
  roiMonthWindow,
  shiftRoiMonth,
  recentRoiMonthKeys,
  quoteSentAt,
  jobWonAt,
  jobCompletedAt,
  computeWorkerRoi,
  emptyWorkerRoi,
  totalWorkerRoi,
  type WorkerRoiInput,
  type RoiMonth,
} from "../src/lib/data/worker-roi";

/* ─── helpers ─── */

const MONTH: RoiMonth = { key: "2026-09", startIso: "2026-09-01T00:00:00.000Z", endIso: "2026-10-01T00:00:00.000Z" };
const PREV: RoiMonth = { key: "2026-08", startIso: "2026-08-01T00:00:00.000Z", endIso: "2026-09-01T00:00:00.000Z" };

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: `bk-${Math.random().toString(36).slice(2, 6)}`,
    number: `BK-${1000 + Math.floor(Math.random() * 9000)}`,
    workerId: "w1",
    customerId: undefined,
    customerName: "Test Customer",
    customerPhone: "+961 70 000 000",
    jobTitle: "Test job",
    status: "requested",
    quote: undefined,
    platformFee: undefined,
    platformFeeRateBps: undefined,
    leadRebateMinor: 0,
    currency: "USD",
    events: [],
    ...overrides,
  };
}

function makeOffer(overrides: Partial<LeadOffer> = {}): LeadOffer {
  return {
    id: `offer-${Math.random().toString(36).slice(2, 6)}`,
    leadId: "lead-1",
    leadNumber: "QR-001",
    workerId: "w1",
    grade: "bronze",
    matchScore: 50,
    priceCredits: 5,
    status: "purchased" as const,
    exclusive: true,
    offeredAt: "2026-09-01T12:00:00.000Z",
    expiresAt: "2026-09-02T12:00:00.000Z",
    purchasedAt: "2026-09-01T13:00:00.000Z",
    creditEntryId: "cred-1",
    contactReveal: "revealed",
    ...overrides,
  };
}

/* ─── tests ─── */

describe("worker ROI engine", () => {
  describe("roiMonthKeyOf", () => {
    it("returns YYYY-MM for a UTC date", () => {
      expect(roiMonthKeyOf(new Date("2026-09-15T00:00:00Z"))).toBe("2026-09");
    });

    it("wraps to next month for last-day boundary", () => {
      expect(roiMonthKeyOf(new Date("2026-08-31T23:59:59Z"))).toBe("2026-08");
    });

    it("handles Jan → Dec rollover", () => {
      expect(roiMonthKeyOf(new Date("2027-01-01T00:00:00Z"))).toBe("2027-01");
    });
  });

  describe("roiMonthWindow", () => {
    it("parses a valid key", () => {
      const w = roiMonthWindow("2026-09");
      expect(w).not.toBeNull();
      expect(w!.startIso).toBe("2026-09-01T00:00:00.000Z");
      expect(w!.endIso).toBe("2026-10-01T00:00:00.000Z");
    });

    it("returns null for malformed key", () => {
      expect(roiMonthWindow("2026-13")).toBeNull(); // month 13
      expect(roiMonthWindow("abc")).toBeNull();
      expect(roiMonthWindow("2026-0")).toBeNull();
    });

    it("handles year boundaries", () => {
      const w = roiMonthWindow("2027-01");
      expect(w!.startIso).toBe("2027-01-01T00:00:00.000Z");
      expect(w!.endIso).toBe("2027-02-01T00:00:00.000Z");
    });
  });

  describe("shiftRoiMonth", () => {
    it("shifts forward", () => {
      expect(shiftRoiMonth("2026-09", 1)).toBe("2026-10");
    });

    it("shifts backward", () => {
      expect(shiftRoiMonth("2026-09", -1)).toBe("2026-08");
    });

    it("crosses year boundary forward", () => {
      expect(shiftRoiMonth("2026-12", 1)).toBe("2027-01");
    });

    it("crosses year boundary backward", () => {
      expect(shiftRoiMonth("2027-01", -1)).toBe("2026-12");
    });

    it("returns original for invalid key", () => {
      expect(shiftRoiMonth("abc", 1)).toBe("abc");
    });
  });

  describe("recentRoiMonthKeys", () => {
    it("returns 6 months by default", () => {
      const keys = recentRoiMonthKeys("2026-09");
      expect(keys).toHaveLength(6);
      expect(keys[0]).toBe("2026-04");
      expect(keys[5]).toBe("2026-09");
    });

    it("clamps count to 1 minimum", () => {
      expect(recentRoiMonthKeys("2026-09", 0)).toHaveLength(1);
    });

    it("handles count > 1", () => {
      const keys = recentRoiMonthKeys("2026-09", 3);
      expect(keys).toEqual(["2026-07", "2026-08", "2026-09"]);
    });
  });

  describe("event date extractors", () => {
    it("quoteSentAt returns null when no quote", () => {
      expect(quoteSentAt(makeBooking({ quote: undefined }))).toBeNull();
    });

    it("quoteSentAt finds the first matching event", () => {
      const b = makeBooking({
        quote: 5000,
        events: [
          { status: "requested", actorType: "system", time: "2026-09-01T10:00:00Z" },
          { status: "quoted", actorType: "worker", time: "2026-09-01T11:00:00Z" },
        ],
      });
      expect(quoteSentAt(b)).toBe("2026-09-01T11:00:00Z");
    });

    it("jobWonAt returns null when not won", () => {
      const b = makeBooking({ status: "requested" });
      expect(jobWonAt(b)).toBeNull();
    });

    it("jobWonAt finds pendingPayment event", () => {
      const b = makeBooking({
        events: [
          { status: "requested", actorType: "system", time: "2026-09-01T10:00:00Z" },
          { status: "pendingPayment", actorType: "customer", time: "2026-09-01T12:00:00Z" },
        ],
      });
      expect(jobWonAt(b)).toBe("2026-09-01T12:00:00Z");
    });

    it("jobCompletedAt returns null when not completed", () => {
      const b = makeBooking({ status: "confirmed" });
      expect(jobCompletedAt(b)).toBeNull();
    });

    it("jobCompletedAt finds completed event", () => {
      const b = makeBooking({
        events: [
          { status: "confirmed", actorType: "customer", time: "2026-09-01T12:00:00Z" },
          { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
        ],
      });
      expect(jobCompletedAt(b)).toBe("2026-09-05T14:00:00Z");
    });
  });

  describe("computeWorkerRoi", () => {
    it("returns all zeros for empty input", () => {
      const roi = computeWorkerRoi({ offers: [], bookings: [], month: MONTH });
      expect(roi.leadsBought).toBe(0);
      expect(roi.quotesSent).toBe(0);
      expect(roi.jobsWon).toBe(0);
      expect(roi.gmvMinor).toBe(0);
      expect(roi.returnMultiple).toBeNull();
      expect(roi.netMultiple).toBeNull();
    });

    it("counts leads bought in the window", () => {
      const roi = computeWorkerRoi({
        offers: [makeOffer(), makeOffer({ purchasedAt: "2026-08-15T10:00:00Z" })],
        bookings: [],
        month: MONTH,
      });
      // Only one purchased in September
      expect(roi.leadsBought).toBe(1);
      expect(roi.leadSpendCredits).toBe(5);
      expect(roi.leadSpendMinor).toBe(500);
    });

    it("attributes bookings to the correct month", () => {
      const booking = makeBooking({
        quote: 10_000,
        platformFee: 700,
        events: [
          { status: "pendingPayment", actorType: "customer", time: "2026-09-03T10:00:00Z" },
          { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({ offers: [], bookings: [booking], month: MONTH });
      expect(roi.jobsWon).toBe(1);
      expect(roi.jobsCompleted).toBe(1);
      expect(roi.gmvMinor).toBe(10_000);
      expect(roi.feesMinor).toBe(700);
      expect(roi.earningsMinor).toBe(9_300);
    });

    it("does not count cross-month bookings", () => {
      const booking = makeBooking({
        quote: 10_000,
        events: [
          { status: "completed", actorType: "system", time: "2026-08-20T14:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({ offers: [], bookings: [booking], month: MONTH });
      expect(roi.jobsCompleted).toBe(0);
      expect(roi.gmvMinor).toBe(0);
    });

    it("computes subscription cost monthly for annual plans", () => {
      const roi = computeWorkerRoi({
        offers: [],
        bookings: [],
        month: MONTH,
        subscription: {
          plan: "professional",
          priceMinor: 12_000, // $120/year
          periodMonths: 12,
          startedAt: "2026-01-01T00:00:00Z",
          expiresAt: "2027-01-01T00:00:00Z",
        },
      });
      expect(roi.subscriptionCostMinor).toBe(1000); // $120/12 = $10/month
      expect(roi.subscriptionPaidMinor).toBe(0); // not renewed this month
    });

    it("records full payment when subscription starts this month", () => {
      const roi = computeWorkerRoi({
        offers: [],
        bookings: [],
        month: MONTH,
        subscription: {
          plan: "professional",
          priceMinor: 12_000,
          periodMonths: 12,
          startedAt: "2026-09-10T00:00:00Z",
          expiresAt: "2027-09-10T00:00:00Z",
        },
      });
      expect(roi.subscriptionPaidMinor).toBe(12_000);
      expect(roi.subscriptionCostMinor).toBe(1000); // still monthly equivalent
    });

    it("no subscription cost when term does not overlap", () => {
      const roi = computeWorkerRoi({
        offers: [],
        bookings: [],
        month: MONTH,
        subscription: {
          plan: "professional",
          priceMinor: 5_000,
          periodMonths: 1,
          startedAt: "2026-07-01T00:00:00Z",
          expiresAt: "2026-08-01T00:00:00Z",
        },
      });
      expect(roi.subscriptionCostMinor).toBe(0);
    });

    it("computes return multiple = gmv / total spend", () => {
      const booking = makeBooking({
        quote: 50_000,
        events: [
          { status: "completed", actorType: "system", time: "2026-09-10T14:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({
        offers: [makeOffer({ priceCredits: 10 })], // $10 lead spend
        bookings: [booking],
        month: MONTH,
        subscription: {
          plan: "professional",
          priceMinor: 2_000, // $20/month
          periodMonths: 1,
          startedAt: "2026-09-01T00:00:00Z",
          expiresAt: "2026-10-01T00:00:00Z",
        },
      });
      // totalSpend = $10 (leads) + $20 (sub) = $30
      expect(roi.totalSpendMinor).toBe(3000);
      // returnMultiple = 50000 / 3000 = 16.67
      expect(roi.returnMultiple).toBe(16.67);
    });

    it("computes net multiple = earnings / total spend", () => {
      const booking = makeBooking({
        quote: 50_000,
        platformFee: 3_500,
        events: [
          { status: "completed", actorType: "system", time: "2026-09-10T14:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({
        offers: [makeOffer({ priceCredits: 10 })],
        bookings: [booking],
        month: MONTH,
        subscription: {
          plan: "professional",
          priceMinor: 2_000,
          periodMonths: 1,
          startedAt: "2026-09-01T00:00:00Z",
          expiresAt: "2026-10-01T00:00:00Z",
        },
      });
      // earnings = 50000 - 3500 = 46500
      expect(roi.earningsMinor).toBe(46_500);
      // netMultiple = 46500 / 3000 = 15.5
      expect(roi.netMultiple).toBe(15.5);
    });

    it("applies lead rebate to effective fees", () => {
      const booking = makeBooking({
        quote: 30_000,
        platformFee: 2_100,
        leadRebateMinor: 500,
        events: [
          { status: "completed", actorType: "system", time: "2026-09-10T14:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({ offers: [], bookings: [booking], month: MONTH });
      expect(roi.feesMinor).toBe(2_100);
      expect(roi.rebatesMinor).toBe(500);
      expect(roi.effectiveFeesMinor).toBe(1_600);
      expect(roi.earningsMinor).toBe(28_400); // 30000 - 1600
    });

    it("counts pipeline gmv for jobs won but not completed", () => {
      const booking = makeBooking({
        quote: 20_000,
        events: [
          { status: "pendingPayment", actorType: "customer", time: "2026-09-03T10:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({ offers: [], bookings: [booking], month: MONTH });
      expect(roi.jobsWon).toBe(1);
      expect(roi.jobsCompleted).toBe(0);
      expect(roi.pipelineGmvMinor).toBe(20_000);
      expect(roi.gmvMinor).toBe(0);
    });

    it("computes win rate and lead win rate", () => {
      const b1 = makeBooking({
        quote: 5000,
        events: [
          { status: "pendingPayment", actorType: "customer", time: "2026-09-03T10:00:00Z" },
          { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
        ],
      });
      const b2 = makeBooking({
        quote: 3000,
        events: [
          { status: "quoted", actorType: "worker", time: "2026-09-04T10:00:00Z" },
        ],
      });
      const roi = computeWorkerRoi({ offers: [], bookings: [b1, b2], month: MONTH });
      expect(roi.quotesSent).toBe(2);
      expect(roi.jobsWon).toBe(1);
      expect(roi.winRatePct).toBe(50); // 1/2 = 50%
    });

    it("tracks leads by grade breakdown", () => {
      const roi = computeWorkerRoi({
        offers: [
          makeOffer({ grade: "bronze", priceCredits: 5 }),
          makeOffer({ grade: "bronze", priceCredits: 5 }),
          makeOffer({ grade: "gold", priceCredits: 20 }),
        ],
        bookings: [],
        month: MONTH,
      });
      expect(roi.leadsBought).toBe(3);
      expect(roi.leadsBoughtByGrade.bronze).toBe(2);
      expect(roi.leadsBoughtByGrade.gold).toBe(1);
      expect(roi.leadSpendCredits).toBe(30); // 5+5+20
    });

    it("excludes non-purchased offers", () => {
      const roi = computeWorkerRoi({
        offers: [
          makeOffer({ status: "offered" }),
          makeOffer({ status: "expired" }),
          makeOffer({ status: "revoked" }),
        ],
        bookings: [],
        month: MONTH,
      });
      expect(roi.leadsBought).toBe(0);
      expect(roi.leadSpendCredits).toBe(0);
    });
  });

  describe("emptyWorkerRoi", () => {
    it("returns a zeroed ROI for the given month", () => {
      const roi = emptyWorkerRoi(MONTH);
      expect(roi.month.key).toBe("2026-09");
      expect(roi.leadsBought).toBe(0);
      expect(roi.returnMultiple).toBeNull();
    });
  });

  describe("totalWorkerRoi", () => {
    it("sums multiple months", () => {
      const a = computeWorkerRoi({
        offers: [makeOffer({ priceCredits: 5 })],
        bookings: [],
        month: MONTH,
      });
      const b = computeWorkerRoi({
        offers: [makeOffer({ priceCredits: 10, purchasedAt: "2026-08-15T10:00:00Z" })],
        bookings: [],
        month: PREV,
      });
      const total = totalWorkerRoi([a, b]);
      expect(total.leadSpendCredits).toBe(15);
      expect(total.leadsBought).toBe(2);
    });
  });
});
