import { describe, it, expect } from "vitest";

/** Overridable so CI/rehearsals can point the suite at an isolated server
 * (the nightly job boots :3001; local runs against an already-running server
 * use FLOWS_BASE_URL). Empty-string guard: some sandboxes export PORT-like
 * empties — fall back to the default instead of building a malformed URL. */
const BASE_URL = process.env.FLOWS_BASE_URL || "http://localhost:3001";

function url(path: string): string {
  return BASE_URL + path;
}

/**
 * Critical User Flows — E2E against a RUNNING dev server (localhost:3001).
 *
 * The gate is probed at MODULE LOAD via top-level await: `it.skipIf`
 * snapshots its condition at collection time, and collection runs BEFORE any
 * beforeAll — a gate set inside beforeAll could never enable a test (the bug
 * that made this suite silently skip on every run). Module-load probing also
 * gives the dev server's cold on-demand routes a compile window before the
 * tests execute. Mirrors the describeLive convention of the prisma chain
 * suites (they gate on a live DATABASE_URL; this one gates on a live server).
 */
let serverUp = false;
try {
  const resp = await fetch(url("/api/health"), {
    signal: AbortSignal.timeout(3000),
  });
  serverUp = resp.ok;
} catch {
  serverUp = false;
}

const describeServer = serverUp ? describe : describe.skip;
if (!serverUp) {
  console.warn(
    "⚠ E2E server not available at " +
      BASE_URL +
      " — skipping integration tests. Start the dev server first."
  );
}

describeServer("Critical User Flows - E2E", () => {
  describe("Search Flow", () => {
    it("should search for workers by category", async () => {
      const response = await fetch(url("/api/workers?category=plumbing"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  describe("Health Check", () => {
    it("should return health status", async () => {
      const response = await fetch(url("/api/health"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      // Route contract (src/app/api/health/route.ts): { ok, mode, time }.
      expect(data.ok).toBe(true);
    });
  });

  describe("Worker Profile Flow", () => {
    // 20s: this renders the full profile page server-side against the real
    // DB — a cold CI runner (fresh page compile + DB round-trips) can exceed
    // vitest's 5s default (observed in the 2026-09-10 nightly run).
    it("should get worker by slug", async () => {
      const response = await fetch(url("/api/workers?limit=1"));
      const data = await response.json();
      if (data.items.length > 0) {
        const slug = data.items[0].slug;
        const profileResponse = await fetch(url("/workers/" + slug));
        expect(profileResponse.ok).toBe(true);
      }
    }, 20_000);
  });

  describe("Booking Flow", () => {
    it("should have booking page", async () => {
      const response = await fetch(url("/bookings"));
      expect(response.ok).toBe(true);
    });
  });

  describe("Forum Flow", () => {
    it("should list forum posts", async () => {
      const response = await fetch(url("/api/forum"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.posts).toBeDefined();
      expect(Array.isArray(data.posts)).toBe(true);
    });

    it("should filter forum by category", async () => {
      const response = await fetch(url("/api/forum?category=plumbing"));
      expect(response.ok).toBe(true);
    });
  });

  describe("Search API Contract", () => {
    it("should return paginated results", async () => {
      const response = await fetch(url("/api/workers?page=1&limit=10"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.items).toBeDefined();
      expect(data.total).toBeDefined();
      // Contract: { items, total, tookMs } — tookMs is the query timing.
      expect(typeof data.tookMs).toBe("number");
    });

    it("should handle empty search", async () => {
      const response = await fetch(url("/api/workers?q=xyznonexistent123"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.items.length).toBe(0);
    });
  });

  describe("Notifications Flow", () => {
    it("should have notifications endpoint", async () => {
      const response = await fetch(url("/api/notifications"));
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("SEO", () => {
    it("should have sitemap.xml", async () => {
      const response = await fetch(url("/sitemap.xml"));
      expect(response.ok).toBe(true);
      const content = await response.text();
      expect(content).toContain("<urlset");
    });

    it("should have robots.txt", async () => {
      const response = await fetch(url("/robots.txt"));
      expect(response.ok).toBe(true);
      const content = await response.text();
      // The route emits "User-Agent" (canonical robots casing).
      expect(content).toMatch(/User-Agent/i);
    });
  });

  describe("PWA", () => {
    it("should have manifest.json", async () => {
      const response = await fetch(url("/manifest.webmanifest"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.name).toBeDefined();
      expect(data.icons).toBeDefined();
    });

    it("should have service worker", async () => {
      const response = await fetch(url("/sw.js"));
      expect(response.ok).toBe(true);
    });

    it("should have offline page", async () => {
      const response = await fetch(url("/offline.html"));
      expect(response.ok).toBe(true);
    });
  });

  describe("Page Accessibility", () => {
    it("/ should have lang attribute", async () => {
      const response = await fetch(url("/"));
      const html = await response.text();
      expect(html).toMatch(/lang="(en|ar)"/);
    });

    it("/ should have main content", async () => {
      const response = await fetch(url("/"));
      const html = await response.text();
      expect(html).toMatch(/<main|id="main-content"/);
    });

    it("/search should have lang attribute", async () => {
      const response = await fetch(url("/search"));
      const html = await response.text();
      expect(html).toMatch(/lang="(en|ar)"/);
    });

    it("/categories should have lang attribute", async () => {
      const response = await fetch(url("/categories"));
      const html = await response.text();
      expect(html).toMatch(/lang="(en|ar)"/);
    });

    it("/bookings should have lang attribute", async () => {
      const response = await fetch(url("/bookings"));
      const html = await response.text();
      expect(html).toMatch(/lang="(en|ar)"/);
    });
  });
});
