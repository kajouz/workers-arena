// @vitest-environment jsdom
/**
 * §2.4 admin dispute-view actions — AdminBookingActions: the buttons appear
 * only when the action is possible (cancel hidden on terminal bookings,
 * refund hidden without a PAID deposit), the two-step reason → confirm flow
 * calls the right server action with the reason, and the success toast +
 * refresh round-trip — EN + AR.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AdminBookingActions } from "@/components/admin/admin-booking-actions";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { Booking } from "@/lib/data/types";

const {
  adminCancelBookingActionMock,
  refundBookingDepositActionMock,
  confirmManualPaymentActionMock,
  useRouterRefreshMock,
} = vi.hoisted(() => ({
  adminCancelBookingActionMock: vi.fn(),
  refundBookingDepositActionMock: vi.fn(),
  confirmManualPaymentActionMock: vi.fn(),
  useRouterRefreshMock: vi.fn(),
}));

vi.mock("@/app/actions/bookings", () => ({
  adminCancelBookingAction: adminCancelBookingActionMock,
  refundBookingDepositAction: refundBookingDepositActionMock,
}));
// The manual-confirm action is mocked too — the real action's import chain
// (business → repo → notifications → email provider) drags the uninstalled
// nodemailer into the transform graph, and this component test only renders
// the button's confirm flow.
vi.mock("@/app/actions/business", () => ({
  confirmManualPaymentAction: confirmManualPaymentActionMock,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: useRouterRefreshMock }) }));
vi.mock("@/components/ui/toast", () => ({ toast: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "bk-1",
    number: "BK-1001",
    workerId: "w1",
    customerName: "Sara Customer",
    status: "pendingPayment",
    deposit: 3000,
    currency: "SAR",
    paymentStatus: "paid",
    events: [],
    ...overrides,
  } as unknown as Booking;
}

function renderActions(booking: Booking, locale: "en" | "ar" = "en") {
  return render(
    <LocaleProvider locale={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <AdminBookingActions booking={booking} />
    </LocaleProvider>
  );
}

describe("AdminBookingActions — button visibility", () => {
  it("shows both actions for a payable confirmed booking (cancel + refund)", () => {
    renderActions(makeBooking());
    expect(screen.getByRole("button", { name: /cancel booking/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refund deposit/i })).toBeInTheDocument();
  });

  it("hides the refund when there is no PAID deposit", () => {
    renderActions(makeBooking({ paymentStatus: undefined, status: "confirmed" }));
    expect(screen.getByRole("button", { name: /cancel booking/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /refund deposit/i })).not.toBeInTheDocument();
  });

  it("hides the cancel on a terminal booking", () => {
    renderActions(makeBooking({ status: "completed", paymentStatus: "paid" }));
    expect(screen.queryByRole("button", { name: /cancel booking/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refund deposit/i })).toBeInTheDocument();
  });

  it("renders nothing when neither action is possible", () => {
    const { container } = renderActions(makeBooking({ status: "cancelled", paymentStatus: undefined }));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AdminBookingActions — cancel flow", () => {
  it("requires a reason before confirming and calls the action with it", async () => {
    adminCancelBookingActionMock.mockResolvedValue({ ok: true });
    renderActions(makeBooking());

    fireEvent.click(screen.getByRole("button", { name: /cancel booking/i }));
    // Continue is disabled until a reason is typed.
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: /continue/i })).toBeDisabled();

    const textarea = within(dialog).getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Duplicate booking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));
    // Confirm step — the destructive button fires the action.
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel booking/i }));

    const form = new FormData();
    form.set("reason", "Duplicate booking");
    expect(adminCancelBookingActionMock).toHaveBeenCalledWith("bk-1", form);
    // The action resolves on a microtask, so the refresh must be awaited.
    await vi.waitFor(() => {
      expect(useRouterRefreshMock).toHaveBeenCalled();
    });
  });

  it("localizes the cancel dialog in Arabic", () => {
    renderActions(makeBooking(), "ar");
    fireEvent.click(screen.getByRole("button", { name: /إلغاء الحجز/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent("إلغاء هذا الحجز");
  });
});

describe("AdminBookingActions — refund flow", () => {
  it("calls refundBookingDepositAction with the reason", async () => {
    refundBookingDepositActionMock.mockResolvedValue({ ok: true });
    renderActions(makeBooking());

    fireEvent.click(screen.getByRole("button", { name: /refund deposit/i }));
    const dialog = screen.getByRole("dialog");
    const textarea = within(dialog).getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Dispute resolved" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /continue/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /refund deposit/i }));

    const form = new FormData();
    form.set("reason", "Dispute resolved");
    expect(refundBookingDepositActionMock).toHaveBeenCalledWith("bk-1", form);
    expect(adminCancelBookingActionMock).not.toHaveBeenCalled();
    // The action resolves on a microtask, so the refresh must be awaited.
    await vi.waitFor(() => {
      expect(useRouterRefreshMock).toHaveBeenCalled();
    });
  });
});
