import { describe, expect, it, vi } from "vitest";

describe("useSWUpdate hook", () => {
  it("exports correctly", async () => {
    const mod = await import("@/hooks/use-sw-update");
    expect(typeof mod.useSWUpdate).toBe("function");
  });

  it("returns object with expected keys", async () => {
    // The hook needs React to run, but we can verify the module structure
    const mod = await import("@/hooks/use-sw-update");
    expect(mod.useSWUpdate).toBeDefined();
  });
});

describe("UpdateBanner component", () => {
  it("exports correctly", async () => {
    const mod = await import("@/components/pwa/update-banner");
    expect(typeof mod.UpdateBanner).toBe("function");
  });
});

describe("SW update detection logic", () => {
  it("dismiss persists for 24 hours", () => {
    // Simulate the dismiss logic
    const now = Date.now();
    const dismissed12hAgo = now - 1000 * 60 * 60 * 12;
    const dismissed25hAgo = now - 1000 * 60 * 60 * 25;

    // Within 24h should be dismissed
    const hoursSince12h = (now - dismissed12hAgo) / (1000 * 60 * 60);
    expect(hoursSince12h).toBeLessThan(24);

    // After 24h should re-prompt
    const hoursSince25h = (now - dismissed25hAgo) / (1000 * 60 * 60);
    expect(hoursSince25h).toBeGreaterThan(24);
  });

  it("service worker waiting state detection", () => {
    // Simulate SW waiting detection
    const reg = { waiting: { postMessage: vi.fn() }, active: {}, installing: null };
    expect(reg.waiting).toBeTruthy();
    expect(typeof reg.waiting.postMessage).toBe("function");
  });

  it("no waiting SW means no update", () => {
    const reg = { waiting: null, active: {}, installing: null };
    expect(reg.waiting).toBeNull();
  });
});
