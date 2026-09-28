import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

import { DEFAULT_FEE_RULE_SET, feePlanOf, priceJob } from "../src/lib/data/fee-rules";
import { subscriptionStatus } from "../src/lib/data/subscriptions";
import { WORKERS } from "../src/lib/data/workers";
import { createBookingRequest, respondToBooking } from "../src/lib/data/repo";
import { demoAddSlot, resetBookingsStore } from "../src/lib/data/bookings";
import { resetFeeRuleStore, saveFeeRuleSet } from "../src/lib/data/fee-rules-store";
import { offerQualifiedLead, resetLeadOfferStore } from "../src/lib/data/lead-market-store";
import { resetCreditLedgerStore } from "../src/lib/data/credit-ledger";
import { resetAdminActivityFeed } from "../src/lib/data/activity";
import type { Booking } from "../src/lib/data/types";

// The free listing (revenue plan Step 4): a worker without an active plan is
// still listed (ranked last — tests/subscriptions.test.ts), pays the Free
// tier's 12% commission, and is never offered paid leads.

let activityFile: string;
beforeEach(() => {
  resetBookingsStore();
  resetFeeRuleStore();
  resetLeadOfferStore();
  resetCreditLedgerStore();
  activityFile = path.join(tmpdir(), `free-listing-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});
afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.unstubAllEnvs();
});

const NOW = Date.parse("2026-10-01T00:00:00Z");

describe("feePlanOf — the plan that counts for fees", () => {
  it("is the plan while it is active, nothing once it has lapsed", () => {
    expect(feePlanOf({ plan: "premium", status: "active", expiresAt: "2026-11-01T00:00:00Z" }, NOW)).toBe("premium");
    expect(feePlanOf({ plan: "premium", status: "expired", expiresAt: "2026-11-01T00:00:00Z" }, NOW)).toBeUndefined();
    expect(feePlanOf({ plan: "premium", status: "ACTIVE", expiresAt: new Date("2026-09-01T00:00:00Z") }, NOW)).toBeUndefined();
    expect(feePlanOf(null, NOW)).toBeUndefined();
  });

  it("prices a lapsed plan at the Free tier (12%), not its old discount", () => {
    const lapsed = feePlanOf({ plan: "premium", status: "expired", expiresAt: "2026-09-01T00:00:00Z" }, NOW);
    expect(priceJob(DEFAULT_FEE_RULE_SET, 10_000, { plan: lapsed }).computation.feeMinor).toBe(1_200);
    expect(priceJob(DEFAULT_FEE_RULE_SET, 10_000, { plan: "premium" }).computation.feeMinor).toBe(500);
  });
});

describe("a free-listing worker's bookings", () => {
  it("charge 12% commission on an accepted quote", async () => {
    const free = WORKERS.find((w) => subscriptionStatus(w.subscription) === "expired");
    expect(free).toBeTruthy();
    const slot = demoAddSlot(free!.id, new Date(2027, 1, 3, 9).toISOString(), new Date(2027, 1, 3, 10).toISOString());
    const created = (await createBookingRequest({
      workerId: free!.id,
      slotId: slot.id,
      customerName: "Noor E.",
      customerPhone: "+961 70 123 456",
      jobTitle: "Fix a leaking pipe",
    })) as Booking;
    const accepted = await respondToBooking(created.id, { accept: true, quote: 10_000 });
    expect(accepted?.platformFee).toBe(1_200);
    expect(accepted?.platformFeeRateBps).toBe(1_200);
  });
});

describe("lead offers", () => {
  it("are never made to a worker without an active plan", async () => {
    await saveFeeRuleSet({ leadMarket: { minWalletCredits: 0 } });
    const base = { categorySlug: "plumbing", citySlug: "beirut", rating: 4.5, reviewCount: 20, responseRate: 80, availableThisWeek: true, emergency: false, verified: true };
    const result = await offerQualifiedLead({
      lead: { id: "qr-free", number: "QR-2026-00300", jobTitle: "Leak", categorySlug: "plumbing", citySlug: "beirut" },
      candidates: [
        { ...base, workerId: "w-paying", plan: "basic" },
        { ...base, workerId: "w-free", plan: null },
      ],
    });
    expect(result.created.map((o) => o.workerId)).toEqual(["w-paying"]);
  });
});
