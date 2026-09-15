// @vitest-environment jsdom
/**
 * §24 — the admin promotions panel (docs/fee-rules.md → promotions): add/edit
 * campaigns, see their economics on a sample job, publish them as a new
 * fee-rule version, and read their attribution from the fee snapshots.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PromotionsPanel } from "@/components/admin/promotions-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { DEFAULT_FEE_RULE_SET, type FeeRuleSet, type PlatformFeeSnapshot } from "@/lib/data/fee-rules";
import type { CreditLedgerEntry } from "@/lib/data/credit-ledger";
import type { PromotionAttribution } from "@/lib/data/fee-rules-store";

const { saveFeePromotionsActionMock, refreshMock } = vi.hoisted(() => ({
  saveFeePromotionsActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/app/actions/fee-rules", () => ({
  saveFeePromotionsAction: saveFeePromotionsActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

afterEach(() => {
  cleanup();
  saveFeePromotionsActionMock.mockReset();
  refreshMock.mockReset();
});

const ruleSet: FeeRuleSet = {
  ...DEFAULT_FEE_RULE_SET,
  promotions: [
    {
      id: "launch",
      label: "Launch month — plumbing",
      rateBps: 300,
      categorySlug: "plumbing",
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T23:59:59.000Z",
      bonusCredits: 25,
    },
    { id: "paused", label: "Paused campaign", rateBps: 200, enabled: false },
  ],
};

const snapshot: PlatformFeeSnapshot = {
  id: "fee-bk-9-v2",
  jobId: "bk-9",
  quoteId: "bk-9",
  workerId: "w-1",
  planTier: "growth",
  ruleId: "fee-rules-v2",
  ruleVersion: 2,
  rateBps: 300,
  minMinor: 500,
  maxMinor: 30_000,
  fixedMinor: 0,
  subtotalMinor: 20_000,
  feeMinor: 600,
  netMinor: 19_400,
  minApplied: false,
  maxApplied: false,
  exempt: false,
  sources: ["default", "promotion"],
  promotionId: "launch",
  currency: "USD",
  computedAt: "2026-09-14T10:00:00.000Z",
};

const attribution: PromotionAttribution[] = [
  { promotionId: "launch", count: 3, feeMinor: 1_800, gmvMinor: 60_000, lastUsedAt: "2026-09-14T10:00:00.000Z" },
];

const grants: CreditLedgerEntry[] = [
  {
    id: "cred-1",
    workerId: "w-1",
    kind: "grant",
    amount: 25,
    balanceAfter: 25,
    reason: "Promotion “Launch month” — plan purchase bonus",
    promotionId: "launch",
    createdAt: "2026-09-14T09:00:00.000Z",
  },
];

function renderPanel() {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <PromotionsPanel
        ruleSet={ruleSet}
        attribution={attribution}
        snapshots={[snapshot]}
        grants={grants}
        categories={[
          { slug: "plumbing", nameEn: "Plumbing" },
          { slug: "electrical", nameEn: "Electrical" },
        ]}
      />
    </LocaleProvider>
  );
}

describe("PromotionsPanel", () => {
  it("lists the campaigns with their scope, window, preview and attribution", () => {
    renderPanel();
    expect(screen.getByText("Promotion campaigns")).toBeInTheDocument();

    // The live campaign's label is prefilled...
    expect(screen.getByDisplayValue("Launch month — plumbing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-09-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-09-30")).toBeInTheDocument();
    expect(screen.getByDisplayValue("25")).toBeInTheDocument();

    // ...its economics are previewed on the sample $80 job: 3% = $2.40 → the
    // platform's $5 floor bites, so the worker still sees a $5.00 fee (and the
    // paused 2% campaign previews to the same floor — both rows, one matcher).
    expect(screen.getAllByText(/fee \$5\.00 · worker receives \$75\.00/)).toHaveLength(2);

    // Attribution comes from the snapshots, not a counter.
    expect(screen.getByText(/Priced 3 quote\(s\) · \$18\.00 fee on \$600\.00 of work/)).toBeInTheDocument();
    expect(screen.getByText(/25 credits granted to 1 worker\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/\$6\.00/)).toBeInTheDocument();
    expect(screen.getByText(/quote \$200\.00 at 3% · 2026-09-14/)).toBeInTheDocument();

    // The paused campaign shows as paused.
    expect(screen.getByText("Paused")).toBeInTheDocument();
  });

  it("adds, edits and publishes campaigns in engine units", async () => {
    saveFeePromotionsActionMock.mockResolvedValue({ ok: true, version: 3 });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Add campaign/ }));
    const labelInputs = screen.getAllByPlaceholderText("e.g. Launch month — 3% on plumbing");
    const newLabel = labelInputs[labelInputs.length - 1]!;
    fireEvent.change(newLabel, { target: { value: "Ramadan 2%" } });

    // Rate 2% (the new campaign starts from the baseline 7% → 700 bps).
    const rateInputs = screen.getAllByLabelText("Rate %");
    fireEvent.change(rateInputs[rateInputs.length - 1]!, { target: { value: "2" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Publish campaigns/ }));
    });

    await waitFor(() => expect(saveFeePromotionsActionMock).toHaveBeenCalledTimes(1));
    const payload = saveFeePromotionsActionMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(payload).toHaveLength(3);

    const added = payload.find((p) => p.label === "Ramadan 2%")!;
    expect(added).toMatchObject({ rateBps: 200 });
    expect(added.id).toBeTruthy();
    // The existing campaigns round-trip untouched — scope, window and bonus.
    const launch = payload.find((p) => p.id === "launch")!;
    expect(launch).toMatchObject({
      label: "Launch month — plumbing",
      rateBps: 300,
      categorySlug: "plumbing",
      bonusCredits: 25,
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-09-30T23:59:59.000Z",
    });
    // A paused campaign stays paused.
    expect(payload.find((p) => p.id === "paused")).toMatchObject({ enabled: false });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });

  it("refuses to publish a campaign without a name", async () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Add campaign/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Publish campaigns/ }));
    });
    expect(saveFeePromotionsActionMock).not.toHaveBeenCalled();
  });

  it("removes a campaign from the list", async () => {
    saveFeePromotionsActionMock.mockResolvedValue({ ok: true, version: 3 });
    renderPanel();
    const removeButtons = screen.getAllByRole("button", { name: "Remove campaign" });
    expect(removeButtons).toHaveLength(2);
    await act(async () => {
      fireEvent.click(removeButtons[0]!);
    });
    expect(screen.queryByDisplayValue("Launch month — plumbing")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Publish campaigns/ }));
    });
    await waitFor(() => expect(saveFeePromotionsActionMock).toHaveBeenCalledTimes(1));
    const payload = saveFeePromotionsActionMock.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(payload.map((p) => p.id)).toEqual(["paused"]);
  });
});
