import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

import {
  creditFundsFrom,
  getWorkerCreditBalance,
  grantCredits,
  listCreditLedger,
  resetCreditLedgerStore,
  spendCredits,
  topUpGrantsFor,
  type CreditLedgerEntry,
} from "../src/lib/data/credit-ledger";
import { runMonthlyLeadAllowance } from "../src/lib/data/lead-allowance-run";
import { resetFeeRuleStore } from "../src/lib/data/fee-rules-store";
import { confirmPurchase, createPurchaseCheckout, getWorkerBySlug } from "../src/lib/data/repo";
import { demoPendingManualPurchases, resetPurchaseStore } from "../src/lib/data/purchases";
import { resetBookingsStore } from "../src/lib/data/bookings";
import { resetAdminActivityFeed } from "../src/lib/data/activity";

// The prepaid wallet (revenue plan Step 2): one ledger, two pots. PAID credits
// are money the worker topped up and pay for anything; FREE credits were given
// and buy leads only. Lead purchases spend free first.

const DEMO_WORKER = "khaled-al-harbi-plumbing";
let activityFile: string;

beforeEach(() => {
  resetCreditLedgerStore();
  resetFeeRuleStore();
  resetBookingsStore();
  resetPurchaseStore();
  activityFile = path.join(tmpdir(), `wallet-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.unstubAllEnvs();
});

function row(over: Partial<CreditLedgerEntry> & Pick<CreditLedgerEntry, "amount" | "createdAt">): CreditLedgerEntry {
  return { id: over.createdAt, workerId: "w", kind: "grant", balanceAfter: 0, reason: "", ...over };
}

describe("creditFundsFrom — replaying rows into the two pots", () => {
  it("lead purchases spend free credits first, then paid", () => {
    const funds = creditFundsFrom([
      row({ amount: 20, fund: "paid", createdAt: "2026-10-01" }),
      row({ amount: 5, fund: "free", createdAt: "2026-10-02" }),
      row({ amount: -9, kind: "spend", fund: "any", createdAt: "2026-10-03" }),
    ]);
    expect(funds).toEqual({ paid: 16, free: 0 });
  });

  it("a paid debit never touches free credits, an expiry never touches paid", () => {
    const funds = creditFundsFrom([
      row({ amount: 20, fund: "paid", createdAt: "2026-10-01" }),
      row({ amount: 15, fund: "free", createdAt: "2026-10-02" }),
      row({ amount: -12, kind: "spend", fund: "paid", createdAt: "2026-10-03" }),
      row({ amount: -15, kind: "expire", fund: "free", createdAt: "2026-10-04" }),
    ]);
    expect(funds).toEqual({ paid: 8, free: 0 });
  });

  it("rows written before the wallet read as free grants and 'any' spends", () => {
    const funds = creditFundsFrom([
      row({ amount: 10, createdAt: "2026-09-01" }),
      row({ amount: -4, kind: "spend", createdAt: "2026-09-02" }),
    ]);
    expect(funds).toEqual({ paid: 0, free: 6 });
  });
});

describe("topUpGrantsFor", () => {
  it("puts the pack's credits in paid and its bonus in free, keyed on the payment", () => {
    const grants = topUpGrantsFor({ workerId: "w", paymentId: "pay-1", amountMinor: 2500, credits: 25, bonusCredits: 5 });
    expect(grants).toMatchObject([
      { amount: 25, fund: "paid", promotionId: "topup:pay-1" },
      { amount: 5, fund: "free", promotionId: "topup-bonus:pay-1" },
    ]);
  });

  it("falls back to amount / 100 paid credits for a payment minted before packs", () => {
    expect(topUpGrantsFor({ workerId: "w", paymentId: "old", amountMinor: 1000 })).toMatchObject([{ amount: 10, fund: "paid" }]);
  });
});

describe("spending from the wallet", () => {
  it("a paid-only charge refuses free credits and is charged once per key", async () => {
    await grantCredits({ workerId: "w1", amount: 50, fund: "free", reason: "Allowance" });
    expect(await spendCredits({ workerId: "w1", amount: 10, fund: "paid", reason: "Renewal", promotionId: "wallet:pay-9" })).toEqual({
      ok: false,
      error: "insufficient-credits",
    });

    await grantCredits({ workerId: "w1", amount: 30, fund: "paid", reason: "Top-up" });
    const first = await spendCredits({ workerId: "w1", amount: 10, fund: "paid", reason: "Renewal", promotionId: "wallet:pay-9" });
    expect(first.ok).toBe(true);
    expect(await spendCredits({ workerId: "w1", amount: 10, fund: "paid", reason: "Renewal", promotionId: "wallet:pay-9" })).toEqual({
      ok: false,
      error: "already-charged",
    });
    expect(await getWorkerCreditBalance("w1")).toMatchObject({ paidBalance: 20, freeBalance: 50 });
  });

  it("the monthly allowance expiry never touches money the worker paid in", async () => {
    const w = { id: "w2", subscription: { plan: "basic" as const, status: "active", expiresAt: "2027-06-01T00:00:00Z" } };
    await runMonthlyLeadAllowance([w], Date.parse("2026-10-01T00:10:00Z"));
    await grantCredits({ workerId: "w2", amount: 50, fund: "paid", reason: "Top-up", at: "2026-10-05T00:00:00Z" });

    await runMonthlyLeadAllowance([w], Date.parse("2026-11-01T00:10:00Z"));
    // October's 15 free credits expired; November's 15 arrived; the 50 paid are untouched.
    expect(await getWorkerCreditBalance("w2")).toMatchObject({ paidBalance: 50, freeBalance: 15 });
  });
});

describe("wallet top-up, end to end (demo adapter)", () => {
  it("checkout charges the pack price and confirm grants paid + bonus exactly once", async () => {
    const worker = await getWorkerBySlug(DEMO_WORKER);
    if (!worker) throw new Error("demo worker missing");

    const checkout = await createPurchaseCheckout({
      workerSlug: DEMO_WORKER,
      scope: "credit",
      creditPackage: { id: "popular", credits: 25, bonusCredits: 5, priceUsd: 25 },
      method: "OMT",
    });
    expect(checkout?.url).toBeTruthy();

    const pending = demoPendingManualPurchases().find((p) => p.scope === "credit");
    expect(pending?.amount).toBe(2500);

    expect(await confirmPurchase(pending!.id, "OMT-TOPUP-1", { by: "Platform Admin" })).toBe(true);
    await confirmPurchase(pending!.id, "OMT-TOPUP-1", { by: "Platform Admin" });

    expect(await getWorkerCreditBalance(worker.id)).toMatchObject({ paidBalance: 25, freeBalance: 5 });
    expect((await listCreditLedger(10, worker.id)).filter((e) => e.promotionId?.startsWith("topup"))).toHaveLength(2);
  });

  it("a credit checkout without a pack is refused rather than minted at $0", async () => {
    expect(await createPurchaseCheckout({ workerSlug: DEMO_WORKER, scope: "credit", method: "OMT" })).toBeNull();
  });
});
