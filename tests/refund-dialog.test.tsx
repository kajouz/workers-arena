// @vitest-environment jsdom
/**
 * Two-step admin campaign refund (docs/PAYMENTS.md) — an irreversible money
 * action: step 1 collects the required reason, step 2 shows an Apply-style
 * summary (campaign, amount, reason, effect) before the destructive confirm
 * fires. Mirrors the plan-change confirm dialog's stage-then-commit pattern.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RefundDialog } from "@/components/dashboard/refund-dialog";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { useToastStore } from "@/components/ui/toast";
import type { Campaign, CampaignPayment } from "@/lib/data/types";

const { refundCampaignActionMock, refreshMock } = vi.hoisted(() => ({
  refundCampaignActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({
  refundCampaignAction: refundCampaignActionMock,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

// vitest `globals` is off, so RTL cannot auto-register its cleanup.
afterEach(() => {
  cleanup();
  refundCampaignActionMock.mockReset();
});

const campaign = {
  id: "cam-1",
  nameEn: "E2E plumbing ads",
  nameAr: "حملة السباكة",
  placement: "home-hero",
  adType: "banner",
  status: "active",
} as unknown as Campaign;

const payment = {
  id: "pay-1",
  campaignId: "cam-1",
  amount: 15000, // minor units → $150.00
  status: "paid",
  paidAt: new Date().toISOString(),
} as unknown as CampaignPayment;

function renderDialog() {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <RefundDialog campaign={campaign} payment={payment} />
    </LocaleProvider>
  );
}

describe("RefundDialog — two-step confirm", () => {
  it("requires a reason, then shows a summary before the destructive commit", async () => {
    refundCampaignActionMock.mockResolvedValue({ ok: true });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog");

    // Step 1 — reason: Continue stays disabled until a reason is typed.
    const continueBtn = within(dialog).getByRole("button", { name: "Continue" });
    expect(continueBtn).toBeDisabled();
    fireEvent.change(within(dialog).getByPlaceholderText(/Campaign violated ad policy/), {
      target: { value: "Duplicate purchase" },
    });
    fireEvent.click(continueBtn);

    // Step 2 — the summary: campaign, amount, reason + the effect line.
    expect(within(dialog).getByText("Confirm refund")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("E2E plumbing ads");
    expect(dialog).toHaveTextContent("$150");
    expect(dialog).toHaveTextContent("Duplicate purchase");
    expect(dialog).toHaveTextContent(/can't be undone/);

    // The action fires only on the destructive commit.
    expect(refundCampaignActionMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm refund · $150" }));
    await waitFor(() =>
      expect(refundCampaignActionMock).toHaveBeenCalledWith("cam-1", "Duplicate purchase")
    );
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === "Payment refunded ✓")).toBe(true)
    );
  });

  it("cancels on the reason step without firing the action", async () => {
    refundCampaignActionMock.mockResolvedValue({ ok: true });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Campaign violated ad policy/), {
      target: { value: "Duplicate purchase" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(refundCampaignActionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("Back from the summary returns to the reason step with the reason kept", async () => {
    refundCampaignActionMock.mockResolvedValue({ ok: true });
    renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Refund" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText(/Campaign violated ad policy/), {
      target: { value: "Duplicate purchase" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    expect(within(dialog).getByText("Confirm refund")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));

    // Back on the reason step — the typed reason is preserved.
    expect(within(dialog).getByText("Reason for refund")).toBeInTheDocument();
    expect(
      within(dialog).getByPlaceholderText(/Campaign violated ad policy/)
    ).toHaveValue("Duplicate purchase");
    expect(refundCampaignActionMock).not.toHaveBeenCalled();
  });
});
