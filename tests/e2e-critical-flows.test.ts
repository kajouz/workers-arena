import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = "http://localhost:3001";

function url(path: string): string {
  return BASE_URL + path;
}

let serverUp = false;

describe("Critical User Flows - E2E", () => {
  beforeAll(async () => {
    try {
      const resp = await fetch(url("/api/health"), {
        signal: AbortSignal.timeout(3000),
      });
      serverUp = resp.ok;
    } catch {
      serverUp = false;
    }
    if (!serverUp) {
      console.warn(
        "⚠ E2E server not available at " +
          BASE_URL +
          " — skipping integration tests. Start the dev server first."
      );
    }
  });

  describe("Search Flow", () => {
    it.skipIf(!serverUp)(
      "should search for workers by category",
      async () => {
        const response = await fetch(url("/api/workers?category=plumbing"));
        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.items).toBeDefined();
        expect(Array.isArray(data.items)).toBe(true);
      }
    );
  });

  describe("Health Check", () => {
    it.skipIf(!serverUp)("should return health status", async () => {
      const response = await fetch(url("/api/health"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.status).toBe("ok");
    });
  });

  describe("Worker Profile Flow", () => {
    it.skipIf(!serverUp)("should get worker by slug", async () => {
      const response = await fetch(url("/api/workers?limit=1"));
      const data = await response.json();
      if (data.items.length > 0) {
        const slug = data.items[0].slug;
        const profileResponse = await fetch(url("/workers/" + slug));
        expect(profileResponse.ok).toBe(true);
      }
    });
  });

  describe("Booking Flow", () => {
    it.skipIf(!serverUp)("should have booking page", async () => {
      const response = await fetch(url("/bookings"));
      expect(response.ok).toBe(true);
    });
  });

  describe("Forum Flow", () => {
    it.skipIf(!serverUp)("should list forum posts", async () => {
      const response = await fetch(url("/api/forum"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.posts).toBeDefined();
      expect(Array.isArray(data.posts)).toBe(true);
    });

    it.skipIf(!serverUp)("should filter forum by category", async () => {
      const response = await fetch(url("/api/forum?category=plumbing"));
      expect(response.ok).toBe(true);
    });
  });

  describe("Search API Contract", () => {
    it.skipIf(!serverUp)("should return paginated results", async () => {
      const response = await fetch(url("/api/workers?page=1&limit=10"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.items).toBeDefined();
      expect(data.total).toBeDefined();
      expect(data.page).toBe(1);
    });

    it.skipIf(!serverUp)("should handle empty search", async () => {
      const response = await fetch(url("/api/workers?q=xyznonexistent123"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.items.length).toBe(0);
    });
  });

  describe("Notifications Flow", () => {
    it.skipIf(!serverUp)("should have notifications endpoint", async () => {
      const response = await fetch(url("/api/notifications"));
      expect([200, 401]).toContain(response.status);
    });
  });

  describe("SEO", () => {
    it.skipIf(!serverUp)("should have sitemap.xml", async () => {
      const response = await fetch(url("/sitemap.xml"));
      expect(response.ok).toBe(true);
      const content = await response.text();
      expect(content).toContain("<urlset");
    });

    it.skipIf(!serverUp)("should have robots.txt", async () => {
      const response = await fetch(url("/robots.txt"));
      expect(response.ok).toBe(true);
      const content = await response.text();
      expect(content).toContain("User-agent");
    });
  });

  describe("PWA", () => {
    it.skipIf(!serverUp)("should have manifest.json", async () => {
      const response = await fetch(url("/manifest.webmanifest"));
      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.name).toBeDefined();
      expect(data.icons).toBeDefined();
    });

    it.skipIf(!serverUp)("should have service worker", async () => {
      const response = await fetch(url("/sw.js"));
      expect(response.ok).toBe(true);
    });

    it.skipIf(!serverUp)("should have offline page", async () => {
      const response = await fetch(url("/offline.html"));
      expect(response.ok).toBe(true);
    });
  });

  describe("Page Accessibility", () => {
    it.skipIf(!serverUp)("/ should have lang attribute", async () => {
      const response = await fetch(url("/"));
      const html = await response.text();
      expect(html).toMatch(/lang="(en|ar)"/);
    });

    it.skipIf(!serverUp)("/ should have main content", async () => {
      const response = await fetch(url("/"));
      const html = await response.text();
      expect(html).toMatch(/<main|id="main-content"/);
    });

    it.skipIf(!serverUp)("/search should have lang attribute", async () => {
      const response = await fetch(url("/search"));
      const html = await response.text();
      expect(html).toMatch(/lang="(en|ar)"/);
    });

    it.skipIf(!serverUp)(
      "/categories should have lang attribute",
      async () => {
        const response = await fetch(url("/categories"));
        const html = await response.text();
        expect(html).toMatch(/lang="(en|ar)"/);
      }
    );

    it.skipIf(!serverUp)(
      "/bookings should have lang attribute",
      async () => {
        const response = await fetch(url("/bookings"));
        const html = await response.text();
        expect(html).toMatch(/lang="(en|ar)"/);
      }
    );
  });
});
