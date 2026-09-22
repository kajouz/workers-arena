import { describe, expect, it } from "vitest";
import {
  feeClaimPlan,
  ledgerDeltaFor,
  payoutGuard,
  settlementFor,
  settlementNeedsCollection,
  settlementPayable,
  tallySettlements,
  type SettlementFacts,
} from "../src/lib/data/booking-settlement";

/** A $300 job at the 7% take rate (the shipped default rule set). */
const JOB: SettlementFacts = {
  quoteMinor: 30_000,
  feeMinor: 2_100,
  currency: "USD",
};

describe("settlementFor — where the money stands", () => {
  it("a quote-less accept has nothing to collect and credits nothing", () => {
    const s = settlementFor({ quoteMinor: null, feeMinor: null, depositPaidMinor: 5_000 });
    expect(s.state).toBe("no-quote");
    expect(s.workerNetTargetMinor).toBe(0);
    expect(s.feeClaimMinor).toBe(0);
    expect(s.outstandingMinor).toBe(0);
  });

  it("a deposit that covers the whole quote funds the job — the pre-engine behaviour", () => {
    const s = settlementFor({ ...JOB, depositPaidMinor: 30_000 });
    expect(s.state).toBe("funded");
    expect(s.collectedMinor).toBe(30_000);
    expect(s.outstandingMinor).toBe(0);
    expect(s.feeCollectedMinor).toBe(2_100);
    expect(s.workerNetTargetMinor).toBe(27_900);
    expect(settlementPayable(s)).toBe(true);
    expect(settlementNeedsCollection(s)).toBe(false);
  });

  it("an unfunded quote-only job credits NOTHING — the hole this engine closes", () => {
    const s = settlementFor(JOB);
    expect(s.state).toBe("awaiting-customer");
    expect(s.collectedMinor).toBe(0);
    expect(s.workerNetTargetMinor).toBe(0);
    expect(s.outstandingMinor).toBe(30_000);
    expect(settlementNeedsCollection(s)).toBe(true);
    expect(ledgerDeltaFor(s, 0)).toEqual({ amountMinor: 0, kind: null, reason: s.reason });
  });

  it("an issued manual reference reads as awaiting confirmation, not as money", () => {
    const s = settlementFor({ ...JOB, settlementPendingMinor: 30_000 });
    expect(s.state).toBe("awaiting-confirmation");
    expect(s.collectedMinor).toBe(0);
    expect(s.workerNetTargetMinor).toBe(0);
  });

  it("a part-funded job pays the collected part now and the rest on settlement", () => {
    const partFunded = settlementFor({ ...JOB, depositPaidMinor: 5_000 });
    expect(partFunded.state).toBe("part-funded");
    expect(partFunded.feeCollectedMinor).toBe(2_100); // the fee came out of real money
    expect(partFunded.workerNetTargetMinor).toBe(2_900);
    expect(partFunded.outstandingMinor).toBe(25_000);

    // The deposit portion posts as the booking's ONE earning row.
    const first = ledgerDeltaFor(partFunded, 0);
    expect(first).toEqual({ amountMinor: 2_900, kind: "earning", reason: partFunded.reason });

    // The settlement lands → the top-up posts as an adjustment, never a
    // second earning (the ledger allows one EARNING per booking).
    const funded = settlementFor({ ...JOB, depositPaidMinor: 5_000, settlementPaidMinor: 25_000 });
    expect(funded.state).toBe("funded");
    expect(funded.workerNetTargetMinor).toBe(27_900);
    const topUp = ledgerDeltaFor(funded, 2_900);
    expect(topUp.amountMinor).toBe(25_000);
    expect(topUp.kind).toBe("adjustment");
  });

  it("never credits more than collected when the deposit is smaller than the fee", () => {
    const s = settlementFor({ ...JOB, depositPaidMinor: 1_000 });
    expect(s.feeCollectedMinor).toBe(1_000); // fees come out of received money
    expect(s.workerNetTargetMinor).toBe(0);
    expect(ledgerDeltaFor(s, 0).kind).toBeNull();
  });

  it("a refunded deposit takes the money back out of the settlement", () => {
    const s = settlementFor({ ...JOB, depositPaidMinor: 30_000, depositRefundedMinor: 30_000 });
    expect(s.collectedMinor).toBe(0);
    expect(s.state).toBe("awaiting-customer");
    expect(s.workerNetTargetMinor).toBe(0);
  });

  it("a job settled between the parties credits nothing and claims the fee", () => {
    const s = settlementFor({ ...JOB, settledOutside: true });
    expect(s.state).toBe("outside-platform");
    expect(s.collectedMinor).toBe(0);
    expect(s.workerNetTargetMinor).toBe(0);
    expect(s.feeCollectedMinor).toBe(0);
    expect(s.feeClaimMinor).toBe(2_100);
    expect(ledgerDeltaFor(s, 0).kind).toBeNull();
  });

  it("over-collection is flagged rather than silently kept", () => {
    const s = settlementFor({ ...JOB, depositPaidMinor: 30_000, settlementPaidMinor: 10_000 });
    expect(s.state).toBe("overpaid");
    expect(s.collectedMinor).toBe(40_000);
    expect(s.workerNetTargetMinor).toBe(37_900);
    expect(s.reason).toContain("Over-collected");
  });

  it("is idempotent — a re-run against an already-credited job posts nothing", () => {
    const s = settlementFor({ ...JOB, depositPaidMinor: 30_000 });
    expect(ledgerDeltaFor(s, 27_900)).toEqual({ amountMinor: 0, kind: null, reason: s.reason });
    expect(ledgerDeltaFor(s, 30_000).amountMinor).toBe(0); // a legacy over-credit never reverses
  });

  it("tolerates junk inputs without producing money", () => {
    const s = settlementFor({
      quoteMinor: 30_000,
      feeMinor: -50,
      depositPaidMinor: Number.NaN,
      settlementRefundedMinor: -100,
    });
    expect(s.feeMinor).toBe(0);
    expect(s.collectedMinor).toBe(0);
    expect(s.workerNetTargetMinor).toBe(0);
  });
});

