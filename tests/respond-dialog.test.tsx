// @vitest-environment jsdom
/**
 * RespondDialog take-rate render test (docs/booking-take-rate.md §5):
 * a non-exempt (premium) worker sees the live "Platform fee · You receive"
 * split recomputed per keystroke; an exempt (Enterprise) worker sees the
 * waiver banner instead — and never the split. The i18n parity test already
 * enforces EN/AR, so this locks the branch logic in one locale.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { RespondDialog } from "@/components/dashboard/bookings/respond-dialog";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { Booking, Worker } from "@/lib/data/types";

// next/navigation — submit() calls router.refresh(); not exercised here.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The server action is mocked — these tests assert what the worker SEES, not
// what the action stores (the adapter-stamp tests cover that in node env).
vi.mock("@/app/actions/bookings", () => ({
  respondBookingAction: vi.fn(async () => ({ ok: true })),
}));

// vitest `globals` is off, so RTL cannot auto-register its cleanup — unmount
// between tests or the Radix dialog portals leak into the next case.
afterEach(cleanup);

const premiumWorker = {
  priceMin: 80,
  priceMax: 120,
  currency: "SAR",
  subscription: { plan: "premium", status: "active" },
} as unknown as Worker;

const enterpriseWorker = {
  ...premiumWorker,
  subscription: { plan: "enterprise", status: "active" },
} as unknown as Worker;

const booking = { id: "bk-1", status: "requested" } as unknown as Booking;

function renderDialog(worker: Worker) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <RespondDialog booking={booking} worker={worker} />
    </LocaleProvider>
  );
}

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Respond to request" }));
}

describe("RespondDialog take-rate display", () => {
  it("shows the live fee/net split for a non-exempt (premium) worker", () => {
    renderDialog(premiumWorker);
    openDialog();

    // Prefilled quote = priceMin 80 → fee max(round(8000×7%), 500) = 560 minor
    // (SAR 5.6, display-rounded like the rest of the app) → receive SAR 74.
    expect(screen.getByText("Platform fee")).toBeInTheDocument();
    expect(screen.getByText("SAR 6")).toBeInTheDocument();
    expect(screen.getByText("You receive")).toBeInTheDocument();
    expect(screen.getByText("SAR 74")).toBeInTheDocument();
    // No waiver banner.
    expect(screen.queryByText("Fee waived by your plan")).not.toBeInTheDocument();
  });

  it("recomputes the split as the worker types a new quote", () => {
    renderDialog(premiumWorker);
    openDialog();

    const quoteInput = screen.getByDisplayValue("80");
    fireEvent.change(quoteInput, { target: { value: "100" } });

    // 100 → fee 700 minor → SAR 7, receive 93.
    expect(screen.getByText("SAR 7")).toBeInTheDocument();
    expect(screen.getByText("SAR 93")).toBeInTheDocument();
  });

  it("shows the waiver banner instead of the split for an exempt (Enterprise) worker", () => {
    renderDialog(enterpriseWorker);
    openDialog();

    expect(screen.getByText("Fee waived by your plan")).toBeInTheDocument();
    expect(
      screen.getByText("Covered by your Enterprise plan — you receive the full quote.")
    ).toBeInTheDocument();

    // The split is gone entirely — there is no fee to split.
    expect(screen.queryByText("Platform fee")).not.toBeInTheDocument();
    expect(screen.queryByText("You receive")).not.toBeInTheDocument();
    expect(screen.queryByText("SAR 6")).not.toBeInTheDocument();
  });
});
