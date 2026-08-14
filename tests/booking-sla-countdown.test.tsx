// @vitest-environment jsdom
/**
 * Admin dispute-view SLA ticker test: the live countdown (real
 * requestSlaExpiryMs — creation + the 48h window the cron enforces), the
 * urgency bar and the red-state pulse render for a REQUESTED booking, and
 * nothing renders for a non-requested one — the same clock the worker and
 * customer dialogs show, in one locale (the i18n parity test covers EN/AR).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BookingSlaCountdown } from "@/components/admin/booking-sla-countdown";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { Booking } from "@/lib/data/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// Deterministic clock per test — the countdown derives from Date.now() against
// the booking's fixed expiry, so assertions are stable regardless of run time.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));
});

// A REQUESTED booking whose first (creation) event is backdated 1h from the
// fixed clock — expiry = creation + 48h = 47h out at test start, so the
// countdown and the bar have real room to move.
const booking = {
  id: "bk-1",
  status: "requested",
  startAt: "2026-08-11T09:00:00.000Z",
  events: [{ status: "requested", actorType: "customer", time: "2026-08-10T08:00:00.000Z" }],
  slaNudgeSent: false,
} as unknown as Booking;

function renderTicker(b: Booking) {
  return render(
    <LocaleProvider locale="en" dir="ltr">
      <BookingSlaCountdown booking={b} />
    </LocaleProvider>
  );
}

describe("BookingSlaCountdown", () => {
  it("shows the live SLA countdown with the urgency bar for a requested booking", () => {
    renderTicker(booking);

    expect(
      screen.getByText(/Auto-cancels in \d+h \d+m without a worker response/)
    ).toBeInTheDocument();

    // 47h of the 48h window remain → the bar is ~98% full and green.
    const bar = screen.getByRole("progressbar", { name: "Request auto-expiry" });
    expect(bar).toHaveAttribute("aria-valuenow", "98");
    expect(bar.firstElementChild).toHaveClass("bg-emerald-500");
  });

  it("ticks down against the fixed expiry", () => {
    renderTicker(booking);

    const read = () => {
      const m = screen.getByText(/Auto-cancels in/).textContent?.match(/(\d+)h (\d+)m/);
      if (!m) throw new Error("countdown text missing");
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const before = read();

    // Advance well past a 30s tick — the expiry is fixed, so the remaining
    // time MUST visibly drop (61s beats Math.ceil rounding).
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(read()).toBeLessThan(before);
  });

  it("shows the nudge tag when a nudge was sent", () => {
    renderTicker({ ...booking, slaNudgeSent: true } as unknown as Booking);
    expect(screen.getByText(/· Nudge sent/)).toBeInTheDocument();
  });

  it("drains the urgency bar green → amber → red with a red-state pulse", () => {
    renderTicker(booking);
    const fill = () => screen.getByRole("progressbar").firstElementChild as HTMLElement;

    // Start: 47h/48h left (98%) → green, no pulse.
    expect(fill()).toHaveClass("bg-emerald-500");
    expect(fill()).not.toHaveClass("animate-pulse-soft");

    // +25h → 22h left (46%) → amber, still no pulse.
    act(() => {
      vi.advanceTimersByTime(25 * 3_600_000);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "46");
    expect(fill()).toHaveClass("bg-amber-500");
    expect(fill()).not.toHaveClass("animate-pulse-soft");

    // +14h more → 8h left (17%) → red AND pulsing.
    act(() => {
      vi.advanceTimersByTime(14 * 3_600_000);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");
    expect(fill()).toHaveClass("bg-red-500");
    expect(fill()).toHaveClass("animate-pulse-soft");
  });

  it("renders nothing for a non-requested booking", () => {
    renderTicker({ ...booking, status: "confirmed" } as unknown as Booking);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Auto-cancels in/)).not.toBeInTheDocument();
  });
});
