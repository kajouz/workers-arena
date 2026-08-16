// @vitest-environment jsdom
/**
 * §Lebanon — the /admin pending OMT/Whish payments card: the manual twin of a
 * provider webhook (the admin's confirm activates the booking / purchase) +
 * the shared PaymentMethodPicker the checkout surfaces use.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ManualPaymentsCard } from "@/components/admin/manual-payments-card";
import { PaymentMethodPicker } from "@/components/payments/payment-method-picker";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { useToastStore } from "@/components/ui/toast";
import type { PendingManualPayment } from "@/lib/data/types";

const { confirmManualPaymentActionMock, refreshMock } = vi.hoisted(() => ({
  confirmManualPaymentActionMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({
  confirmManualPaymentAction: confirmManualPaymentActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshMock }) }));

afterEach(() => {
  cleanup();
  confirmManualPaymentActionMock.mockReset();
});

const payment: PendingManualPayment = {
  id: "pay-omt-1",
  scope: "booking",
  entityId: "bk-1001",
  labelEn: "BK-1001 — Fix a leaking pipe",
  labelAr: "BK-1001 — إصلاح تسرب ماء",
  amount: 5000,
  currency: "USD",
  method: "omt",
  reference: "OMT-pay-omt-1-000",
  createdAt: "2026-08-16T09:00:00.000Z",
};

describe("ManualPaymentsCard — confirm receipt (manual webhook twin)", () => {
  it("lists pending manual payments with their reference and confirms through the dialog", async () => {
    confirmManualPaymentActionMock.mockResolvedValue({ ok: true });
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[payment]} />
      </LocaleProvider>
    );

    expect(screen.getByText("BK-1001 — Fix a leaking pipe")).toBeInTheDocument();
    expect(screen.getByText("OMT-pay-omt-1-000")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("OMT-pay-omt-1-000");
    expect(dialog).toHaveTextContent("$50");

    expect(confirmManualPaymentActionMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm receipt" }));
    await waitFor(() =>
      expect(confirmManualPaymentActionMock).toHaveBeenCalledWith("pay-omt-1")
    );
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === "Payment confirmed")).toBe(true)
    );
  });

  it("cancelling the confirm dialog fires nothing", async () => {
    confirmManualPaymentActionMock.mockResolvedValue({ ok: true });
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[payment]} />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(confirmManualPaymentActionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is nothing to confirm", () => {
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[]} />
      </LocaleProvider>
    );
    expect(screen.getByText("No manual payments awaiting confirmation.")).toBeInTheDocument();
  });
});

describe("PaymentMethodPicker", () => {
  it("offers Card/Stripe, OMT and Whish and reports changes", () => {
    const onChange = vi.fn();
    render(
      <LocaleProvider locale="en" dir="ltr">
        <PaymentMethodPicker value="stripe" onChange={onChange} />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: /OMT/ }));
    expect(onChange).toHaveBeenCalledWith("omt");
    fireEvent.click(screen.getByRole("button", { name: /Whish/ }));
    expect(onChange).toHaveBeenCalledWith("whish");
    expect(screen.getByRole("button", { name: /Card \/ Stripe/ })).toBeInTheDocument();
  });

  it("restricts to the manual methods when asked (paid upgrades)", () => {
    const onChange = vi.fn();
    render(
      <LocaleProvider locale="en" dir="ltr">
        <PaymentMethodPicker value="omt" onChange={onChange} methods={["omt", "whish"]} />
      </LocaleProvider>
    );
    expect(screen.queryByRole("button", { name: /Card \/ Stripe/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OMT/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Whish/ })).toBeInTheDocument();
  });
});
