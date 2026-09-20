// @vitest-environment jsdom
/**
 * §7–§10 — the lead marketplace UI: the admin policy panel and the worker's
 * board. The panel's job is to publish a clamped policy through the admin
 * action; the board's job is to render the SERVER's reveal decision (masked
 * before purchase, full after) and to buy through the worker action.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LeadMarketPanel } from "@/components/admin/lead-market-panel";
import { LeadBoard } from "@/components/dashboard/leads/lead-board";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { Toaster } from "@/components/ui/toast";
import { DEFAULT_FEE_RULE_SET } from "@/lib/data/fee-rules";
import {
  DEFAULT_LEAD_MARKET_CONFIG,
  leadBoardItemFor,
  splitLeadBoard,
  type LeadOffer,
} from "@/lib/data/lead-market";
import type { WorkerLeadBoard } from "@/lib/data/repo";
import type { CreditLedgerEntry } from "@/lib/data/credit-ledger";
import type { LeadRebate } from "@/lib/data/lead-rebate";
import type { SurgeReport } from "@/lib/data/surge-report";

const { saveLeadMarketConfigActionMock, buyLeadOfferActionMock, grantWorkerCreditsActionMock, refreshMock } = vi.hoisted(
  () => ({
    saveLeadMarketConfigActionMock: vi.fn(),
    buyLeadOfferActionMock: vi.fn(),
    grantWorkerCreditsActionMock: vi.fn(),
    refreshMock: vi.fn(),
  })
);
vi.mock("@/app/actions/leads", () => ({
  saveLeadMarketConfigAction: saveLeadMarketConfigActionMock,
  buyLeadOfferAction: buyLeadOfferActionMock,
  grantWorkerCreditsAction: grantWorkerCreditsActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

afterEach(() => {
  cleanup();
  saveLeadMarketConfigActionMock.mockReset();
  buyLeadOfferActionMock.mockReset();
  grantWorkerCreditsActionMock.mockReset();
  refreshMock.mockReset();
});

function wrap(node: React.ReactNode) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      {node}
      {/* Toasts render here, so a test can read what the user was told. */}
      <Toaster />
    </LocaleProvider>
  );
}

/* ────────────────────────────── Admin panel ────────────────────────────── */

const ledgerEntry: CreditLedgerEntry = {
  id: "ce-1",
  workerId: "khaled-plum",
  kind: "grant",
  amount: 60,
  balanceAfter: 60,
  reason: "Demo seed",
  createdAt: "2026-09-14T10:00:00.000Z",
};

const offer: LeadOffer = {
  id: "offer-1",
  leadId: "qr-1",
  leadNumber: "QR-2026-00042",
  workerId: "khaled-plum",
  grade: "gold",
  matchScore: 88,
  priceCredits: 20,
  status: "offered",
  exclusive: true,
  offeredAt: "2026-09-14T10:00:00.000Z",
  expiresAt: "2026-09-14T12:00:00.000Z",
};

const rebateApplied: LeadRebate = {
  id: "lreb-1",
  bookingId: "bk-1",
  leadId: "qr-1",
  offerId: "offer-1",
  workerId: "khaled-plum",
  leadCostCredits: 20,
  leadCostMinor: 2_000,
  feeMinor: 2_100,
  rebateMinor: 2_000,
  effectiveFeeMinor: 100,
  pctBps: 10_000,
  maxMinor: null,
  limitedBy: "lead-cost",
  ruleId: DEFAULT_FEE_RULE_SET.id,
  ruleVersion: 1,
  currency: "USD",
  createdAt: "2026-09-14T12:00:00.000Z",
};

