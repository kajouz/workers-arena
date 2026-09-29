import { describe, expect, it } from "vitest";
import { pct, weekStartMs, weeklyNumbers, weeklyNumbersCsvRows, type WeeklyNumbersInput } from "../src/lib/data/weekly-numbers";
import type { Settlement } from "../src/lib/data/booking-settlement";
import type { ReconciliationPayment } from "../src/lib/data/types";

// Wednesday 2026-09-30 12:00 UTC → the current week starts Monday 2026-09-28.
const NOW = Date.parse("2026-09-30T12:00:00Z");

function payment(over: Partial<ReconciliationPayment>): ReconciliationPayment {
  return {
    id: "pay",
    scope: "subscription",
    entityId: "w1",
    labelEn: "",
    labelAr: "",
    amount: 3900,
    currency: "USD",
    method: "omt",
    reference: "OMT-1",
    status: "paid",
    createdAt: "2026-09-29T08:00:00Z",
    paidAt: "2026-09-29T09:00:00Z",
    ...over,
  };
}

function settlement(over: Partial<Settlement>): Settlement {
  return {
    state: "funded",
    currency: "USD",
    jobValueMinor: 20000,
    collectedMinor: 20000,
    outstandingMinor: 0,
    feeMinor: 1400,
    feeCollectedMinor: 1400,
    workerNetTargetMinor: 18600,
    feeClaimMinor: 0,
    feeClaimCollectedMinor: 0,
    feeClaimOutstandingMinor: 0,
    reason: "",
    ...over,
  };
}

const empty: WeeklyNumbersInput = { payments: [], jobs: [], subscriptionEvents: [], workers: [], bookings: [] };