describe("feeClaimPlan — collecting an outside-platform fee from credits", () => {
  it("spends whole credits, leaving the remainder as a claim", () => {
    // $21 claim, 30 credits on hand → 21 credits spent, nothing left.
    expect(feeClaimPlan(2_100, 30)).toEqual({ debitCredits: 21, debitMinor: 2_100, remainingMinor: 0 });
  });

  it("caps at the balance and keeps the rest outstanding", () => {
    // $21 claim, 5 credits → 5 credits ($5) spent, $16 remains claimed.
    expect(feeClaimPlan(2_100, 5)).toEqual({ debitCredits: 5, debitMinor: 500, remainingMinor: 1_600 });
  });

  it("a fractional claim rounds up to the next credit but never over-debits", () => {
    // $3.50 claim with 2 credits → 2 credits = $2 spent, $1.50 remains.
    expect(feeClaimPlan(350, 2)).toEqual({ debitCredits: 2, debitMinor: 200, remainingMinor: 150 });
  });

  it("an empty balance or no claim debits nothing", () => {
    expect(feeClaimPlan(2_100, 0)).toEqual({ debitCredits: 0, debitMinor: 0, remainingMinor: 2_100 });
    expect(feeClaimPlan(0, 40)).toEqual({ debitCredits: 0, debitMinor: 0, remainingMinor: 0 });
  });
});

describe("payoutGuard", () => {
  it("refuses a non-positive request", () => {
    expect(payoutGuard({ availableMinor: 5_000, pendingMinor: 0, requestedMinor: 0 })).toEqual({
      ok: false,
      error: "invalid",
    });
  });

  it("counts pending reservations as unspendable", () => {
    expect(payoutGuard({ availableMinor: 5_000, pendingMinor: 4_000, requestedMinor: 2_000 })).toEqual({
      ok: false,
      error: "insufficient",
    });
    expect(payoutGuard({ availableMinor: 5_000, pendingMinor: 4_000, requestedMinor: 1_000 })).toEqual({ ok: true });
  });
});

describe("tallySettlements — the reconciliation numbers", () => {
  it("sums what was collected against what was stamped and claimed", () => {
    const rows = [
      settlementFor({ ...JOB, depositPaidMinor: 30_000 }), // funded
      settlementFor(JOB), // awaiting-customer
      settlementFor({ ...JOB, settledOutside: true }), // claim
      settlementFor({ quoteMinor: null, feeMinor: null }), // no-quote
    ];
    const t = tallySettlements(rows);
    expect(t.jobs).toBe(4);
    expect(t.collectedMinor).toBe(30_000);
    expect(t.outstandingMinor).toBe(60_000); // two $300 jobs uncollected
    expect(t.feeStampedMinor).toBe(2_100 * 3); // the quote-less job stamped no fee
    expect(t.feeCollectedMinor).toBe(2_100);
    expect(t.feeClaimMinor).toBe(2_100);
    expect(t.byState).toMatchObject({ funded: 1, "awaiting-customer": 1, "outside-platform": 1, "no-quote": 1 });
  });
});
