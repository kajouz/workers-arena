import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sw = readFileSync(resolve(root, "public", "sw.js"), "utf8");
const registrar = readFileSync(
  resolve(root, "src/components/notifications/service-worker-registrar.tsx"),
  "utf8",
);

describe("Analytics queue module (src/lib/analytics-queue.ts)", () => {
  it("exports all expected functions", async () => {
    const mod = await import("@/lib/analytics-queue");
    expect(typeof mod.trackPageView).toBe("function");
    expect(typeof mod.getQueuedEvents).toBe("function");
    expect(typeof mod.removeEvent).toBe("function");
    expect(typeof mod.clearAnalyticsQueue).toBe("function");
    expect(typeof mod.analyticsQueueSize).toBe("function");
    expect(typeof mod.flushAnalyticsQueue).toBe("function");
  });

  it("uses IndexedDB database 'workers-arena-analytics'", async () => {
    const src = readFileSync(
      resolve(root, "src/lib/analytics-queue.ts"),
      "utf8",
    );
    expect(src).toContain("workers-arena-analytics");
    expect(src).toContain("page-views");
  });

  it("flushAnalyticsQueue POSTs to /api/analytics/page-view", async () => {
    const src = readFileSync(
      resolve(root, "src/lib/analytics-queue.ts"),
      "utf8",
    );
    expect(src).toContain("/api/analytics/page-view");
  });
});

describe("Analytics page-view API route", () => {
  it("exists and exports POST", async () => {
    const mod = await import("@/app/api/analytics/page-view/route");
    expect(typeof mod.POST).toBe("function");
  });
});

describe("useTrackView hook", () => {
  it("exists and is a client component", async () => {
    const hook = readFileSync(
      resolve(root, "src/hooks/use-track-view.ts"),
      "utf8",
    );
    expect(hook).toContain('"use client"');
    expect(hook).toContain("export function useTrackView");
    expect(hook).toContain("trackPageView");
    expect(hook).toContain("usePathname");
  });
});

describe("Service worker registrar analytics integration", () => {
  it("imports flushAnalyticsQueue", () => {
    expect(registrar).toContain('from "@/lib/analytics-queue"');
    expect(registrar).toContain("flushAnalyticsQueue");
  });

  it("calls flushAnalyticsQueue on online event", () => {
    expect(registrar).toContain("flushAnalyticsQueue().catch(() => {})");
  });
});

describe("Service worker analytics documentation", () => {
  it("documents the analytics queue in the header comment", () => {
    expect(sw).toContain("analytics");
    expect(sw).toContain("page-view");
  });
});
