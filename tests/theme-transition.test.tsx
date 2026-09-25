// @vitest-environment jsdom
/**
 * ThemeTransition regression test.
 *
 * The provider watches `<html>`'s class attribute and adds a temporary
 * `theme-transitioning` class so theme switches fade. Its FIRST version reacted
 * to any class mutation — including its own add/remove — so every theme change
 * re-triggered the observer forever: the task queue never drained and the page
 * stopped responding to clicks, in-page scripts and input (the main thread was
 * permanently busy). It only took a theme change to hit it, which is why the
 * preview froze on the toggle click.
 *
 * These tests pin the terminating behavior: the marker is applied ONCE per
 * scheme change and the observer must not re-enter afterwards.
 *
 * NOTE: reverting the guard makes this file HANG rather than fail — a tight
 * MutationObserver loop starves the event loop so completely that neither
 * vitest's own timeouts nor timers inside the test can fire (verified: the run
 * had to be killed after 120s). `scripts/smoke-preview.mjs` independently
 * catches the same regression in a real browser, where it reports an expected
 * failure instead of hanging the page's main thread.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ThemeTransition } from "@/components/providers/theme-transition";

const MARKER = "theme-transitioning";
const tick = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms));

// MockInstance (not ReturnType<typeof vi.spyOn>): vitest 5's spyOn return
// type no longer carries the spied element type, so the generic left the
// mock.calls callback parameter implicitly any under noImplicitAny.
function markerAdds(add: MockInstance): number {
  return add.mock.calls.filter((args) => args[0] === MARKER).length;
}

describe("ThemeTransition — applies the fade class without re-entering its observer", () => {
  let add: MockInstance;
  let remove: MockInstance;

  beforeEach(() => {
    document.documentElement.className = "";
    add = vi.spyOn(DOMTokenList.prototype, "add");
    remove = vi.spyOn(DOMTokenList.prototype, "remove");
  });

  afterEach(() => {
    cleanup();
    add.mockRestore();
    remove.mockRestore();
    document.documentElement.className = "";
  });

  it("adds the marker once for a dark-mode switch, then stops", async () => {
    render(<ThemeTransition />);
    await tick();
    const baseline = markerAdds(add);

    document.documentElement.classList.add("dark");
    await tick();

    expect(markerAdds(add) - baseline, "one mark per scheme change").toBe(1);
  });

  it("does not keep re-adding the marker while it is on (the infinite-loop bug)", async () => {
    render(<ThemeTransition />);
    await tick();
    const baseline = markerAdds(add);

    document.documentElement.classList.add("dark");
    // Longer than the 300ms cleanup timer: a self-retriggering observer keeps
    // adding/removing the marker on every cycle, so the count would climb.
    await tick(450);

    expect(markerAdds(add) - baseline, "still exactly one mark after the fade window").toBe(1);
  });

  it("removes the marker after the fade window and re-arms on the next switch", async () => {
    render(<ThemeTransition />);
    await tick();

    document.documentElement.classList.add("dark");
    await tick();
    expect(document.documentElement.classList.contains(MARKER)).toBe(true);

    await tick(400);
    expect(document.documentElement.classList.contains(MARKER)).toBe(false);
    expect(remove.mock.calls.filter((args) => args[0] === MARKER).length).toBe(1);

    // Back to light — the fade arms again for the new scheme.
    const baseline = markerAdds(add);
    document.documentElement.classList.remove("dark");
    await tick();
    expect(markerAdds(add) - baseline).toBe(1);
  });

  it("ignores unrelated class churn on <html>", async () => {
    render(<ThemeTransition />);
    await tick();
    const baseline = markerAdds(add);

    document.documentElement.classList.add("some-other-provider-class");
    await tick(100);

    expect(markerAdds(add) - baseline, "no fade for a class that isn't the scheme").toBe(0);
  });

  it("ignores a class write that does not change the scheme (React's hydration write)", async () => {
    // React reconciles <html className> itself, and assigning an attribute a
    // SECOND time still queues a MutationRecord even when the value is
    // identical. In `next dev` that write lands right after hydration (strict
    // mode re-renders + dev tooling), so the old "a mutation happened" test
    // started the loop with no user interaction at all — the dev preview froze
    // on load. Repeating a no-op write must never arm the fade.
    document.documentElement.classList.add("dark");
    render(<ThemeTransition />);
    await tick();
    const baseline = markerAdds(add);

    for (let i = 0; i < 5; i++) {
      document.documentElement.setAttribute("class", "dark");
      document.documentElement.className = "dark";
    }
    await tick(450);

    expect(markerAdds(add) - baseline, "same-scheme rewrites are not a switch").toBe(0);
  });
});
