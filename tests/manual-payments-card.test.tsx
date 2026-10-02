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
        <ManualPaymentsCard payments={[payment]} nowSeed={Date.now()} />
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
    // Workflow v2 — evidence first: the commit stays disabled until the
    // OMT/Whish transaction number is entered; the amount is prefilled.
    const commit = within(dialog).getByRole("button", { name: "Confirm receipt" });
    expect(commit).toBeDisabled();
    expect(within(dialog).getByLabelText("Amount received (USD)")).toHaveValue(50);
    fireEvent.change(within(dialog).getByLabelText(/OMT \/ Whish transaction number/), { target: { value: "OMT 1234 5678" } });
    expect(commit).not.toBeDisabled();
    fireEvent.click(commit);
    await waitFor(() =>
      expect(confirmManualPaymentActionMock).toHaveBeenCalledWith("pay-omt-1", { amount: "50.00", txnId: "OMT 1234 5678", note: "" })
    );
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === "Payment confirmed")).toBe(true)
    );
  });

  it("reports a partial payment with the amount still owed, and shows money already received", async () => {
    confirmManualPaymentActionMock.mockResolvedValue({ ok: true, outcome: "partial", remainingMinor: 2000 });
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[{ ...payment, receivedMinor: 1000 }]} nowSeed={Date.now()} />
      </LocaleProvider>
    );
    expect(screen.getByText("Received $10 of $50")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog");
    // Prefilled with what is still owed, not the full amount.
    expect(within(dialog).getByLabelText("Amount received (USD)")).toHaveValue(40);
    fireEvent.change(within(dialog).getByLabelText("Amount received (USD)"), { target: { value: "20" } });
    fireEvent.change(within(dialog).getByLabelText(/OMT \/ Whish transaction number/), { target: { value: "OMT99887766" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm receipt" }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title.includes("$20") && t.title.includes("still owed"))).toBe(true)
    );
  });

  it("names a duplicate transaction number", async () => {
    confirmManualPaymentActionMock.mockResolvedValue({ ok: false, error: "duplicate-txn" });
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[payment]} nowSeed={Date.now()} />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/OMT \/ Whish transaction number/), { target: { value: "OMT-USED-1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm receipt" }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === "This transaction number has already been used.")).toBe(true)
    );
  });

  it("cancelling the confirm dialog fires nothing", async () => {
    confirmManualPaymentActionMock.mockResolvedValue({ ok: true });
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[payment]} nowSeed={Date.now()} />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(confirmManualPaymentActionMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("puts the oldest first, flags waits past 2 hours, and shows the receipt photo", async () => {
    const now = Date.now();
    const recent: PendingManualPayment = { ...payment, id: "pay-new", labelEn: "Recent payment", reference: "OMT-NEW", createdAt: new Date(now - 30 * 60_000).toISOString() };
    const old: PendingManualPayment = {
      ...payment,
      id: "pay-old",
      labelEn: "Old payment",
      reference: "OMT-OLD",
      createdAt: new Date(now - 3 * 60 * 60_000 - 5 * 60_000).toISOString(),
      receiptUploadedAt: new Date(now - 60 * 60_000).toISOString(),
    };
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[recent, old]} nowSeed={now} />
      </LocaleProvider>
    );

    expect(screen.getByText("2 waiting")).toBeInTheDocument();
    expect(screen.getByText("1 over 2 hours")).toBeInTheDocument();
    const labels = screen.getAllByText(/Recent payment|Old payment/).map((el) => el.textContent);
    expect(labels).toEqual(["Old payment", "Recent payment"]);
    expect(screen.getByText("waiting 3h 5m")).toBeInTheDocument();
    expect(screen.getByText("waiting 30m")).toBeInTheDocument();

    // The old one has a receipt: its confirm dialog shows the photo.
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm payment" })[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByAltText("Payment receipt photo")).toHaveAttribute(
      "src",
      "/api/admin/payments/receipt?ref=OMT-OLD"
    );
  });

  it("says when a payment has no receipt photo yet", async () => {
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[payment]} nowSeed={Date.now()} />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm payment" }));
    expect(await screen.findByText(/No receipt photo yet/)).toBeInTheDocument();
  });

  it("shows the empty state when there is nothing to confirm", () => {
    render(
      <LocaleProvider locale="en" dir="ltr">
        <ManualPaymentsCard payments={[]} nowSeed={Date.now()} />
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
