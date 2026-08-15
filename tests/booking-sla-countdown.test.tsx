// @vitest-environment jsdom
/**
 * Admin dispute-view SLA ticker test: the live countdown (real
 * requestSlaExpiryMs — creation + the 48h window the cron enforces), the
 * urgency bar and the red-state pulse render for a REQUESTED booking, and
 * nothing renders for a non-requested one — the same clock the worker and
 * customer dialogs show, in one locale (the i18n parity test covers EN/AR).
 *
 * Hydration: the component derives its values from Date.now(), which can never
 * be equal on the server and the client's first render. The server page passes
 * nowSeed (its Date.now() at render time) and the component renders from it
 * until mount (via the shared useSsrSafeNow hook), so the SSR markup and the
 * client's first render are identical — proven by the deterministic-SSR and
 * clean-hydration tests at the bottom.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { BookingSlaCountdown, type SlaCountdownVariant } from "@/components/bookings/booking-sla-countdown";
import { LocaleProvider } from "@/components/providers/locale-provider";
import type { Booking } from "@/lib/data/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
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

function renderTicker(b: Booking, opts: { variant?: SlaCountdownVariant; compact?: boolean; locale?: "en" | "ar" } = {}) {
  return render(
    <LocaleProvider locale={opts.locale ?? "en"} dir={opts.locale === "ar" ? "rtl" : "ltr"}>
      <BookingSlaCountdown booking={b} nowSeed={Date.now()} variant={opts.variant} compact={opts.compact} />
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

  it("renders the customer voice with ticking minutes (compact)", () => {
    renderTicker(booking, { variant: "customer", compact: true });
    expect(
      screen.getByText(/Auto-cancels in 47h 0m if the worker doesn't respond/)
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Request auto-expiry" })).toBeInTheDocument();
  });

  it("renders the worker voice, with the nudge variant once the cron nudged", () => {
    renderTicker(booking, { variant: "worker", compact: true });
    expect(screen.getByText(/Auto-cancels in 47h 0m without a response/)).toBeInTheDocument();

    cleanup();
    renderTicker({ ...booking, slaNudgeSent: true } as unknown as Booking, { variant: "worker", compact: true });
    expect(screen.getByText(/Nudge sent · auto-cancels in 47h 0m/)).toBeInTheDocument();
  });

  it("localizes the customer countdown in Arabic", () => {
    renderTicker(booking, { variant: "customer", compact: true, locale: "ar" });
    expect(screen.getByText(/يُلغى تلقائياً خلال 47 س 0 د إذا لم يستجب العامل/)).toBeInTheDocument();
  });

  it("compact mode strips the banner chrome (rows); the admin default keeps it", () => {
    renderTicker(booking, { variant: "worker", compact: true });
    const compactRoot = screen.getByRole("progressbar").parentElement!;
    expect(compactRoot).toHaveClass("mt-2.5", "w-full");
    expect(compactRoot).not.toHaveClass("rounded-xl", "border");

    cleanup();
    renderTicker(booking); // admin default — the full banner
    const bannerRoot = screen.getByRole("progressbar").parentElement!;
    expect(bannerRoot).toHaveClass("rounded-xl", "border");
    expect(bannerRoot).not.toHaveClass("mt-2.5");
  });

  it("renders identical server markup for a given seed regardless of the clock", () => {
    const seed = Date.parse("2026-08-10T09:00:00.000Z");
    const renderSsr = () =>
      renderToString(
        <LocaleProvider locale="en" dir="ltr">
          <BookingSlaCountdown booking={booking} nowSeed={seed} />
        </LocaleProvider>
      );

    const atSeed = renderSsr();
    // The clock moving must NOT change the markup — the seed alone drives the
    // pre-mount output (without the seed this string changes every millisecond,
    // which is exactly the server/client drift that breaks hydration).
    vi.setSystemTime(new Date(seed + 3_600_000));
    expect(renderSsr()).toBe(atSeed);

    // Sanity: the countdown derives from the seed — creation 08:00 + 48h means
    // 47h left at the 09:00 seed.
    expect(atSeed).toContain("47h");
  });

  it("hydrates cleanly when the clock advanced between the server render and the client", () => {
    const seed = Date.parse("2026-08-10T09:00:00.000Z");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const element = (
      <LocaleProvider locale="en" dir="ltr">
        <BookingSlaCountdown booking={booking} nowSeed={seed} />
      </LocaleProvider>
    );

    // "Server": render the markup at the seed moment.
    vi.setSystemTime(new Date(seed));
    const html = renderToString(element);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // "Client": hydration happens a moment later, so the live clock has moved —
    // but the first client render still uses the seed, so it matches the server
    // markup exactly and no hydration mismatch is reported.
    vi.setSystemTime(new Date(seed + 60_000));
    let root: Root;
    act(() => {
      root = hydrateRoot(container, element);
    });

    expect(errSpy).not.toHaveBeenCalled();

    // The live clock takes over after mount: one minute later → 46h 59m.
    expect(container.textContent).toContain("Auto-cancels in 46h 59m");

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
