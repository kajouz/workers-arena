import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

import {
  applyPromotionCreditGrant,
  creditBalanceFrom,
  getWorkerCreditBalance,
  grantCredits,
  listCreditLedger,
  resetCreditLedgerStore,
  type CreditLedgerEntry,
} from "../src/lib/data/credit-ledger";
import { promotionBonusFor, type FeePromotion } from "../src/lib/data/fee-rules";
import { resetFeeRuleStore, saveFeeRuleSet } from "../src/lib/data/fee-rules-store";
import { confirmPurchase, createPurchaseCheckout, getWorkerBySlug } from "../src/lib/data/repo";
import { demoPendingManualPurchases, resetPurchaseStore } from "../src/lib/data/purchases";
import { resetBookingsStore } from "../src/lib/data/bookings";
import { resetAdminActivityFeed } from "../src/lib/data/activity";

/**
 * §24 → §20 — the platform credit ledger and the promotion grants that write
 * to it (docs/fee-rules.md → promotions). The ledger is append-only and the
 * balance is derived, so these tests assert on entries, not on a stored number.
 */

const DEMO_WORKER = "khaled-al-harbi-plumbing";
const WORKER_ID = "worker-credit-1";

let activityFile: string;

beforeEach(() => {
  resetCreditLedgerStore();
  resetFeeRuleStore();
  resetBookingsStore();
  resetPurchaseStore();
  activityFile = path.join(tmpdir(), `credits-activity-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});

afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.restoreAllMocks();
});

describe("creditBalanceFrom — derived, never stored", () => {
  const entry = (amount: number, at: string, id = `e-${at}-${amount}`): CreditLedgerEntry => ({
    id,
    workerId: "w-1",
    kind: amount >= 0 ? "grant" : "spend",
    amount,
    balanceAfter: 0,
    reason: "test",
    createdAt: at,
  });

  it("sums signed amounts and reports granted vs spent", () => {
    const balance = creditBalanceFrom([
      entry(50, "2026-09-01T00:00:00.000Z"),
      entry(-20, "2026-09-02T00:00:00.000Z"),
      entry(5, "2026-09-03T00:00:00.000Z"),
    ]);
    expect(balance.balance).toBe(35);
    expect(balance.granted).toBe(55);
    expect(balance.spent).toBe(20);
    expect(balance.lastActivityAt).toBe("2026-09-03T00:00:00.000Z");
  });

  it("never reports a negative spendable balance", () => {
    expect(creditBalanceFrom([entry(-10, "2026-09-01T00:00:00.000Z")]).balance).toBe(0);
  });
});

describe("ledger writes", () => {
  it("appends entries and derives the balance per worker", async () => {
    await grantCredits({ workerId: WORKER_ID, amount: 40, reason: "manual grant" });
    await grantCredits({ workerId: WORKER_ID, amount: -10, kind: "spend", reason: "spent on a lead" });
    await grantCredits({ workerId: "someone-else", amount: 5, reason: "other worker" });

    const balance = await getWorkerCreditBalance(WORKER_ID);
    expect(balance.balance).toBe(30);
    expect(balance.granted).toBe(40);
    expect(balance.spent).toBe(10);

    const rows = await listCreditLedger(10, WORKER_ID);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.workerId === WORKER_ID)).toBe(true);
  });

  it("is idempotent per promotion — one bonus per worker per campaign", async () => {
    const first = await grantCredits({ workerId: WORKER_ID, amount: 50, reason: "promo", promotionId: "promo-a" });
    const second = await grantCredits({ workerId: WORKER_ID, amount: 50, reason: "promo", promotionId: "promo-a" });
    expect(second?.id).toBe(first?.id);
    expect((await getWorkerCreditBalance(WORKER_ID)).balance).toBe(50);

    // A different campaign is a different grant.
    await grantCredits({ workerId: WORKER_ID, amount: 25, reason: "other promo", promotionId: "promo-b" });
    expect((await getWorkerCreditBalance(WORKER_ID)).balance).toBe(75);
  });

  it("ignores a zero amount", async () => {
    expect(await grantCredits({ workerId: WORKER_ID, amount: 0, reason: "noop" })).toBeNull();
    expect(await listCreditLedger()).toHaveLength(0);
  });
});

describe("promotionBonusFor — who earns the bonus", () => {
  const base: FeePromotion = { id: "p", label: "Launch", rateBps: 700, bonusCredits: 50 };
  const at = "2026-09-14T00:00:00.000Z";

  it("matches a live, unscoped campaign with a bonus", () => {
    expect(promotionBonusFor([base], { plan: "professional", at })).toEqual({ promotion: base, credits: 50 });
  });

  it("respects the window, the pause switch and the plan scope", () => {
    expect(promotionBonusFor([{ ...base, endsAt: "2026-08-01T00:00:00.000Z" }], { plan: "professional", at })).toBeNull();
    expect(promotionBonusFor([{ ...base, startsAt: "2026-10-01T00:00:00.000Z" }], { plan: "professional", at })).toBeNull();
    expect(promotionBonusFor([{ ...base, enabled: false }], { plan: "professional", at })).toBeNull();
    expect(promotionBonusFor([{ ...base, planTier: "growth" }], { plan: "professional", at })).toBeNull();
    expect(promotionBonusFor([{ ...base, planTier: "professional" }], { plan: "professional", at })).not.toBeNull();
    expect(promotionBonusFor([{ ...base, bonusCredits: 0 }], { plan: "professional", at })).toBeNull();
  });

  it("never grants for a category- or code-scoped campaign (the purchase flow has neither)", () => {
    expect(promotionBonusFor([{ ...base, categorySlug: "plumbing" }], { plan: "professional", at })).toBeNull();
    expect(promotionBonusFor([{ ...base, promoCode: "WELCOME" }], { plan: "professional", at })).toBeNull();
  });

  it("takes the first match, like the fee engine", () => {
    const first: FeePromotion = { id: "first", label: "First", rateBps: 700, bonusCredits: 10 };
    const second: FeePromotion = { id: "second", label: "Second", rateBps: 700, bonusCredits: 99 };
    expect(promotionBonusFor([first, second], { plan: "premium", at })?.credits).toBe(10);
  });
});

describe("applyPromotionCreditGrant", () => {
  it("grants once for the active campaign, then never again", async () => {
    await saveFeeRuleSet({
      promotions: [{ id: "launch", label: "Launch month", rateBps: 500, planTier: "professional", bonusCredits: 50 }],
    });

    const first = await applyPromotionCreditGrant({ workerId: WORKER_ID, plan: "professional" });
    expect(first?.amount).toBe(50);
    expect(first?.promotionId).toBe("launch");
    expect(first?.reason).toContain("Launch month");

    // A second purchase in the same window must not double-grant.
    const second = await applyPromotionCreditGrant({ workerId: WORKER_ID, plan: "professional" });
    expect(second?.id).toBe(first?.id);
    expect((await getWorkerCreditBalance(WORKER_ID)).balance).toBe(50);
  });

  it("grants nothing when no campaign is live", async () => {
    expect(await applyPromotionCreditGrant({ workerId: WORKER_ID, plan: "professional" })).toBeNull();
    expect(await listCreditLedger()).toHaveLength(0);
  });
});

describe("purchase confirmation grants the bonus end-to-end", () => {
  it("credits the worker when a live campaign covers the purchased plan", async () => {
    const worker = await getWorkerBySlug(DEMO_WORKER);
    if (!worker) throw new Error("demo worker missing");

    await saveFeeRuleSet({
      promotions: [
        {
          id: "welcome-credit",
          label: "Welcome credits",
          rateBps: 700,
          planTier: "professional",
          bonusCredits: 30,
        },
      ],
    });

    const checkout = await createPurchaseCheckout({
      workerSlug: DEMO_WORKER,
      scope: "subscription",
      plan: "professional",
      period: "monthly",
      method: "OMT",
    });
    expect(checkout?.url).toBeTruthy();

    const pending = demoPendingManualPurchases().find((p) => p.scope === "subscription");
    expect(pending).toBeTruthy();
    expect(await confirmPurchase(pending!.id, "OMT-REF-1", { by: "Platform Admin" })).toBe(true);

    const balance = await getWorkerCreditBalance(worker.id);
    expect(balance.balance).toBe(30);

    const ledger = await listCreditLedger(10, worker.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: "grant", amount: 30, promotionId: "welcome-credit", createdBy: "Platform Admin" });
  });

  it("grants nothing for a non-subscription purchase, even while a campaign runs", async () => {
    const worker = await getWorkerBySlug(DEMO_WORKER);
    if (!worker) throw new Error("demo worker missing");

    await saveFeeRuleSet({
      promotions: [{ id: "any-plan", label: "Any plan", rateBps: 700, bonusCredits: 30 }],
    });

    await createPurchaseCheckout({ workerSlug: DEMO_WORKER, scope: "verification", tier: "basic", method: "WHISH" });
    const pending = demoPendingManualPurchases().find((p) => p.scope === "verification");
    expect(pending).toBeTruthy();
    await confirmPurchase(pending!.id, "WHISH-REF-1", { by: "Platform Admin" });

    expect((await getWorkerCreditBalance(worker.id)).balance).toBe(0);
  });

  it("matches the campaign against the PURCHASED plan, not the worker's current one", async () => {
    const worker = await getWorkerBySlug(DEMO_WORKER);
    if (!worker) throw new Error("demo worker missing");

    await saveFeeRuleSet({
      promotions: [{ id: "basic-only", label: "Basic only", rateBps: 700, planTier: "starter", bonusCredits: 12 }],
    });

    // Khaled is a Premium subscriber, but he is BUYING Basic here — the tier
    // that counts is the one being purchased.
    await createPurchaseCheckout({
      workerSlug: DEMO_WORKER,
      scope: "subscription",
      plan: "basic",
      period: "monthly",
      method: "OMT",
    });
    const pending = demoPendingManualPurchases().find((p) => p.scope === "subscription");
    await confirmPurchase(pending!.id, "OMT-REF-2");

    expect((await getWorkerCreditBalance(worker.id)).balance).toBe(12);
  });
});
