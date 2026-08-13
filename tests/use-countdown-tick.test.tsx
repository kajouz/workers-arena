// @vitest-environment jsdom
/**
 * useCountdownTick unit test: the returned `now` ticks on the interval while
 * active, PAUSES while the document is hidden (browsers throttle setInterval
 * in backgrounded tabs — the drift this hook exists to prevent), and resyncs
 * immediately on visibilitychange → visible without waiting for the next tick.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdownTick } from "@/hooks/use-countdown-tick";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));
});

/** Force the document into the given visibility state and fire the change. */
function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useCountdownTick", () => {
  it("ticks while active and pauses while the tab is hidden", () => {
    const { result } = renderHook(() => useCountdownTick(true, 30_000));

    const t0 = result.current;
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBeGreaterThan(t0); // two ticks fired

    // Hidden → the interval must not advance the clock (no drift accumulation).
    // The visibility dispatch and the time advance MUST be separate act
    // blocks: the effect cleanup (clearing the interval) commits only after
    // React processes the visibility state change, so advancing timers in the
    // same block would fire the stale interval first.
    const hiddenAt = result.current;
    act(() => {
      setVisibility("hidden");
    });
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current).toBe(hiddenAt); // frozen while hidden

    // Visible again → resyncs IMMEDIATELY (Date.now() has moved 5+ min, but
    // the next interval tick is still up to 30s away — visibility resync must
    // not wait for it).
    act(() => {
      setVisibility("visible");
    });
    expect(result.current).toBeGreaterThan(hiddenAt + 5 * 60_000 - 1_000);
  });

  it("resumes ticking after becoming visible again", () => {
    const { result } = renderHook(() => useCountdownTick(true, 30_000));

    act(() => {
      setVisibility("hidden");
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    const frozen = result.current;

    act(() => {
      setVisibility("visible");
    });
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current).toBeGreaterThan(frozen);
  });

  it("does not tick while inactive", () => {
    const { result } = renderHook(() => useCountdownTick(false, 30_000));
    const t0 = result.current;
    act(() => {
      vi.advanceTimersByTime(5 * 60_000);
    });
    expect(result.current).toBe(t0);
  });
});