describe("LeadMarketPanel", () => {
  it("shows the current policy: prices per grade, caps, reveal rules and weights", () => {
    wrap(
      <LeadMarketPanel ruleSet={DEFAULT_FEE_RULE_SET} offers={[offer]} credits={[ledgerEntry]} rebates={[rebateApplied]} />
    );
    expect(screen.getByText("Lead marketplace")).toBeInTheDocument();
    // The four grades are priced from the rule set (defaults: 5/9/20/35).
    for (const label of ["Bronze", "Silver", "Gold", "Emergency"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // Prices come from the shipped policy: 5 / 9 / 20 / 35 credits.
    expect(screen.getAllByDisplayValue("5").length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue("9")).toBeInTheDocument();
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
    expect(screen.getByDisplayValue("35")).toBeInTheDocument();
    // Ownership + reveal are editable, and the offer/ledger audit is listed.
    expect(screen.getByText("Distribution & ownership")).toBeInTheDocument();
    expect(screen.getByText("Contact reveal")).toBeInTheDocument();
    expect(screen.getAllByText(/QR-2026-00042/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Demo seed/)).toBeInTheDocument();
    expect(screen.getByText(/3 workers per lead · 120 min window/)).toBeInTheDocument();
    // §11 — the rebate policy and what it has given back so far.
    expect(screen.getByText("Lead rebate")).toBeInTheDocument();
    expect(screen.getByText(/1 rebate\(s\) applied · \$20\.00 given back on \$21\.00 of fees/)).toBeInTheDocument();
    expect(screen.getByText(/capped by the lead's price/)).toBeInTheDocument();
  });

  it("publishes the edited policy through the admin action", async () => {
    saveLeadMarketConfigActionMock.mockResolvedValue({ ok: true, version: 3 });
    wrap(<LeadMarketPanel ruleSet={DEFAULT_FEE_RULE_SET} offers={[]} credits={[]} rebates={[]} />);

    // Change the gold price and the worker cap, then publish.
    fireEvent.change(screen.getByLabelText(/Gold/), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText(/Workers offered per lead/), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish lead policy/ }));

    await waitFor(() => expect(saveLeadMarketConfigActionMock).toHaveBeenCalledTimes(1));
    const payload = saveLeadMarketConfigActionMock.mock.calls[0]?.[0];
    expect(payload.prices.gold).toBe(25);
    expect(payload.maxWorkersPerLead).toBe(5);
    // The untouched grades travel with the policy rather than being dropped.
    expect(payload.prices.bronze).toBe(DEFAULT_LEAD_MARKET_CONFIG.prices.bronze);
    expect(payload.reveal).toEqual(DEFAULT_LEAD_MARKET_CONFIG.reveal);
    expect(payload.rebate).toEqual(DEFAULT_LEAD_MARKET_CONFIG.rebate);
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("edits the lead rebate: share of the fee, ceiling, and off", async () => {
    saveLeadMarketConfigActionMock.mockResolvedValue({ ok: true, version: 4 });
    wrap(<LeadMarketPanel ruleSet={DEFAULT_FEE_RULE_SET} offers={[]} credits={[]} rebates={[]} />);

    // 100% is the shipped default; make it half, cap it at $10, then publish.
    fireEvent.change(screen.getByLabelText(/Share of the fee/), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText(/Ceiling per job/), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish lead policy/ }));

    await waitFor(() => expect(saveLeadMarketConfigActionMock).toHaveBeenCalledTimes(1));
    expect(saveLeadMarketConfigActionMock.mock.calls[0]?.[0].rebate).toEqual({
      enabled: true,
      pctBps: 5_000,
      maxMinor: 1_000,
    });

    // Clearing the ceiling means "no ceiling", not a $0 ceiling.
    fireEvent.change(screen.getByLabelText(/Ceiling per job/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Publish lead policy/ }));
    await waitFor(() => expect(saveLeadMarketConfigActionMock).toHaveBeenCalledTimes(2));
    expect(saveLeadMarketConfigActionMock.mock.calls[1]?.[0].rebate.maxMinor).toBeNull();
  });

  it("resets every field back to the shipped policy", () => {
    wrap(<LeadMarketPanel ruleSet={DEFAULT_FEE_RULE_SET} offers={[]} credits={[]} rebates={[]} />);
    fireEvent.change(screen.getByLabelText(/Gold/), { target: { value: "999" } });
    expect(screen.getByDisplayValue("999")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reset to defaults/ }));
    expect(screen.getByDisplayValue("20")).toBeInTheDocument();
  });

  it("records an admin credit adjustment", async () => {
    grantWorkerCreditsActionMock.mockResolvedValue({ ok: true });
    wrap(<LeadMarketPanel ruleSet={DEFAULT_FEE_RULE_SET} offers={[]} credits={[]} rebates={[]} />);

    fireEvent.change(screen.getByPlaceholderText("Worker id or slug"), { target: { value: "khaled-al-harbi-plumbing" } });
    fireEvent.change(screen.getByPlaceholderText("Reason"), { target: { value: "Goodwill credit" } });
    fireEvent.click(screen.getByRole("button", { name: /Record entry/ }));

    await waitFor(() => expect(grantWorkerCreditsActionMock).toHaveBeenCalledTimes(1));
    expect(grantWorkerCreditsActionMock.mock.calls[0]?.[0]).toMatchObject({
      workerId: "khaled-al-harbi-plumbing",
      amount: 10,
      reason: "Goodwill credit",
    });
  });

  /* ── Phase 2 — the one-click surge suggestion under the grade prices ── */

  /** A minimal healthy-verdict report (the shape the page passes down). */
  const surgeReport: SurgeReport = {
    windowDays: 30,
    from: "2026-08-21T00:00:00.000Z",
    to: "2026-09-20T00:00:00.000Z",
    summary: {
      offers: 25, purchased: 15, conversionPct: 60, avgMultiplier: 1.5,
      baseCredits: 350, premiumCredits: 175, refundedPremiumCredits: 0,
      netPremiumCredits: 175, refundRequests: 0, pendingRefunds: 0,
      approvedRefunds: 0, approvedRefundRatePct: 0,
    },
    goldBaseline: { offers: 30, purchased: 12, conversionPct: 40 },
    verdict: { code: "healthy", conversionPct: 60, approvedRefundRatePct: 0, offers: 25, purchases: 15 },
    weeks: [],
    multipliers: { exactly1: 0, upTo1_3: 0, upTo1_6: 25, above1_6: 0 },
  };

  it("offers a one-click emergency price prefill on a healthy verdict", () => {
    wrap(
      <LeadMarketPanel ruleSet={DEFAULT_FEE_RULE_SET} offers={[]} credits={[]} rebates={[]} surgeReport={surgeReport} />
    );
    // The banner states the suggestion and its evidence.
    expect(screen.getByText(/Suggested emergency price: 46 credits/)).toBeInTheDocument();
    expect(screen.getByText(/demand is absorbing the premium/)).toBeInTheDocument();
    // One click prefills the emergency input — 35 + 11 (the +30% step).
    fireEvent.click(screen.getByRole("button", { name: /Use 46/ }));
    expect(screen.getByDisplayValue("46")).toBeInTheDocument();
    // Nothing is published by the click itself.
    expect(saveLeadMarketConfigActionMock).not.toHaveBeenCalled();
  });

  it("stays silent for verdicts that should not move the price", () => {
    wrap(
      <LeadMarketPanel
        ruleSet={DEFAULT_FEE_RULE_SET}
        offers={[]}
        credits={[]}
        rebates={[]}
        surgeReport={{ ...surgeReport, verdict: { ...surgeReport.verdict, code: "quality-risk" } }}
      />
    );
    expect(screen.queryByText(/Suggested emergency price/)).not.toBeInTheDocument();
  });
});

