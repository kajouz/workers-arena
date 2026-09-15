// @vitest-environment jsdom
/**
 * §5/§6 — the admin fee-rules panel (docs/fee-rules.md): edit the take rate,
 * apply the recommended ladder, publish a new version, and see the per-tier
 * money preview computed by the same engine the server stores.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FeeRulesPanel } from "@/components/admin/fee-rules-panel";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { DEFAULT_FEE_RULE_SET, type PlatformFeeSnapshot } from "@/lib/data/fee-rules";

const { saveFeeRulesActionMock, refreshMock } = vi.hoisted(() => ({
  saveFeeRulesActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/app/actions/fee-rules", () => ({
  saveFeeRulesAction: saveFeeRulesActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

afterEach(() => {
  cleanup();
  saveFeeRulesActionMock.mockReset();
  refreshMock.mockReset();
});

const snapshot: PlatformFeeSnapshot = {
  id: "fee-bk-1-v1",
  jobId: "bk-1",
  quoteId: "bk-1",
  workerId: "w-1",
  planTier: "professional",
  ruleId: DEFAULT_FEE_RULE_SET.id,
  ruleVersion: 1,
  rateBps: 700,
  minMinor: 500,
  maxMinor: 30_000,
  fixedMinor: 0,
  subtotalMinor: 8_000,
  feeMinor: 560,
  netMinor: 7_440,
  minApplied: false,
  maxApplied: false,
  exempt: false,
  sources: ["default"],
  currency: "USD",
  computedAt: "2026-09-14T10:00:00.000Z",
};

function renderPanel() {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <FeeRulesPanel ruleSet={DEFAULT_FEE_RULE_SET} versions={[DEFAULT_FEE_RULE_SET]} snapshots={[snapshot]} />
    </LocaleProvider>
  );
}

describe("FeeRulesPanel", () => {
  it("renders the baseline + every tier, and previews the fee on a sample $80 job", () => {
    renderPanel();
    expect(screen.getByText("Platform fee rules")).toBeInTheDocument();
    expect(screen.getByText("Baseline rule")).toBeInTheDocument();
    // The five monetization tiers are all editable.
    for (const label of ["Free", "Starter", "Professional", "Growth", "Business"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // 7% of $80 = $5.60, worker receives $74.40 — the documented worked example.
    // Four tiers inherit the baseline; Business is waived by default.
    expect(screen.getAllByText(/fee \$5\.60/).length).toBe(4);
    expect(screen.getAllByText(/worker receives \$74\.40/).length).toBe(4);
    expect(screen.getByText(/fee waived/)).toBeInTheDocument();
    // The snapshot audit list shows what was actually charged under v1.
    expect(screen.getByText(/Quote \$80\.00 · worker \$74\.40 · 2026-09-14/)).toBeInTheDocument();
    expect(screen.getByText("Active v1")).toBeInTheDocument();
  });

  it("applies the recommended ladder to the tier rows", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Apply recommended ladder/ }));
    // The free tier becomes 12% → $9.60 on $80 and starter 9% → $7.20. Growth
    // (5% → $4.00) and business (4% → $3.20) land UNDER the $5 floor, so both
    // render the floor instead — the preview showing that is the point.
    expect(screen.getAllByText(/fee \$9\.60/).length).toBe(1);
    expect(screen.getAllByText(/worker receives \$70\.40/).length).toBe(1);
    expect(screen.getAllByText(/fee \$7\.20/).length).toBe(1);
    // …and the ladder clears the Business waiver (4% at the floor, not "waived").
    expect(screen.queryByText(/fee waived/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/fee \$5\.00/).length).toBe(2);
  });

  it("publishes the edited rules through the admin action", async () => {
    saveFeeRulesActionMock.mockResolvedValue({ ok: true, version: 2 });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /Publish new version/ }));
    await waitFor(() => expect(saveFeeRulesActionMock).toHaveBeenCalledTimes(1));

    const payload = saveFeeRulesActionMock.mock.calls[0]?.[0];
    expect(payload.defaults).toMatchObject({ ratePct: 7, min: 5, max: 300, fixed: 0, exempt: false });
    expect(payload.planTiers.business).toMatchObject({ exempt: true });
    await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  });
});
