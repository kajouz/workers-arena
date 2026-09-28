import { beforeEach, describe, expect, it } from "vitest";
import {
  allowanceExpiry,
  allowanceMonth,
  monthlyAllowanceCredits,
  planIsActive,
  previousAllowanceMonth,
  type AllowanceWorker,
} from "../src/lib/data/lead-allowance";
import { runMonthlyLeadAllowance } from "../src/lib/data/lead-allowance-run";
import { getWorkerCreditBalance, grantCredits, listCreditLedger, resetCreditLedgerStore, spendCredits } from "../src/lib/data/credit-ledger";
import { normalizePlanCatalogOverrides } from "../src/lib/data/plan-catalog-overrides";

const OCT_1 = Date.parse("2026-10-01T00:10:00Z");
const NOV_1 = Date.parse("2026-11-01T00:10:00Z");

function worker(id: string, plan: AllowanceWorker["subscription"]["plan"], expiresAt = "2027-01-01T00:00:00Z", status = "active"): AllowanceWorker {
  return { id, subscription: { plan, status, expiresAt } };
}

describe("lead allowance — pure rules", () => {
  it("pays included leads at the lead price, and nothing for zero or unlimited", () => {
    expect(monthlyAllowanceCredits(3, 5)).toBe(15);
    expect(monthlyAllowanceCredits(0, 5)).toBe(0);
    expect(monthlyAllowanceCredits(-1, 5)).toBe(0);
  });

  it("keys months in UTC and steps back across a year", () => {
    expect(allowanceMonth(OCT_1)).toBe("2026-10");
    expect(previousAllowanceMonth("2026-01")).toBe("2025-12");
  });

  it("treats an expired or past-dated plan as inactive", () => {
    expect(planIsActive({ status: "active", expiresAt: "2027-01-01T00:00:00Z" }, OCT_1)).toBe(true);
    expect(planIsActive({ status: "active", expiresAt: "2026-09-01T00:00:00Z" }, OCT_1)).toBe(false);
    expect(planIsActive({ status: "expired", expiresAt: "2027-01-01T00:00:00Z" }, OCT_1)).toBe(false);
  });

  it("expires only the unspent allowance, never more than the balance held", () => {
    expect(allowanceExpiry({ previousGrant: 15, spentAfterPreviousGrant: 5, balanceAtPreviousMonthEnd: 60, balance: 60 })).toBe(10);
    expect(allowanceExpiry({ previousGrant: 15, spentAfterPreviousGrant: 20, balanceAtPreviousMonthEnd: 30, balance: 30 })).toBe(0);
    expect(allowanceExpiry({ previousGrant: 15, spentAfterPreviousGrant: 0, balanceAtPreviousMonthEnd: 15, balance: 4 })).toBe(4);
  });

  it("maps a legacy 'unlimited' Business setting to the finite default", () => {
    const catalog = normalizePlanCatalogOverrides({ plans: { enterprise: { includedLeads: -1 } } });
    expect(catalog.plans.enterprise.includedLeads).toBe(60);
  });
});

describe("lead allowance — monthly run on the credit ledger", () => {
  beforeEach(() => resetCreditLedgerStore());

  it("grants each active plan once a month at the bronze price (Starter 3 × 5 = 15)", async () => {
    const run = await runMonthlyLeadAllowance([worker("w-starter", "basic"), worker("w-business", "enterprise")], OCT_1);
    expect(run).toMatchObject({ month: "2026-10", workersGranted: 2, creditsGranted: 15 + 300 });
    // A second run the same month changes nothing.
    await runMonthlyLeadAllowance([worker("w-starter", "basic")], OCT_1 + 3_600_000);
    expect((await getWorkerCreditBalance("w-starter")).balance).toBe(15);
  });

  it("next month: expires the unspent allowance only, keeps bought credits, grants again", async () => {
    const w = worker("w1", "basic");
    await runMonthlyLeadAllowance([w], OCT_1);
    await spendCredits({ workerId: "w1", amount: 5, reason: "Lead", offerId: "offer-1", at: "2026-10-10T00:00:00Z" });
    await grantCredits({ workerId: "w1", amount: 50, reason: "Bought credits", at: "2026-10-12T00:00:00Z" });

    const run = await runMonthlyLeadAllowance([w], NOV_1);
    expect(run).toMatchObject({ month: "2026-11", creditsExpired: 10, creditsGranted: 15 });
    expect((await getWorkerCreditBalance("w1")).balance).toBe(50 + 15);

    // A later run in November, after the worker bought more, touches nothing.
    await grantCredits({ workerId: "w1", amount: 25, reason: "Bought credits", at: "2026-11-15T00:00:00Z" });
    const again = await runMonthlyLeadAllowance([w], Date.parse("2026-11-20T00:10:00Z"));
    expect(again).toMatchObject({ creditsExpired: 0, creditsGranted: 0 });
    expect((await getWorkerCreditBalance("w1")).balance).toBe(90);
  });

  it("a lapsed plan loses last month's leftover and gets no new allowance", async () => {
    await runMonthlyLeadAllowance([worker("w2", "professional")], OCT_1);
    const lapsed = worker("w2", "professional", "2026-10-20T00:00:00Z");
    const run = await runMonthlyLeadAllowance([lapsed], NOV_1);
    expect(run).toMatchObject({ creditsExpired: 50, creditsGranted: 0 });
    expect((await getWorkerCreditBalance("w2")).balance).toBe(0);
    const rows = await listCreditLedger(10, "w2");
    expect(rows.map((r) => r.kind).sort()).toEqual(["expire", "grant"]);
  });
});