/* ───────────────────────────── Worker board ───────────────────────────── */

const now = Date.parse("2026-09-14T11:00:00.000Z");

/** Build a board through the same pure engine the server uses. */
function boardFrom(offers: LeadOffer[], planTier: "free" | "professional" = "professional"): WorkerLeadBoard {
  const items = offers.map((o) =>
    leadBoardItemFor({
      offer: o,
      lead: {
        id: "qr-1",
        number: "QR-2026-00042",
        jobTitle: "Kitchen sink leak",
        note: "Pipe under the sink drips.",
        categorySlug: "plumbing",
        citySlug: "beirut",
      },
      policy: DEFAULT_LEAD_MARKET_CONFIG.reveal,
      planTier,
      customer: { name: "Sara Customer", phone: "+961 70 111 222", email: "sara@example.com" },
      reasons: ["category", "city", "rating"],
      now,
    })
  );
  return {
    ...splitLeadBoard(items),
    balance: { workerId: "khaled-plum", balance: 60, granted: 60, spent: 0, refunded: 0 },
    config: DEFAULT_LEAD_MARKET_CONFIG,
    rebates: { totalMinor: 0, count: 0 },
  };
}

describe("LeadBoard", () => {
  it("shows a live offer at its locked price with the contact still masked", () => {
    wrap(<LeadBoard board={boardFrom([offer])} nowSeed={now} />);
    expect(screen.getByText("Lead marketplace")).toBeInTheDocument();
    expect(screen.getByText("Kitchen sink leak")).toBeInTheDocument();
    expect(screen.getByText(/Match 88\/100/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock for 20 credits" })).toBeInTheDocument();
    // §10 — the server masked the customer's contact for a non-buyer.
    expect(screen.getByText(/Partly hidden by the platform's privacy policy/)).toBeInTheDocument();
    expect(screen.queryByText("+961 70 111 222")).not.toBeInTheDocument();
    expect(screen.getByText(/why you were matched/i)).toBeInTheDocument();
  });

  it("buys a lead through the worker action and reveals the customer", async () => {
    buyLeadOfferActionMock.mockResolvedValue({ ok: true, reveal: "revealed" });
    wrap(<LeadBoard board={boardFrom([offer])} nowSeed={now} />);

    fireEvent.click(screen.getByRole("button", { name: "Unlock for 20 credits" }));
    await waitFor(() => expect(buyLeadOfferActionMock).toHaveBeenCalledWith("offer-1"));
    await waitFor(() => expect(screen.getByText(/Lead unlocked — customer contact revealed/)).toBeInTheDocument());
    // The unlocked contact is NOT fabricated client-side: the board re-fetches
    // the server-rendered row (which is where the reveal actually happens).
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
    expect(screen.queryByText("+961 70 111 222")).not.toBeInTheDocument();
    // …and the row leaves the "buy" state.
    await waitFor(() => expect(screen.queryByRole("button", { name: /Unlock for 20 credits/ })).not.toBeInTheDocument());
  });

  it("surfaces a refusal without charging (not enough credits)", async () => {
    buyLeadOfferActionMock.mockResolvedValue({ ok: false, error: "insufficient-credits" });
    wrap(<LeadBoard board={boardFrom([offer])} nowSeed={now} />);

    fireEvent.click(screen.getByRole("button", { name: "Unlock for 20 credits" }));
    await waitFor(() => expect(screen.getByText(/Not enough credits/)).toBeInTheDocument());
    // Nothing was granted: the offer is still buyable.
    expect(screen.getByRole("button", { name: "Unlock for 20 credits" })).toBeInTheDocument();
  });

  it("renders a purchased lead with the customer's real details", () => {
    const owned: LeadOffer = { ...offer, status: "purchased", purchasedAt: "2026-09-14T10:30:00.000Z" };
    const board = boardFrom([owned]);
    wrap(<LeadBoard board={board} nowSeed={now} />);
    // The purchased tab shows the unlocked contact.
    fireEvent.click(screen.getByRole("button", { name: /Purchased/ }));
    expect(screen.getByText("+961 70 111 222")).toBeInTheDocument();
    expect(screen.getByText("sara@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlock for/ })).not.toBeInTheDocument();
  });

  it("holds a FREE-tier buyer at the masked reveal (the tier lever)", () => {
    const owned: LeadOffer = { ...offer, status: "purchased", purchasedAt: "2026-09-14T10:30:00.000Z" };
    const board = boardFrom([owned], "free");
    wrap(<LeadBoard board={board} nowSeed={now} />);
    fireEvent.click(screen.getByRole("button", { name: /Purchased/ }));
    expect(screen.getByText("••••••••••22")).toBeInTheDocument();
    expect(screen.queryByText("+961 70 111 222")).not.toBeInTheDocument();
  });

  it("explains an expired offer instead of offering it for sale", () => {
    const expired: LeadOffer = { ...offer, status: "expired" };
    wrap(<LeadBoard board={boardFrom([expired])} nowSeed={now} />);
    fireEvent.click(screen.getByRole("button", { name: /History/ }));
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Unlock for/ })).not.toBeInTheDocument();
  });
});
