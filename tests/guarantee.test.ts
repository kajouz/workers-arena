import { beforeEach, describe, expect, it } from "vitest";
import {
  GUARANTEE_TERMS,
  completedAtOf,
  fileGuaranteeClaim,
  guaranteeClaimsForBookings,
  guaranteeCover,
  listGuaranteeClaims,
  resetGuaranteeClaimStore,
  resolveGuaranteeClaim,
  validateResolution,
} from "../src/lib/data/guarantee";
import { settlementFor } from "../src/lib/data/booking-settlement";

const DAY = 24 * 60 * 60 * 1000;
const completedAt = "2026-09-20T10:00:00.000Z";
const at = (days: number) => Date.parse(completedAt) + days * DAY;

const paid = settlementFor({ quoteMinor: 15_000, feeMinor: 1_050, depositPaidMinor: 15_000 });
const smallPaid = settlementFor({ quoteMinor: 4_000, feeMinor: 500, depositPaidMinor: 4_000 });
const cash = settlementFor({ quoteMinor: 15_000, feeMinor: 1_050, settledOutside: true });
const unpaid = settlementFor({ quoteMinor: 15_000, feeMinor: 1_050 });

describe("guaranteeCover — only jobs paid through WorkersArena", () => {
  it("covers a completed, fully paid job inside the window, capped at $100", () => {
    const cover = guaranteeCover({ status: "completed", completedAt, settlement: paid, nowMs: at(3) });
    expect(cover).toMatchObject({ covered: true, reason: "covered", coverMinor: GUARANTEE_TERMS.capMinor });
    expect(cover.windowEndsAt).toBe(new Date(at(7)).toISOString());
  });

  it("never covers more than the platform collected", () => {
    expect(guaranteeCover({ status: "completed", completedAt, settlement: smallPaid, nowMs: at(1) }).coverMinor).toBe(4_000);
  });

  it("does not cover cash or unpaid jobs", () => {
    expect(guaranteeCover({ status: "completed", completedAt, settlement: cash, nowMs: at(1) }).reason).toBe(
      "not-paid-on-platform"
    );
    expect(guaranteeCover({ status: "completed", completedAt, settlement: unpaid, nowMs: at(1) }).reason).toBe(
      "not-paid-on-platform"
    );
  });

  it("closes after 7 days, and needs a readable completion time", () => {
    expect(guaranteeCover({ status: "completed", completedAt, settlement: paid, nowMs: at(7) }).covered).toBe(true);
    expect(guaranteeCover({ status: "completed", completedAt, settlement: paid, nowMs: at(7) + 1 }).reason).toBe(
      "window-closed"
    );
    expect(guaranteeCover({ status: "completed", completedAt: null, settlement: paid, nowMs: at(1) }).covered).toBe(false);
    expect(guaranteeCover({ status: "inProgress", completedAt, settlement: paid, nowMs: at(1) }).reason).toBe(
      "not-completed"
    );
  });

  it("takes the latest completion event", () => {
    expect(
      completedAtOf([
        { status: "requested", time: "2026-09-01T00:00:00Z" },
        { status: "completed", time: "2026-09-10T00:00:00Z" },
        { status: "message", time: "2026-09-11T00:00:00Z" },
      ])
    ).toBe("2026-09-10T00:00:00Z");
    expect(completedAtOf([])).toBeNull();
  });
});

describe("validateResolution", () => {
  it("allows a refund up to the cover, once", () => {
    expect(validateResolution({ status: "open", coverMinor: 4_000 }, "refunded", 4_000)).toEqual({
      ok: true,
      refundMinor: 4_000,
    });
    expect(validateResolution({ status: "open", coverMinor: 4_000 }, "refunded", 4_001)).toMatchObject({ ok: false });
    expect(validateResolution({ status: "open", coverMinor: 4_000 }, "refunded", 0)).toMatchObject({ ok: false });
    expect(validateResolution({ status: "refunded", coverMinor: 4_000 }, "redo")).toEqual({
      ok: false,
      error: "already-resolved",
    });
  });
});

describe("claims (demo store)", () => {
  beforeEach(() => resetGuaranteeClaimStore());

  const input = {
    bookingId: "bk1",
    bookingNumber: "BK-0001",
    workerId: "w1",
    customerName: "Rana",
    description: "The tap still leaks after the repair.",
    coverMinor: 10_000,
    currency: "USD",
  };

  it("files one claim per booking and lists open claims first", async () => {
    expect((await fileGuaranteeClaim(input)).ok).toBe(true);
    expect(await fileGuaranteeClaim(input)).toEqual({ ok: false, error: "already-filed" });
    expect(await fileGuaranteeClaim({ ...input, bookingId: "bk2", description: "short" })).toEqual({
      ok: false,
      error: "invalid",
    });
    const claims = await guaranteeClaimsForBookings(["bk1", "bk2"]);
    expect(claims.get("bk1")?.status).toBe("open");
    expect(claims.has("bk2")).toBe(false);
  });

  it("resolves a claim once, with the refund bounded by the cover", async () => {
    const filed = await fileGuaranteeClaim(input);
    if (!filed.ok) throw new Error("not filed");
    const id = filed.claim.id;
    expect(await resolveGuaranteeClaim({ claimId: id, outcome: "refunded", refundMinor: 20_000, adminId: "a" })).toEqual({
      ok: false,
      error: "invalid-refund",
    });
    const done = await resolveGuaranteeClaim({ claimId: id, outcome: "refunded", refundMinor: 6_000, adminId: "a" });
    expect(done).toMatchObject({ ok: true, claim: { status: "refunded", refundMinor: 6_000, resolvedBy: "a" } });
    expect(await resolveGuaranteeClaim({ claimId: id, outcome: "rejected", adminId: "a" })).toEqual({
      ok: false,
      error: "already-resolved",
    });
    const list = await listGuaranteeClaims();
    expect(list.map((c) => c.status)).toEqual(["refunded"]);
  });
});
