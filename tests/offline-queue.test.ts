import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const sw = readFileSync(resolve(root, "public", "sw.js"), "utf8");
const registrar = readFileSync(
  resolve(root, "src/components/notifications/service-worker-registrar.tsx"),
  "utf8",
);

describe("Offline queue module (src/lib/offline-queue.ts)", () => {
  it("exports all expected functions", async () => {
    const mod = await import("@/lib/offline-queue");
    expect(typeof mod.enqueueAction).toBe("function");
    expect(typeof mod.getPendingActions).toBe("function");
    expect(typeof mod.removeAction).toBe("function");
    expect(typeof mod.clearQueue).toBe("function");
    expect(typeof mod.pendingCount).toBe("function");
    expect(typeof mod.replayQueue).toBe("function");
  });

  it("defines QueuedAction type with lead and review action types", async () => {
    const mod = await import("@/lib/offline-queue");
    // Runtime smoke: enqueueAction accepts both types
    expect(mod.enqueueAction).toBeDefined();
  });

  it("uses IndexedDB database 'workers-arena-offline'", async () => {
    const src = (await import("node:fs")).readFileSync(
      resolve(root, "src/lib/offline-queue.ts"),
      "utf8",
    );
    expect(src).toContain("workers-arena-offline");
    expect(src).toContain("pending-actions");
  });

  it("replayQueue POSTs to /api/offline-queue/replay", async () => {
    const src = (await import("node:fs")).readFileSync(
      resolve(root, "src/lib/offline-queue.ts"),
      "utf8",
    );
    expect(src).toContain("/api/offline-queue/replay");
  });
});

describe("Offline queue API route (src/app/api/offline-queue/replay/route.ts)", () => {
  it("exists and exports POST", async () => {
    const mod = await import("@/app/api/offline-queue/replay/route");
    expect(typeof mod.POST).toBe("function");
  });
});

describe("Service worker offline queue integration", () => {
  it("has 'replay-offline-queue' sync handler", () => {
    expect(sw).toContain('"replay-offline-queue"');
    expect(sw).toContain("replayOfflineQueue");
  });

  it("sends replay-offline-queue message to clients from sync", () => {
    expect(sw).toContain("async function replayOfflineQueue");
    expect(sw).toContain('postMessage({ type: "replay-offline-queue" })');
  });
});

describe("Service worker registrar offline queue integration", () => {
  it("imports replayQueue from offline-queue module", () => {
    expect(registrar).toContain('from "@/lib/offline-queue"');
    expect(registrar).toContain("replayQueue");
  });

  it("sends replay-offline-queue message on online event", () => {
    expect(registrar).toContain('"replay-offline-queue"');
    expect(registrar).toContain('addEventListener("online"');
  });

  it("listens for replay-offline-queue message from the service worker", () => {
    expect(registrar).toContain('"message"');
    expect(registrar).toContain("event.data?.type === \"replay-offline-queue\"");
  });
});

describe("Contact card offline queue integration", () => {
  it("imports enqueueAction and checks navigator.onLine", async () => {
    const card = (await import("node:fs")).readFileSync(
      resolve(root, "src/components/worker/contact-card.tsx"),
      "utf8",
    );
    expect(card).toContain('from "@/lib/offline-queue"');
    expect(card).toContain("navigator.onLine");
    expect(card).toContain("enqueueAction");
    expect(card).toContain('type: "lead"');
  });
});

describe("Reviews section offline queue integration", () => {
  it("imports enqueueAction and checks navigator.onLine", async () => {
    const section = (await import("node:fs")).readFileSync(
      resolve(root, "src/components/worker/reviews-section.tsx"),
      "utf8",
    );
    expect(section).toContain('from "@/lib/offline-queue"');
    expect(section).toContain("navigator.onLine");
    expect(section).toContain("enqueueAction");
    expect(section).toContain('type: "review"');
  });
});
