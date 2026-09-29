import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The actions resolve the caller; act as the demo worker.
const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { ACTING } from "./helpers/acting-session";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

import { getWorkerCreditBalance, grantCredits, listCreditLedger, resetCreditLedgerStore } from "../src/lib/data/credit-ledger";
import { resetFeeRuleStore } from "../src/lib/data/fee-rules-store";
import {
  confirmBookingCompletion,
  createBookingRequest,
  getBookingSettlement,
  getManualPaymentReconciliation,
  getPendingManualPayments,
  getWorkerBySlug,
  getWorkerSlots,
  markBookingSettledOutside,
  respondToBooking,
  transitionBooking,
} from "../src/lib/data/repo";
import { resetPurchaseStore } from "../src/lib/data/purchases";
import { resetBookingsStore } from "../src/lib/data/bookings";
import { resetAdminActivityFeed } from "../src/lib/data/activity";
import {
  autoRenewDue,
  collectFeeClaims,
  feeClaimCharge,
  payPurchaseFromWallet,
  runWalletAutoRenew,
} from "../src/lib/data/wallet-payments";
import type { Booking, Worker } from "../src/lib/data/types";

// Paying from the prepaid wallet (revenue plan Step 2, part 2): purchases,
// auto-renew and cash-job commission all draw on the PAID pot only.

const SLUG = "khaled-al-harbi-plumbing";
let activityFile: string;

