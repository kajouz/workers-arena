/**
 * Payment workflow v2 — the pure rules (src/lib/data/payment-workflow.ts) and
 * the money-mode guard (src/lib/payments/money-mode.ts). No stores, no clock.
 */
import { describe, expect, it } from "vitest";
import {
  allocate,
  canApprove,
  depositDeadline,
  feeClaimBlocks,
  needsSecondApproval,
  nextDunningStage,
  normalizeTxnId,
  paymentWorkflowConfig,
  purchaseDeadline,
  reliabilityScore,
  reminderDue,
  requiredDepositMinor,
  shouldExpire,
} from "../src/lib/data/payment-workflow";
import { moneyModeProblem, servesDemoData } from "../src/lib/payments/money-mode";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const cfg = paymentWorkflowConfig({});

describe("deadlines", () => {
  it("a deposit lapses 24h after it was asked for…", () => {
    const at = "2026-10-01T10:00:00.000Z";
    expect(depositDeadline({ requestedAt: at }, cfg).toISOString()).toBe("2026-10-02T10:00:00.000Z");
  });

  it("…but never later than 2h before the job starts", () => {
    const d = depositDeadline({ requestedAt: "2026-10-01T10:00:00.000Z", startAt: "2026-10-01T18:00:00.000Z" }, cfg);
    expect(d.toISOString()).toBe("2026-10-01T16:00:00.000Z");
  });

  it("an upgrade reference lapses after 72h", () => {
    expect(purchaseDeadline("2026-10-01T00:00:00.000Z", cfg).toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });

  it("the env tunes the hold", () => {
    const tuned = paymentWorkflowConfig({ PAYMENT_DEPOSIT_HOLD_HOURS: "6", PAYMENT_PURCHASE_HOLD_HOURS: "garbage" });
    expect(tuned.depositHoldHours).toBe(6);
    expect(tuned.purchaseHoldHours).toBe(72); // a garbage value falls back
  });

  it("a payer with a receipt or recorded money is never lapsed by the clock", () => {
    const deadline = new Date("2026-10-01T00:00:00.000Z");
    const now = new Date("2026-10-05T00:00:00.000Z");
    expect(shouldExpire({ deadline, now, hasReceipt: false, hasTranche: false })).toBe(true);
    expect(shouldExpire({ deadline, now, hasReceipt: true, hasTranche: false })).toBe(false);
    expect(shouldExpire({ deadline, now, hasReceipt: false, hasTranche: true })).toBe(false);
    expect(shouldExpire({ deadline, now: new Date("2026-09-30T00:00:00.000Z"), hasReceipt: false, hasTranche: false })).toBe(false);
  });

  it("the reminder is due from half-time until the deadline", () => {
    const requestedAt = new Date("2026-10-01T00:00:00.000Z");
    const deadline = new Date("2026-10-02T00:00:00.000Z");
    expect(reminderDue({ requestedAt, deadline, now: new Date("2026-10-01T11:00:00.000Z") })).toBe(false);
    expect(reminderDue({ requestedAt, deadline, now: new Date("2026-10-01T12:00:00.000Z") })).toBe(true);
    expect(reminderDue({ requestedAt, deadline, now: deadline })).toBe(false);
  });
});

describe("evidence and maker–checker", () => {
  it("normalises transaction numbers and refuses junk", () => {
    expect(normalizeTxnId("omt 1234-5678")).toBe("OMT12345678");
    expect(normalizeTxnId(" whish/9876.54 ")).toBe("WHISH987654");
    expect(normalizeTxnId("12")).toBeNull();
    expect(normalizeTxnId("<script>")).toBeNull();
    expect(normalizeTxnId("")).toBeNull();
    expect(normalizeTxnId(undefined)).toBeNull();
  });

  it("needs a second admin at/above the threshold or without a receipt", () => {
    expect(needsSecondApproval({ paymentAmountMinor: 5_000, hasReceipt: true }, cfg)).toBe(false);
    expect(needsSecondApproval({ paymentAmountMinor: 20_000, hasReceipt: true }, cfg)).toBe(true);
    expect(needsSecondApproval({ paymentAmountMinor: 500, hasReceipt: false }, cfg)).toBe(true);
    // Threshold 0 switches the amount rule off; the receipt rule stays.
    const off = paymentWorkflowConfig({ PAYMENT_FOUR_EYES_MINOR: "0" });
    expect(needsSecondApproval({ paymentAmountMinor: 1_000_000, hasReceipt: true }, off)).toBe(false);
    expect(needsSecondApproval({ paymentAmountMinor: 1_000_000, hasReceipt: false }, off)).toBe(true);
  });

  it("the approver must be a different person", () => {
    expect(canApprove({ enteredById: "a1", approverId: "a1" })).toBe(false);
    expect(canApprove({ enteredById: "a1", approverId: "a2" })).toBe(true);
    expect(canApprove({ enteredById: "a1", approverId: undefined })).toBe(false);
  });

  it("allocates short, exact and over payments", () => {
    expect(allocate({ amountMinor: 5_000, receivedMinor: 2_000 })).toEqual({ state: "short", receivedMinor: 2_000, remainingMinor: 3_000, excessMinor: 0 });
    expect(allocate({ amountMinor: 5_000, receivedMinor: 5_000 })).toEqual({ state: "exact", receivedMinor: 5_000, remainingMinor: 0, excessMinor: 0 });
    expect(allocate({ amountMinor: 5_000, receivedMinor: 6_500 })).toEqual({ state: "over", receivedMinor: 6_500, remainingMinor: 0, excessMinor: 1_500 });
  });
});

describe("balance dunning", () => {
  const dueAt = new Date("2026-10-01T00:00:00.000Z");
  const at = (days: number) => new Date(dueAt.getTime() + days * DAY);

  it("fires each stage once, in order", () => {
    expect(nextDunningStage({ dueAt, now: at(0.5), stage: 0 }, cfg)).toBeNull();
    expect(nextDunningStage({ dueAt, now: at(1), stage: 0 }, cfg)).toBe(1);
    expect(nextDunningStage({ dueAt, now: at(2), stage: 1 }, cfg)).toBeNull();
    expect(nextDunningStage({ dueAt, now: at(3), stage: 1 }, cfg)).toBe(2);
    expect(nextDunningStage({ dueAt, now: at(7), stage: 2 }, cfg)).toBe(3);
    expect(nextDunningStage({ dueAt, now: at(14), stage: 3 }, cfg)).toBe(4);
    expect(nextDunningStage({ dueAt, now: at(30), stage: 4 }, cfg)).toBe(5);
    expect(nextDunningStage({ dueAt, now: at(90), stage: 5 }, cfg)).toBeNull();
  });

  it("after downtime, jumps to the latest due stage (no burst of reminders)", () => {
    expect(nextDunningStage({ dueAt, now: at(15), stage: 0 }, cfg)).toBe(4);
  });
});

describe("payment reliability", () => {
  it("scores lapses and forgives paid jobs", () => {
    expect(reliabilityScore({ expiredDeposits: 0, overdueBalances: 0, writeOffs: 0, paidJobs: 4 })).toEqual({ points: 0, tier: "normal" });
    expect(reliabilityScore({ expiredDeposits: 2, overdueBalances: 0, writeOffs: 0, paidJobs: 0 })).toEqual({ points: 2, tier: "normal" });
    expect(reliabilityScore({ expiredDeposits: 0, overdueBalances: 1, writeOffs: 0, paidJobs: 0 })).toEqual({ points: 3, tier: "prepay" });
    expect(reliabilityScore({ expiredDeposits: 3, overdueBalances: 1, writeOffs: 0, paidJobs: 1 })).toEqual({ points: 5, tier: "prepay" });
    expect(reliabilityScore({ expiredDeposits: 0, overdueBalances: 0, writeOffs: 1, paidJobs: 0 })).toEqual({ points: 10, tier: "blocked" });
  });

  it("requires the whole quote from a prepay customer, and the configured minimum otherwise", () => {
    expect(requiredDepositMinor({ quoteMinor: 10_000, requestedDepositMinor: 2_000, tier: "prepay" }, cfg)).toBe(10_000);
    expect(requiredDepositMinor({ quoteMinor: 10_000, requestedDepositMinor: 2_000, tier: "normal" }, cfg)).toBe(2_000);
    expect(requiredDepositMinor({ quoteMinor: 10_000, requestedDepositMinor: 0, tier: "normal" }, cfg)).toBe(0); // minimum off by default
    const min30 = paymentWorkflowConfig({ BOOKING_MIN_DEPOSIT_BPS: "3000" });
    expect(requiredDepositMinor({ quoteMinor: 10_000, requestedDepositMinor: 0, tier: "normal" }, min30)).toBe(3_000);
    expect(requiredDepositMinor({ quoteMinor: 10_000, requestedDepositMinor: 5_000, tier: "normal" }, min30)).toBe(5_000);
    expect(requiredDepositMinor({ quoteMinor: null, requestedDepositMinor: 1_000, tier: "prepay" }, cfg)).toBe(1_000);
  });
});

describe("fee-claim gate", () => {
  const declaredAt = new Date("2026-10-01T00:00:00.000Z");
  it("blocks only an unpaid claim older than the grace period", () => {
    expect(feeClaimBlocks({ claimMinor: 500, collectedMinor: 0, declaredAt, now: new Date(declaredAt.getTime() + 13 * DAY) }, cfg)).toBe(false);
    expect(feeClaimBlocks({ claimMinor: 500, collectedMinor: 0, declaredAt, now: new Date(declaredAt.getTime() + 14 * DAY) }, cfg)).toBe(true);
    expect(feeClaimBlocks({ claimMinor: 500, collectedMinor: 500, declaredAt, now: new Date(declaredAt.getTime() + 90 * DAY) }, cfg)).toBe(false);
    expect(feeClaimBlocks({ claimMinor: 500, collectedMinor: 0, declaredAt: null, now: new Date() }, cfg)).toBe(false);
  });
});

describe("money mode (D3)", () => {
  it("the showcase (DEMO_MODE=true) may take demo payments", () => {
    expect(moneyModeProblem({ NODE_ENV: "production", DEMO_MODE: "true" })).toBeNull();
    expect(servesDemoData({ DEMO_MODE: "true" })).toBe(true);
  });

  it("an unset DEMO_MODE in production is refused (it silently serves demo data)", () => {
    expect(moneyModeProblem({ NODE_ENV: "production" })).toMatch(/DEMO_MODE is unset/);
  });

  it("real data without a database is refused", () => {
    expect(moneyModeProblem({ NODE_ENV: "production", DEMO_MODE: "false" })).toMatch(/DATABASE_URL is missing/);
    expect(servesDemoData({ DEMO_MODE: "false" })).toBe(true);
  });

  it("PAYMENTS_LIVE requires real data and a database, in any environment", () => {
    expect(moneyModeProblem({ PAYMENTS_LIVE: "true", DEMO_MODE: "true", DATABASE_URL: "x" })).toMatch(/PAYMENTS_LIVE/);
    expect(moneyModeProblem({ PAYMENTS_LIVE: "true", DEMO_MODE: "false" })).toMatch(/DATABASE_URL/);
    expect(moneyModeProblem({ PAYMENTS_LIVE: "true", DEMO_MODE: "false", DATABASE_URL: "x", NODE_ENV: "production" })).toBeNull();
  });

  it("development and tests are unrestricted", () => {
    expect(moneyModeProblem({ NODE_ENV: "test" })).toBeNull();
  });
});
