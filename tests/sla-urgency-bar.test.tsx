// @vitest-environment jsdom
/**
 * Shared SLA urgency bar (docs/ENHANCEMENT-PLAN.md §2.2) — the visual language
 * every live deadline drains with: the track fills to the fraction of the
 * window remaining, >50% green, 20–50% amber, <20% red with a soft pulse. Used
 * by BookingSlaCountdown (request SLA) and the quote cards' closing window
 * (quote SLA), so both deadlines can never drift apart. The bar is pure
 * presentational — the caller supplies the deadline, the window and a
 * hydration-safe `now`, so these tests pin the thresholds directly.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SlaUrgencyBar } from "@/components/bookings/sla-urgency-bar";

const WINDOW_MS = 48 * 3_600_000; // the 48h policy window
const NOW = Date.parse("2026-08-10T09:00:00.000Z");

describe("SlaUrgencyBar", () => {
  it("fills to the fraction of the window remaining (>50% → green, no pulse)", () => {
    // 36h of 48h left → 75% full.
    render(<SlaUrgencyBar expiryAt={NOW + 36 * 3_600_000} windowMs={WINDOW_MS} now={NOW} label="Closes in 36h 0m" />);

    const bar = screen.getByRole("progressbar", { name: "Closes in 36h 0m" });
    expect(bar).toHaveAttribute("aria-valuenow", "75");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill).toHaveStyle({ width: "75%" });
    expect(fill).toHaveClass("bg-emerald-500");
    expect(fill).not.toHaveClass("animate-pulse-soft");
  });

  it("turns amber between 20–50% remaining", () => {
    // 16h of 48h left → 33%.
    render(<SlaUrgencyBar expiryAt={NOW + 16 * 3_600_000} windowMs={WINDOW_MS} now={NOW} label="amber" />);

    const bar = screen.getByRole("progressbar", { name: "amber" });
    expect(bar).toHaveAttribute("aria-valuenow", "33");
    expect(bar.firstElementChild).toHaveClass("bg-amber-500");
    expect(bar.firstElementChild).not.toHaveClass("animate-pulse-soft");
  });

  it("turns red and pulses below 20% remaining", () => {
    // 9h of 48h left → 18.75% → 19.
    render(<SlaUrgencyBar expiryAt={NOW + 9 * 3_600_000} windowMs={WINDOW_MS} now={NOW} label="red" />);

    const bar = screen.getByRole("progressbar", { name: "red" });
    expect(bar).toHaveAttribute("aria-valuenow", "19");
    expect(bar.firstElementChild).toHaveClass("bg-red-500", "animate-pulse-soft");
  });

  it("clamps at 100% before the window opens and 0% after the deadline", () => {
    // A deadline further out than the window → the bar can't exceed 100%.
    render(<SlaUrgencyBar expiryAt={NOW + 100 * 3_600_000} windowMs={WINDOW_MS} now={NOW} label="full" />);
    expect(screen.getByRole("progressbar", { name: "full" })).toHaveAttribute("aria-valuenow", "100");

    // Deadline already past → 0% (empty, red, pulsing).
    render(<SlaUrgencyBar expiryAt={NOW - 3_600_000} windowMs={WINDOW_MS} now={NOW} label="empty" />);
    const empty = screen.getByRole("progressbar", { name: "empty" });
    expect(empty).toHaveAttribute("aria-valuenow", "0");
    expect(empty.firstElementChild).toHaveClass("bg-red-500", "animate-pulse-soft");
  });

  it("applies extra classes to the track (vertical spacing at the call sites)", () => {
    render(<SlaUrgencyBar expiryAt={NOW} windowMs={WINDOW_MS} now={NOW} label="spaced" className="mt-1.5" />);
    expect(screen.getByRole("progressbar", { name: "spaced" })).toHaveClass("mt-1.5", "h-1", "w-full", "rounded-full");
  });
});
