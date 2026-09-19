import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approvedRefundCredits,
  validateRefundRequest,
} from "../src/lib/data/lead-refunds";
import {
  decideLeadRefund,
  requestLeadRefund,
  resetLeadRefundStore,
} from "../src/lib/data/lead-refund-store";
import { offerQualifiedLead, resetLeadOfferStore } from "../src/lib/data/lead-market-store";
import { getWorkerCreditBalance, grantCredits, resetCreditLedgerStore } from "../src/lib/data/credit-ledger";
import { resetFeeRuleStore } from "../src/lib/data/fee-rules-store";
import { resetAdminActivityFeed } from "../src/lib/data/activity";

beforeEach(async () => {
  vi.stubEnv("DEMO_MODE", "true");
  resetLeadRefundStore();
  resetLeadOfferStore();
  resetCreditLedgerStore();
  resetFeeRuleStore();
  await resetAdminActivityFeed();
});

describe("lead refund pure policy", () => {
  const offer = { id: "o1", leadId: "l1", workerId: "w1", status: "purchased", priceCredits: 20 };

  it("only accepts purchased offers owned by the worker and supported reasons", () => {
    expect(validateRefundRequest(offer, null, { workerId: "w1", reason: "invalid-contact" })).toEqual({
      ok: true,
      reason: "invalid-contact",
      requestedCredits: 20,
    });
    expect(validateRefundRequest({ ...offer, status: "offered" }, null, { workerId: "w1", reason: "invalid-contact" })).toEqual({ ok: false, error: "not-purchased" });
    expect(validateRefundRequest(offer, null, { workerId: "w2", reason: "invalid-contact" })).toEqual({ ok: false, error: "unauthorized" });
    expect(validateRefundRequest(offer, null, { workerId: "w1", reason: "made-up" })).toEqual({ ok: false, error: "invalid" });
  });

  it("clamps partial decisions to the requested amount", () => {
    expect(approvedRefundCredits({ requestedCredits: 20 }, 7)).toBe(7);
    expect(approvedRefundCredits({ requestedCredits: 20 }, 200)).toBe(20);
    expect(approvedRefundCredits({ requestedCredits: 20 }, -1)).toBe(0);
  });
});

describe("lead refund demo workflow", () => {
  it("creates one request and returns approved credits through an adjustment", async () => {
    await grantCredits({ workerId: "w1", amount: 50, reason: "seed" });
    const { created } = await offerQualifiedLead({
      lead: { id: "lead-refund", number: "QR-REFUND", jobTitle: "Leaking sink", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [{ workerId: "w1", categorySlug: "plumbing", citySlug: "beirut", rating: 4, reviewCount: 2, responseRate: 80, availableThisWeek: true, plan: "professional", emergency: false, verified: true }],
    });
    const offer = created[0]!;
    // The fixture is a live offer; purchase it using the seeded balance.
    const { purchaseLeadOffer } = await import("../src/lib/data/lead-market-store");
    await purchaseLeadOffer(offer.id, "w1");

    const first = await requestLeadRefund({ offerId: offer.id, workerId: "w1", reason: "invalid-contact", evidence: "Number disconnected" });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error);
    const duplicate = await requestLeadRefund({ offerId: offer.id, workerId: "w1", reason: "duplicate-lead" });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) throw new Error("duplicate refund request unexpectedly succeeded");
    expect(duplicate.error).toBe("already-requested");

    const decided = await decideLeadRefund({ requestId: first.request.id, approve: true, approvedCredits: 3, decidedBy: "Admin" });
    expect(decided?.status).toBe("approved");
    expect(decided?.approvedCredits).toBe(3);
    expect((await getWorkerCreditBalance("w1")).balance).toBe(50 - offer.priceCredits + 3);

    // A second decision is closed and cannot grant a second adjustment.
    expect(await decideLeadRefund({ requestId: first.request.id, approve: true, decidedBy: "Admin" })).toBeNull();
    expect((await getWorkerCreditBalance("w1")).balance).toBe(50 - offer.priceCredits + 3);
  });
});
