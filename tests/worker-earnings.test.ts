import { describe, expect, it } from "vitest";
import {
  computeEarningsStatement,
  type EarningsMonth,
  type EarningsStatementInput,
} from "../src/lib/data/worker-earnings";
import type { Booking } from "../src/lib/data/types";
import type { LeadRebate } from "../src/lib/data/lead-rebate";

const MONTH: EarningsMonth = {
  key: "2026-09",
  startIso: "2026-09-01T00:00:00.000Z",
  endIso: "2026-10-01T00:00:00.000Z",
};

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: `bk-${Math.random().toString(36).slice(2, 6)}`,
    number: `BK-${1000 + Math.floor(Math.random() * 9000)}`,
    workerId: "w1",
    customerName: "Test Customer",
    customerPhone: "+961 70 000 000",
    jobTitle: "Test job",
    status: "completed",
    currency: "USD",
    events: [],
    ...overrides,
  };
}

function makeRebate(overrides: Partial<LeadRebate> = {}): LeadRebate {
  return {
    id: `rebate-${Math.random().toString(36).slice(2, 6)}`,
    bookingId: "bk-1",
    leadId: "lead-1",
    offerId: "offer-1",
    workerId: "w1",
    leadCostCredits: 5,
    leadCostMinor: 500,
    feeMinor: 2100,
    rebateMinor: 500,
    effectiveFeeMinor: 1600,
    pctBps: 10_000,
    maxMinor: null,
    limitedBy: "lead-cost",
    ruleId: "rule-1",
    ruleVersion: 1,
    currency: "USD",
    createdAt: "2026-09-05T10:00:00Z",
    ...overrides,
  };
}

describe("worker earnings statement engine", () => {
  it("returns empty statement for no data", () => {
    const stmt = computeEarningsStatement({
      bookings: [],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.completedCount).toBe(0);
    expect(stmt.gmvMinor).toBe(0);
    expect(stmt.netEarningsMinor).toBe(0);
    expect(stmt.completedJobs).toHaveLength(0);
  });

  it("counts completed jobs in the window", () => {
    const booking = makeBooking({
      quote: 10_000,
      platformFee: 700,
      events: [
        { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [booking],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.completedCount).toBe(1);
    expect(stmt.gmvMinor).toBe(10_000);
    expect(stmt.feesMinor).toBe(700);
    expect(stmt.effectiveFeesMinor).toBe(700);
    expect(stmt.netEarningsMinor).toBe(9_300);
  });

  it("excludes jobs completed outside the window", () => {
    const booking = makeBooking({
      quote: 10_000,
      events: [
        { status: "completed", actorType: "system", time: "2026-08-20T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [booking],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.completedCount).toBe(0);
  });

  it("applies lead rebates to effective fees", () => {
    const booking = makeBooking({
      id: "bk-1",
      quote: 30_000,
      platformFee: 2_100,
      leadRebateMinor: 500,
      quoteRequestId: "lead-1",
      events: [
        { status: "completed", actorType: "system", time: "2026-09-10T14:00:00Z" },
      ],
    });
    const rebate = makeRebate({ bookingId: "bk-1" });
    const stmt = computeEarningsStatement({
      bookings: [booking],
      rebates: [rebate],
      month: MONTH,
    });
    expect(stmt.feesMinor).toBe(2_100);
    expect(stmt.rebatesMinor).toBe(500);
    expect(stmt.effectiveFeesMinor).toBe(1_600);
    expect(stmt.netEarningsMinor).toBe(28_400);
  });

  it("tracks GMV from leads separately", () => {
    const leadBooking = makeBooking({
      quote: 20_000,
      platformFee: 1_400,
      quoteRequestId: "lead-1",
      events: [
        { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
      ],
    });
    const directBooking = makeBooking({
      quote: 15_000,
      platformFee: 1_050,
      events: [
        { status: "completed", actorType: "system", time: "2026-09-08T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [leadBooking, directBooking],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.gmvMinor).toBe(35_000);
    expect(stmt.gmvFromLeadsMinor).toBe(20_000);
  });

  it("computes effective fee rate in basis points", () => {
    const booking = makeBooking({
      quote: 100_000,
      platformFee: 7_000,
      events: [
        { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [booking],
      rebates: [],
      month: MONTH,
    });
    // 7000 / 100000 = 7% = 700 bps
    expect(stmt.effectiveFeeRateBps).toBe(700);
  });

  it("computes average earnings per job", () => {
    const b1 = makeBooking({
      quote: 10_000,
      platformFee: 700,
      events: [
        { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
      ],
    });
    const b2 = makeBooking({
      quote: 20_000,
      platformFee: 1_400,
      events: [
        { status: "completed", actorType: "system", time: "2026-09-10T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [b1, b2],
      rebates: [],
      month: MONTH,
    });
    // net = (10000-700) + (20000-1400) = 9300 + 18600 = 27900
    // avg = 27900 / 2 = 13950
    expect(stmt.avgEarningsPerJobMinor).toBe(13_950);
  });

  it("sorts completed jobs by completedAt descending", () => {
    const b1 = makeBooking({
      jobTitle: "Early job",
      events: [
        { status: "completed", actorType: "system", time: "2026-09-02T14:00:00Z" },
      ],
    });
    const b2 = makeBooking({
      jobTitle: "Late job",
      events: [
        { status: "completed", actorType: "system", time: "2026-09-20T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [b1, b2],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.completedJobs[0].jobTitle).toBe("Late job");
    expect(stmt.completedJobs[1].jobTitle).toBe("Early job");
  });

  it("marks jobs as fromLead when quoteRequestId is set", () => {
    const booking = makeBooking({
      quoteRequestId: "lead-1",
      events: [
        { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [booking],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.completedJobs[0].fromLead).toBe(true);
  });

  it("handles missing platformFee gracefully", () => {
    const booking = makeBooking({
      quote: 10_000,
      platformFee: undefined,
      events: [
        { status: "completed", actorType: "system", time: "2026-09-05T14:00:00Z" },
      ],
    });
    const stmt = computeEarningsStatement({
      bookings: [booking],
      rebates: [],
      month: MONTH,
    });
    expect(stmt.feesMinor).toBe(0);
    expect(stmt.netEarningsMinor).toBe(10_000);
  });
});
