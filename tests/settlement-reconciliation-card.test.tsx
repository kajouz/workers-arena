// @vitest-environment jsdom
/**
 * §Settlement — the admin reconciliation card.
 *
 * The arithmetic is covered by tests/booking-settlement.test.ts; this file
 * covers the WIRING: that the card renders the engine's numbers, labels each
 * job with its real settlement state, and puts exactly the actionable jobs in
 * front of an admin — including the canary case, a funded job whose ledger
 * credit exceeds what the platform ever collected.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SettlementReconciliationCard } from "@/components/admin/settlement-reconciliation";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { settlementFor, settlementJob, type SettlementFacts, type SettlementJob } from "@/lib/data/booking-settlement";
import { formatPrice } from "@/lib/utils";
import { TENANT_CURRENCY } from "@/lib/currency";

afterEach(cleanup);

const money = (minor: number) => formatPrice(minor / 100, TENANT_CURRENCY, "en");

/** One reconciliation row, built through the real engine (never hand-made). */
function row(opts: { id: string; facts: SettlementFacts; credited: number }): SettlementJob {
  return settlementJob({
    bookingId: opts.id,
    number: `BK-${opts.id}`,
    workerId: `w-${opts.id}`,
    workerNameEn: "Khaled Al-Harbi",
    workerNameAr: "خالد الحربي",
    status: "completed",
    reference: null,
    settlement: settlementFor(opts.facts),
    creditedMinor: opts.credited,
  });
}

/** Funded: the deposit covered the $300 quote, so the worker's $279 is real money. */
const FUNDED = row({
  id: "funded",
  facts: { quoteMinor: 30_000, feeMinor: 2_100, depositPaidMinor: 30_000, currency: "USD" },
  credited: 27_900,
});
/**
 * Part-funded: a $100 deposit against a $300 quote. The fee came out of real
 * money, the worker holds $79, and the remaining $39 of their share is blocked
 * until the balance is collected — the one state that blocks a credit.
 */
const PART = row({
  id: "part",
  facts: { quoteMinor: 30_000, feeMinor: 2_100, depositPaidMinor: 10_000, currency: "USD" },
  credited: 4_000,
});
/** Quote-only, nothing even requested: no credit exists yet, so nothing is owed. */
const AWAITING = row({
  id: "awaiting",
  facts: { quoteMinor: 20_000, feeMinor: 1_400, currency: "USD" },
  credited: 0,
});
/** Settled between the parties: nothing credited, the $28 fee is a claim. */
const OUTSIDE = row({
  id: "outside",
  facts: { quoteMinor: 40_000, feeMinor: 2_800, settledOutside: true, feeClaimCollectedMinor: 800, currency: "USD" },
  credited: 0,
});

function renderCard(jobs: SettlementJob[]) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <SettlementReconciliationCard jobs={jobs} />
    </LocaleProvider>
  );
}

describe("SettlementReconciliationCard — the collected-vs-stamped audit", () => {
  it("renders fees stamped against fees actually collected, plus the claims", () => {
    renderCard([FUNDED, PART, AWAITING, OUTSIDE]);

    expect(screen.getByText("Settlement reconciliation")).toBeInTheDocument();
    expect(screen.getByText(money(8_400))).toBeInTheDocument(); // stamped: 21+21+14+28
    expect(screen.getByText(money(4_200))).toBeInTheDocument(); // collected: 21+21
    expect(screen.getByText(money(1_400))).toBeInTheDocument(); // awaiting customers
    expect(screen.getByText(money(0))).toBeInTheDocument(); // unbacked canary
    expect(screen.getByText(money(120_000))).toBeInTheDocument(); // job value
    expect(screen.getByText(`${money(40_000)} collected of the total`)).toBeInTheDocument();
    // One blocked job, so "owed" and "blocked on collection" are the same $39 —
    // and the queued row shows it a third time as its amount due.
    expect(screen.getByText("Across 1 job(s) blocked on collection")).toBeInTheDocument();
    expect(screen.getByText("Worker earnings waiting for the customer to pay")).toBeInTheDocument();
    expect(screen.getAllByText(money(3_900))).toHaveLength(3);
    // The outside-platform claim, its recovered part, and the outstanding rest.
    expect(screen.getByText(money(2_800))).toBeInTheDocument();
    expect(screen.getByText(money(800))).toBeInTheDocument();
    expect(screen.getByText(money(2_000))).toBeInTheDocument();
  });

  it("queues the actionable jobs and leaves the settled ones out", () => {
    renderCard([FUNDED, PART, AWAITING, OUTSIDE]);

    // Ranked: an outstanding claim, then a credit blocked on collection.
    expect(screen.getByText("BK-outside")).toBeInTheDocument();
    expect(screen.getByText("BK-part")).toBeInTheDocument();
    // Nothing to do about a fully funded job ...
    expect(screen.queryByText("BK-funded")).not.toBeInTheDocument();
    // ... and nothing owed on a job whose customer has not paid at all, so it
    // is a follow-up rather than a blocked payout.
    expect(screen.queryByText("BK-awaiting")).not.toBeInTheDocument();

    expect(screen.getByText("Settled outside")).toBeInTheDocument();
    expect(screen.getByText("Part-funded")).toBeInTheDocument();
  });

  it("surfaces an unbacked credit as the canary — and puts it first", () => {
    // The defect this engine exists to prevent: $300 collected, but $400
    // credited to the worker's withdrawable balance.
    const unbacked = row({
      id: "unbacked",
      facts: { quoteMinor: 30_000, feeMinor: 2_100, depositPaidMinor: 30_000, currency: "USD" },
      credited: 40_000,
    });
    renderCard([unbacked, PART]);

    expect(screen.getByText(money(10_000))).toBeInTheDocument(); // credited − collected
    expect(screen.getByText("BK-unbacked")).toBeInTheDocument();
    // A "funded" job is normally excluded from the queue; an unbacked credit
    // jumps it to the front instead.
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
  });

  it("says so when nothing is blocked or unbacked", () => {
    renderCard([FUNDED]);
    expect(
      screen.getByText("Nothing is blocked or unbacked — every credited job was collected.")
    ).toBeInTheDocument();
  });

  it("renders the empty state for an empty window", () => {
    renderCard([]);
    expect(screen.getByText("Settlement reconciliation")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is blocked or unbacked — every credited job was collected.")
    ).toBeInTheDocument();
  });
});