describe("weekStartMs", () => {
  it("snaps to Monday 00:00 UTC, including on a Sunday", () => {
    expect(new Date(weekStartMs(NOW)).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(new Date(weekStartMs(Date.parse("2026-09-27T23:59:00Z"))).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("weeklyNumbers", () => {
  it("returns the requested weeks newest first, only the current one partial", () => {
    const sheet = weeklyNumbers(empty, NOW, 3);
    expect(sheet.weeks.map((w) => w.weekStart)).toEqual(["2026-09-28", "2026-09-21", "2026-09-14"]);
    expect(sheet.weeks.map((w) => w.partial)).toEqual([true, false, false]);
  });

  it("counts purchase revenue on its confirm date, nets refunds on theirs, and never counts booking legs", () => {
    const sheet = weeklyNumbers(
      {
        ...empty,
        payments: [
          payment({ id: "a", scope: "subscription", amount: 3900 }),
          payment({ id: "b", scope: "credit", amount: 2500, paidAt: "2026-09-22T10:00:00Z", createdAt: "2026-09-22T09:00:00Z" }),
          payment({ id: "c", scope: "campaign", amount: 5000, status: "refunded", refundedAt: "2026-09-29T12:00:00Z" }),
          payment({ id: "d", scope: "booking", amount: 9900 }),
          payment({ id: "e", scope: "featured", status: "pending", paidAt: undefined }),
        ],
      },
      NOW,
      2
    );
    const [current, previous] = sheet.weeks;
    expect(current!.revenueMinor.subscription).toBe(3900);
    expect(current!.revenueMinor.campaign).toBe(0); // paid and refunded the same week
    expect(current!.totalRevenueMinor).toBe(3900);
    expect(previous!.revenueMinor.credit).toBe(2500);
    // The booking deposit is workload (a confirmation) but not revenue.
    expect(current!.paymentsConfirmed).toBe(3);
  });

  it("measures confirmation speed against the 2-hour target", () => {
    const sheet = weeklyNumbers(
      {
        ...empty,
        payments: [
          payment({ id: "fast", createdAt: "2026-09-29T08:00:00Z", paidAt: "2026-09-29T09:00:00Z" }),
          payment({ id: "slow", createdAt: "2026-09-28T08:00:00Z", paidAt: "2026-09-29T08:00:00Z" }),
          payment({ id: "open-new", status: "pending", paidAt: undefined, createdAt: "2026-09-30T11:00:00Z" }),
          payment({ id: "open-old", status: "pending", paidAt: undefined, createdAt: "2026-09-30T06:00:00Z" }),
        ],
      },
      NOW,
      1
    );
    const [week] = sheet.weeks;
    expect(week!.paymentsConfirmed).toBe(2);
    expect(week!.confirmedWithinTarget).toBe(1);
    expect(week!.medianConfirmHours).toBe(12.5); // (1h + 24h) / 2
    expect(sheet.pendingPayments).toBe(2);
    expect(sheet.pendingOverTarget).toBe(1);
  });

  it("puts commission on the week the job finished and separates cash jobs", () => {
    const sheet = weeklyNumbers(
      {
        ...empty,
        jobs: [
          { completedAt: "2026-09-29T10:00:00Z", settlement: settlement({}) },
          {
            completedAt: "2026-09-29T11:00:00Z",
            settlement: settlement({
              state: "outside-platform",
              collectedMinor: 0,
              feeMinor: 1400,
              feeCollectedMinor: 0,
              feeClaimMinor: 1400,
              feeClaimCollectedMinor: 500,
            }),
          },
          { completedAt: undefined, settlement: settlement({}) }, // not finished yet
        ],
      },
      NOW,
      1
    );
    const [week] = sheet.weeks;
    expect(week!.jobsCompleted).toBe(2);
    expect(week!.jobsPaidOutside).toBe(1);
    expect(week!.commissionRecordedMinor).toBe(2800);
    expect(week!.commissionCollectedMinor).toBe(1900);
    expect(week!.totalRevenueMinor).toBe(1900);
  });

  it("tallies renewals, lapses and trials, and counts a quote request once", () => {
    const at = (time: string) => [{ status: "requested" as const, actorType: "customer", time }];
    const sheet = weeklyNumbers(
      {
        ...empty,
        subscriptionEvents: [
          { type: "renewed", createdAt: "2026-09-29T00:00:00Z" },
          { type: "expired", createdAt: "2026-09-29T00:00:00Z" },
          { type: "cancelled", createdAt: "2026-09-29T00:00:00Z" },
          { type: "trial_started", createdAt: "2026-09-29T00:00:00Z" },
          { type: "plan_changed", createdAt: "2026-09-29T00:00:00Z" },
        ],
        bookings: [
          { id: "b1", events: at("2026-09-29T10:00:00Z") },
          { id: "b2", quoteRequestId: "q1", events: at("2026-09-29T11:00:00Z") },
          { id: "b3", quoteRequestId: "q1", events: at("2026-09-29T11:00:00Z") },
          { id: "b4", events: at("2026-08-01T10:00:00Z") }, // outside the window
        ],
      },
      NOW,
      1
    );
    const [week] = sheet.weeks;
    expect(week!.renewals).toBe(1);
    expect(week!.lapses).toBe(2);
    expect(week!.trialsStarted).toBe(1);
    expect(week!.customerRequests).toBe(2);
  });

  it("counts only unexpired plans as active", () => {
    const sheet = weeklyNumbers(
      {
        ...empty,
        workers: [
          { subscription: { status: "active", expiresAt: "2026-10-30T00:00:00Z" } },
          { subscription: { status: "active", expiresAt: "2026-09-01T00:00:00Z" } },
          { subscription: { status: "expired", expiresAt: "2026-12-01T00:00:00Z" } },
        ],
      },
      NOW
    );
    expect(sheet.activePlans).toBe(1);
  });
});

describe("weeklyNumbersCsvRows", () => {
  it("writes dollars and blank shares where there is nothing to divide", () => {
    const rows = weeklyNumbersCsvRows(weeklyNumbers({ ...empty, payments: [payment({})] }, NOW, 1));
    const header = rows[0]!;
    const row = rows[1]!;
    expect(row[header.indexOf("total_revenue_usd")]).toBe("39.00");
    expect(row[header.indexOf("cash_share_pct")]).toBe("");
    expect(row[header.indexOf("confirmed_within_2h_pct")]).toBe(100);
    expect(pct(1, 3)).toBe(33);
  });
});
