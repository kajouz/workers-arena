// @vitest-environment jsdom
/**
 * useSsrSafeNow unit test — the shared hydration-safe clock (the pattern
 * extracted from BookingSlaCountdown). Until the component mounts it returns
 * the seed the server page passed, so the SSR markup and the client's first
 * render are identical; after mount it returns the live clock — a single
 * Date.now() for static "expires in N hours" text (tick: false, default) or
 * the visibility-aware ticking clock for live countdowns (tick: true). The
 * deterministic-SSR and clean-hydration tests prove the pattern end-to-end.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderToString } from "react-dom/server";
import { hydrateRoot, type Root } from "react-dom/client";
import { useSsrSafeNow } from "@/hooks/use-ssr-safe-now";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T09:00:00.000Z"));
});

const SEED = Date.parse("2026-08-10T09:00:00.000Z");

/** Renders the hook's value so it can be exercised via renderToString/hydrate. */
function Probe({ seed, tick, active }: { seed: number; tick?: boolean; active?: boolean }) {
  const now = useSsrSafeNow(seed, { tick, active });
  return <span data-now={now}>{now}</span>;
}

describe("useSsrSafeNow", () => {
  it("renders the seed during SSR regardless of the clock (static and tick modes)", () => {
    const renderSsr = (tick?: boolean) => renderToString(<Probe seed={SEED} tick={tick} />);
    const a = renderSsr(false);
    expect(a).toContain(String(SEED));
    const b = renderSsr(true);
    expect(b).toContain(String(SEED));

    // The clock moving must NOT change the pre-mount markup — the seed alone
    // drives it (without it, the markup changes every millisecond, which is
    // exactly the server/client drift that breaks hydration).
    vi.setSystemTime(new Date(SEED + 3_600_000));
    expect(renderSsr(false)).toBe(a);
    expect(renderSsr(true)).toBe(b);
  });

  it("switches to the live clock after mount (static mode: one Date.now() at mount)", () => {
    // Mount one second after the seed — the value becomes the LIVE clock.
    vi.setSystemTime(new Date(SEED + 1_000));
    const { result } = renderHook(() => useSsrSafeNow(SEED));
    expect(result.current).toBe(SEED + 1_000);

    // Captured once at mount — moving the clock does not re-render it.
    vi.setSystemTime(new Date(SEED + 3_600_000));
    act(() => {});
    expect(result.current).toBe(SEED + 1_000);
  });

  it("ticks on the interval in tick mode", () => {
    const { result } = renderHook(() => useSsrSafeNow(SEED, { tick: true, active: true }));
    const before = result.current; // Date.now() at mount
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBeGreaterThan(before);
  });

  it("stays still in tick mode while inactive", () => {
    const { result } = renderHook(() => useSsrSafeNow(SEED, { tick: true, active: false }));
    const before = result.current;
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    expect(result.current).toBe(before);
  });

  it("hydrates cleanly when the clock advanced between the server render and the client", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const element = <Probe seed={SEED} tick />;

    // "Server": render the markup at the seed moment.
    vi.setSystemTime(new Date(SEED));
    const html = renderToString(element);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // "Client": hydration happens a moment later, so the live clock has moved —
    // but the first client render still uses the seed, so it matches the server
    // markup exactly and no hydration mismatch is reported.
    vi.setSystemTime(new Date(SEED + 60_000));
    let root: Root;
    act(() => {
      root = hydrateRoot(container, element);
    });

    expect(errSpy).not.toHaveBeenCalled();

    // The live clock took over after mount.
    expect(container.textContent).toBe(String(SEED + 60_000));

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
