/**
 * applyReferralBonusAction — the payout side of the referral program.
 * Runs against the demo referral store and demo credit ledger; only the
 * session, next/cache and the activity log are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ACTING } from "./helpers/acting-session";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/activity", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  logAdminActivity: vi.fn(),
}));

import { applyReferralBonusAction } from "@/app/actions/referrals";
import { recordReferral, resetReferralStore } from "@/lib/data/referral-store";
import {
  grantCredits,
  listCreditLedger,
  resetCreditLedgerStore,
} from "@/lib/data/credit-ledger";
import {
  DEFAULT_REFERRAL_CONFIG,
  countRewardedReferrals,
  referrerBonusKey,
} from "@/lib/data/referral";

const REFERRER = "w-referrer";

async function refer(invitee: string) {
  await recordReferral({ referrerWorkerId: REFERRER, inviteeWorkerId: invitee, code: "ABCDEFGH" });
}

describe("applyReferralBonusAction", () => {
  beforeEach(() => {
    resetReferralStore();
    resetCreditLedgerStore();
    getSessionMock.mockResolvedValue(ACTING.admin);
  });

  it("pays both sides for a recorded referral", async () => {
    await refer("w-invitee");
    const result = await applyReferralBonusAction({ referrerWorkerId: REFERRER, inviteeWorkerId: "w-invitee" });
    expect(result).toEqual({
      ok: true,
      referrerBonus: DEFAULT_REFERRAL_CONFIG.referrerBonus,
      inviteeBonus: DEFAULT_REFERRAL_CONFIG.inviteeBonus,
    });
  });

  it("pays nothing twice when applied again", async () => {
    await refer("w-invitee");
    await applyReferralBonusAction({ referrerWorkerId: REFERRER, inviteeWorkerId: "w-invitee" });
    const again = await applyReferralBonusAction({ referrerWorkerId: REFERRER, inviteeWorkerId: "w-invitee" });
    expect(again).toEqual({ ok: true, referrerBonus: 0, inviteeBonus: 0 });
    expect(await listCreditLedger(100, REFERRER)).toHaveLength(1);
    expect(await listCreditLedger(100, "w-invitee")).toHaveLength(1);
  });

  it("refuses a pair that is not a recorded referral", async () => {
    await refer("w-invitee");
    const result = await applyReferralBonusAction({ referrerWorkerId: "w-other", inviteeWorkerId: "w-invitee" });
    expect(result.ok).toBe(false);
    expect(await listCreditLedger(100, "w-other")).toHaveLength(0);
    expect(await listCreditLedger(100, "w-invitee")).toHaveLength(0);
  });

  it("stops paying the referrer at the monthly cap, but still welcomes the invitee", async () => {
    // The referrer has already been paid for a full month of referrals.
    for (let i = 0; i < DEFAULT_REFERRAL_CONFIG.monthlyCap; i++) {
      await grantCredits({
        workerId: REFERRER,
        amount: DEFAULT_REFERRAL_CONFIG.referrerBonus,
        reason: "Referral bonus",
        promotionId: referrerBonusKey(`w-earlier-${i}`),
      });
    }
    await refer("w-invitee");
    const result = await applyReferralBonusAction({ referrerWorkerId: REFERRER, inviteeWorkerId: "w-invitee" });
    expect(result).toEqual({ ok: true, referrerBonus: 0, inviteeBonus: DEFAULT_REFERRAL_CONFIG.inviteeBonus });
  });

  it("is admin-only", async () => {
    getSessionMock.mockResolvedValue(ACTING.worker);
    await refer("w-invitee");
    const result = await applyReferralBonusAction({ referrerWorkerId: REFERRER, inviteeWorkerId: "w-invitee" });
    expect(result.ok).toBe(false);
  });
});

describe("countRewardedReferrals", () => {
  const now = new Date("2026-09-15T12:00:00Z");
  const grant = (promotionId: string | undefined, createdAt: string, amount = 25, kind = "grant") => ({
    kind,
    amount,
    promotionId,
    createdAt,
  });

  it("counts only referrer bonuses, split by UTC month", () => {
    const counts = countRewardedReferrals(
      [
        grant(referrerBonusKey("a"), "2026-09-01T00:00:00Z"),
        grant(referrerBonusKey("b"), "2026-08-31T23:59:59Z"),
        grant("referral-welcome:c", "2026-09-02T00:00:00Z"), // invitee's own welcome bonus
        grant("lead-allowance:2026-09", "2026-09-02T00:00:00Z"),
        grant(undefined, "2026-09-02T00:00:00Z"),
        grant(referrerBonusKey("d"), "2026-09-03T00:00:00Z", -25, "adjustment"),
      ],
      now
    );
    expect(counts).toEqual({ monthly: 1, lifetime: 2 });
  });
});