beforeEach(() => {
  resetCreditLedgerStore();
  resetFeeRuleStore();
  resetBookingsStore();
  resetPurchaseStore();
  activityFile = path.join(tmpdir(), `wallet-pay-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
  getSessionMock.mockResolvedValue(ACTING.worker);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.unstubAllEnvs();
});

async function khaled(): Promise<Worker> {
  const w = await getWorkerBySlug(SLUG);
  if (!w) throw new Error("demo worker missing");
  return w;
}

describe("payPurchaseFromWallet", () => {
  it("renews a plan from paid credits, extends it, and never lists it as a manual payment", async () => {
    const w = await khaled();
    await grantCredits({ workerId: w.id, amount: 100, fund: "paid", reason: "Top-up" });
    await grantCredits({ workerId: w.id, amount: 40, fund: "free", reason: "Allowance" });

    const paid = await payPurchaseFromWallet({ worker: w, scope: "subscription", plan: "professional", period: "monthly" });
    expect(paid).toMatchObject({ ok: true, credits: 39 });

    // The plan now runs a month from today (the demo adapter restarts the
    // period; the Prisma adapter extends from the current end date).
    const renewed = await khaled();
    expect(renewed.subscription.plan).toBe("professional");
    expect(Date.parse(renewed.subscription.expiresAt) - Date.now()).toBeGreaterThan(27 * 86_400_000);
    // Only the wallet paid; the free credits are untouched — plus Growth's
    // monthly lead credits (10 × 5), granted on the same confirm.
    expect(await getWorkerCreditBalance(w.id)).toMatchObject({ paidBalance: 61, freeBalance: 40 + 50 });
    // Not new cash: the top-up was. It never enters the admin queue or revenue.
    expect((await getPendingManualPayments()).some((p) => p.id === (paid.ok && paid.paymentId))).toBe(false);
    expect((await getManualPaymentReconciliation()).some((p) => p.id === (paid.ok && paid.paymentId))).toBe(false);
  });

  it("refuses when only free credits could pay, and leaves the plan alone", async () => {
    const w = await khaled();
    const before = w.subscription.expiresAt;
    await grantCredits({ workerId: w.id, amount: 500, fund: "free", reason: "Allowance" });

    expect(await payPurchaseFromWallet({ worker: w, scope: "subscription", plan: "basic" })).toEqual({ ok: false, error: "insufficient" });
    expect((await khaled()).subscription.expiresAt).toBe(before);
    expect((await getWorkerCreditBalance(w.id)).freeBalance).toBe(500);
  });

  it("buys a verification badge from the wallet", async () => {
    const w = await khaled();
    await grantCredits({ workerId: w.id, amount: 20, fund: "paid", reason: "Top-up" });
    expect(await payPurchaseFromWallet({ worker: w, scope: "verification", tier: "professional" })).toMatchObject({ ok: true, credits: 19 });
    expect((await getWorkerCreditBalance(w.id)).paidBalance).toBe(1);
  });

  it("supersedes an unpaid OMT renewal so an admin cannot confirm a second one", async () => {
    const { createPurchaseCheckout } = await import("../src/lib/data/repo");
    const w = await khaled();
    await createPurchaseCheckout({ workerSlug: SLUG, scope: "subscription", plan: "basic", period: "monthly", method: "OMT" });
    expect((await getPendingManualPayments()).some((p) => p.scope === "subscription" && p.workerSlug === SLUG)).toBe(true);

    await grantCredits({ workerId: w.id, amount: 50, fund: "paid", reason: "Top-up" });
    expect((await payPurchaseFromWallet({ worker: w, scope: "subscription", plan: "basic" })).ok).toBe(true);
    expect((await getPendingManualPayments()).some((p) => p.scope === "subscription" && p.workerSlug === SLUG)).toBe(false);
  });
});

describe("wallet auto-renew", () => {
  const NOW = Date.parse("2026-10-10T06:30:00Z");

  it("is due from a day before the plan ends to three days after, unless switched off", () => {
    expect(autoRenewDue({ expiresAt: "2026-10-11T00:00:00Z" }, NOW)).toBe(true);
    expect(autoRenewDue({ expiresAt: "2026-10-08T00:00:00Z" }, NOW)).toBe(true);
    expect(autoRenewDue({ expiresAt: "2026-10-20T00:00:00Z" }, NOW)).toBe(false);
    expect(autoRenewDue({ expiresAt: "2026-10-01T00:00:00Z" }, NOW)).toBe(false);
    expect(autoRenewDue({ expiresAt: "2026-10-11T00:00:00Z", autoRenew: false }, NOW)).toBe(false);
  });

  it("renews once per plan period however often it runs, and skips an opted-out worker", async () => {
    const w = await khaled();
    await grantCredits({ workerId: w.id, amount: 200, fund: "paid", reason: "Top-up" });
    const ending = { ...w, subscription: { ...w.subscription, plan: "basic" as const, period: "monthly" as const, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } };

    expect(await runWalletAutoRenew([ending])).toEqual({ due: 1, renewed: 1, insufficient: 0 });
    // Same plan period again (a re-run with the stale row): no second charge.
    expect(await runWalletAutoRenew([ending])).toMatchObject({ due: 1, renewed: 0 });
    expect((await getWorkerCreditBalance(w.id)).paidBalance).toBe(200 - 15);

    const optedOut = { ...ending, subscription: { ...ending.subscription, autoRenew: false } };
    expect(await runWalletAutoRenew([optedOut])).toEqual({ due: 0, renewed: 0, insufficient: 0 });
  });

  it("reports a due plan the wallet cannot cover", async () => {
    const w = await khaled();
    const ending = { ...w, subscription: { ...w.subscription, plan: "premium" as const, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } };
    expect(await runWalletAutoRenew([ending])).toEqual({ due: 1, renewed: 0, insufficient: 1 });
  });
});

describe("commission on cash jobs", () => {
  it("never charges more than the claim: rounds the charge down to whole dollars", () => {
    expect(feeClaimCharge(560, 100)).toMatchObject({ debitCredits: 5, debitMinor: 500 });
    expect(feeClaimCharge(560, 2)).toMatchObject({ debitCredits: 2, debitMinor: 200 });
    expect(feeClaimCharge(60, 100)).toMatchObject({ debitCredits: 0 });
  });

  it("collects a cash job's commission from the wallet, once", async () => {
    const w = await khaled();
    const slot = (await getWorkerSlots(w.id)).find((s) => s.status === "available")!;
    const created = (await createBookingRequest({
      workerId: w.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+961 70 123 456",
      customerEmail: "noor@example.com",
      jobTitle: "Fix a leaking pipe under the kitchen sink",
    })) as Booking;
    await respondToBooking(created.id, { accept: true, quote: 8000 });
    await transitionBooking(created.id, "inProgress");
    await transitionBooking(created.id, "completed");
    await confirmBookingCompletion(created.id);
    await markBookingSettledOutside(created.id, { by: "worker" });

    await grantCredits({ workerId: w.id, amount: 30, fund: "paid", reason: "Top-up" });
    await grantCredits({ workerId: w.id, amount: 30, fund: "free", reason: "Allowance" });
    const job = async () => ({ bookingId: created.id, number: created.number, workerId: w.id, settlement: (await getBookingSettlement(created.id))! });

    // The claim is the fee at the worker's plan rate (earlier tests change the
    // demo worker's plan); whole dollars come from the wallet, cents stay owed.
    const claim = (await getBookingSettlement(created.id))!.feeClaimMinor;
    const collected = Math.floor(claim / 100) * 100;
    expect(await collectFeeClaims([await job()])).toEqual({ jobs: 1, collectedMinor: collected });
    const after = await getBookingSettlement(created.id);
    expect(after).toMatchObject({ feeClaimCollectedMinor: collected, feeClaimOutstandingMinor: claim - collected });
    expect(await getWorkerCreditBalance(w.id)).toMatchObject({ paidBalance: 30 - collected / 100, freeBalance: 30 });

    // Running again collects nothing more (the remainder is under a dollar).
    expect(await collectFeeClaims([await job()])).toEqual({ jobs: 0, collectedMinor: 0 });
    expect((await listCreditLedger(20, w.id)).filter((e) => e.promotionId?.startsWith("feeclaim:"))).toHaveLength(1);
  });
});

describe("worker actions", () => {
  it("renews from the wallet through the action, and explains an empty wallet", async () => {
    const { renewSubscriptionAction } = await import("../src/app/actions/business");
    const w = await khaled();
    const form = (plan: string) => {
      const f = new FormData();
      f.set("plan", plan);
      f.set("period", "monthly");
      f.set("method", "wallet");
      return f;
    };
    expect(await renewSubscriptionAction(form("basic"))).toEqual({ error: "wallet-insufficient" });

    await grantCredits({ workerId: w.id, amount: 20, fund: "paid", reason: "Top-up" });
    expect(await renewSubscriptionAction(form("basic"))).toEqual({ ok: true, days: 30 });
    expect((await getWorkerCreditBalance(w.id)).paidBalance).toBe(5);
  });

  it("the worker can switch auto-renew off and on", async () => {
    const { setAutoRenewAction } = await import("../src/app/actions/business");
    expect(await setAutoRenewAction(false)).toEqual({ ok: true });
    expect((await khaled()).subscription.autoRenew).toBe(false);
    expect(await setAutoRenewAction(true)).toEqual({ ok: true });
    expect((await khaled()).subscription.autoRenew).toBe(true);

    getSessionMock.mockResolvedValue(ACTING.customer);
    expect(await setAutoRenewAction(false)).toEqual({ error: "unauthorized" });
  });
});
