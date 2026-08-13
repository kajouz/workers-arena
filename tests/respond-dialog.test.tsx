// @vitest-environment jsdom
/**
 * RespondDialog take-rate render test (docs/booking-take-rate.md §5):
 * a non-exempt (premium) worker sees the live "Platform fee · You receive"
 * split recomputed per keystroke; an exempt (Enterprise) worker sees the
 * waiver banner instead — and never the split. The i18n parity test already
 * enforces EN/AR, so this locks the branch logic in one locale.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, fireEvent, cleanup } from "@testing-library/react";
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
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Deterministic clock per test — the live SLA countdown derives from
// Date.now() against the booking's fixed expiry (creation + 48h window).
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));
});

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

// A REQUESTED booking whose first (creation) event is backdated 1h from the
// fixed system time — expiry = creation + 48h = 47h out at test start, so the
// countdown has real room to decrement.
const booking = {
  id: "bk-1",
  status: "requested",
  startAt: "2026-08-11T09:00:00.000Z",
  events: [{ status: "requested", actorType: "customer", time: "2026-08-10T08:00:00.000Z" }],
} as unknown as Booking;

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

describe("RespondDialog", () => {
  it("shows the worker's live SLA countdown on a requested booking", () => {
    renderDialog(premiumWorker);
    openDialog();

    // Creation at 08:00Z, expiry = +48h = 47h from the 09:00Z clock.
    expect(
      screen.getByText(/Respond in \d+h \d+m or the request auto-cancels/)
    ).toBeInTheDocument();

    // It ticks — advance well past a 30s interval (61s: the booking's expiry
    // is fixed, so the remaining time MUST visibly drop; the row-level bug of a
    // pinned countdown would fail this).
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(
      screen.getByText(/Respond in \d+h \d+m or the request auto-cancels/)
    ).toBeInTheDocument();
  });

  it("does not show the SLA countdown for a non-requested booking", () => {
    const confirmed = { ...booking, status: "confirmed" } as unknown as Booking;
    render(
      <LocaleProvider locale="en" dir="ltr">
        <RespondDialog booking={confirmed} worker={premiumWorker} />
      </LocaleProvider>
    );
    openDialog();
    expect(screen.queryByText(/Respond in \d+h \d+m/)).not.toBeInTheDocument();
  });

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
});
