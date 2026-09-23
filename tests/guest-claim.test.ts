/**
 * §Guest → account claim (docs/ENHANCEMENT-PLAN.md Phase 2, docs/guest-claim.md).
 *
 * The engine decides which phone-keyed guest records a newly-created account
 * inherits. Every test here is a rule the module header claims, because the cost
 * of getting one wrong is somebody else's booking history landing in an account:
 * the phone is the credential, an email is not, and an owned record is never
 * taken.
 */
import { describe, expect, it } from "vitest";
import {
  emailOnlyMatches,
  normalizeClaimPhone,
  planGuestClaim,
  planGuestClaimAll,
  summarizeGuestClaim,
  type ClaimableRecord,
} from "../src/lib/data/guest-claim";
import type { Booking, QuoteRequest, RecurringBooking } from "../src/lib/data/types";

const rec = (over: Partial<ClaimableRecord> & { id: string }): ClaimableRecord & { id: string } => ({
  customerId: null,
  customerPhone: "+961 70 123 456",
  customerEmail: null,
  ...over,
});

const ME = { userId: "u-1", phone: "+96170123456", email: "nour@example.com" };

describe("normalizeClaimPhone", () => {
  it("makes the formatted and bare forms of one number identical", () => {
    expect(normalizeClaimPhone("+961 70 123 456")).toBe("+96170123456");
    expect(normalizeClaimPhone("+961-70-123-456")).toBe("+96170123456");
    expect(normalizeClaimPhone("(961) 70123456")).toBe("96170123456");
  });

  it("treats absent and empty as no phone", () => {
    expect(normalizeClaimPhone(null)).toBeNull();
    expect(normalizeClaimPhone("")).toBeNull();
    expect(normalizeClaimPhone("   ")).toBeNull();
  });
});

describe("planGuestClaim", () => {
  it("claims a guest record made with the same number in a different format", () => {
    const plan = planGuestClaim([rec({ id: "b1", customerPhone: "+961 70 123 456" })], ME);
    expect(plan.claimable).toEqual(["b1"]);
    expect(plan.foreign).toEqual([]);
    expect(plan.alreadyOwned).toEqual([]);
  });

  it("never claims on an email match alone", () => {
    // Same address, different handset: reported, not handed over. Registration
    // does not verify email, so this string is not proof of anything.
    const rows = [rec({ id: "b1", customerPhone: "+961 71 999 999", customerEmail: "nour@example.com" })];
    const plan = planGuestClaim(rows, ME);
    expect(plan.claimable).toEqual([]);
    expect(plan.skipReasons.b1).toBe("phone-mismatch");
    expect(emailOnlyMatches(rows, ME)).toEqual(["b1"]);
  });

  it("does not touch a record that already belongs to another account", () => {
    const plan = planGuestClaim(
      [rec({ id: "b1", customerId: "u-other" })],
      ME
    );
    expect(plan.claimable).toEqual([]);
    expect(plan.foreign).toEqual(["b1"]);
    expect(plan.skipReasons.b1).toBe("other-account");
  });

  it("reports a record it already owns instead of re-linking it", () => {
    const plan = planGuestClaim([rec({ id: "b1", customerId: "u-1" })], ME);
    expect(plan.claimable).toEqual([]);
    expect(plan.alreadyOwned).toEqual(["b1"]);
    expect(plan.skipReasons.b1).toBe("already-owned");
    // Idempotence: a second run over the same rows plans nothing to write.
    expect(summarizeGuestClaim({ bookings: plan, quoteRequests: plan, recurrings: plan }).linked).toBe(0);
  });

  it("claims nothing when the account presents no phone", () => {
    const plan = planGuestClaim([rec({ id: "b1" })], { userId: "u-1", phone: null });
    expect(plan.claimable).toEqual([]);
    expect(plan.skipReasons.b1).toBe("phone-mismatch");
  });

  it("claims nothing without an account to link to", () => {
    const plan = planGuestClaim([rec({ id: "b1" })], { userId: "", phone: "+96170123456" });
    expect(plan.claimable).toEqual([]);
  });

  it("sorts a mixed batch into claimable / ours / theirs", () => {
    const plan = planGuestClaim(
      [
        rec({ id: "guest-mine" }),
        rec({ id: "guest-other-phone", customerPhone: "+961 3 000 111" }),
        rec({ id: "owned-by-me", customerId: "u-1" }),
        rec({ id: "owned-by-someone", customerId: "u-9" }),
      ],
      ME
    );
    expect(plan.claimable).toEqual(["guest-mine"]);
    expect(plan.alreadyOwned).toEqual(["owned-by-me"]);
    expect(plan.foreign).toEqual(["owned-by-someone"]);
    expect(plan.skipReasons["guest-other-phone"]).toBe("phone-mismatch");
  });
});

describe("planGuestClaimAll", () => {
  it("carries the same claim across bookings, quote requests and recurrings", () => {
    const booking = { id: "b1", customerPhone: "+961 70 123 456" } as unknown as Booking;
    const quote = { id: "q1", customerPhone: "+961 70 123 456" } as unknown as QuoteRequest;
    const recurring = { id: "r1", customerPhone: "+96170888999" } as unknown as RecurringBooking;

    const plans = planGuestClaimAll({ bookings: [booking], quoteRequests: [quote], recurrings: [recurring], identity: ME });
    const result = summarizeGuestClaim(plans);

    // A guest who asked for quotes keeps them too — the history is the whole point.
    expect(result.linked).toBe(2);
    expect(plans.recurrings.claimable).toEqual([]);
    expect(plans.recurrings.skipReasons.r1).toBe("phone-mismatch");
  });

  it("is empty for an account with nothing to claim", () => {
    const result = summarizeGuestClaim(
      planGuestClaimAll({ bookings: [], identity: { userId: "u-1", phone: "+96170123456" } })
    );
    expect(result).toMatchObject({ linked: 0, alreadyLinked: 0, ownedElsewhere: 0 });
  });
});

describe("emailOnlyMatches", () => {
  it("stays silent for a record that matches on the phone", () => {
    expect(emailOnlyMatches([rec({ id: "b1", customerEmail: "nour@example.com" })], ME)).toEqual([]);
  });

  it("stays silent for an owned record, however it matches", () => {
    const rows = [rec({ id: "b1", customerId: "u-9", customerEmail: "nour@example.com", customerPhone: "+961 3 000 111" })];
    expect(emailOnlyMatches(rows, ME)).toEqual([]);
  });

  it("is case- and whitespace-insensitive on the email", () => {
    const rows = [rec({ id: "b1", customerPhone: "+961 3 000 111", customerEmail: "  NOUR@Example.com " })];
    expect(emailOnlyMatches(rows, ME)).toEqual(["b1"]);
  });

  it("reports nothing without an email to compare", () => {
    expect(emailOnlyMatches([rec({ id: "b1", customerPhone: "+961 3 000 111" })], { userId: "u-1", phone: "+96170123456" })).toEqual([]);
  });
});
