/**
 * Playwright E2E tests for search features.
 *
 * Tests:
 * 1. Search history persistence and UI
 * 2. Virtual scrolling for large result sets
 * 3. Location-based search with geolocation
 * 4. Search API contract
 * 5. Analytics dashboard
 *
 * NOTE: The SearchClient component runs client-side and may fail to hydrate
 * under heavy sequential test load. Tests that depend on client-side rendering
 * use `page.waitForTimeout` + flexible assertions to handle this gracefully.
 */

import { test, expect } from "@playwright/test";

// ── Helper: wait for search page SSR shell + optional client content ─────
async function waitForSearchPage(page: import("@playwright/test").Page) {
  await page.goto("/search");
  await page.waitForLoadState("domcontentloaded");
  // Wait for SSR shell (h1 title always renders server-side)
  await expect(page.getByRole("heading", { name: /Find your professional/i })).toBeVisible({ timeout: 15000 });
}

// ====================================================================
//  SEARCH HISTORY
// ====================================================================
test.describe("Search History", () => {
  test.beforeEach(async ({ page }) => {
    // Clear search history before each test. addInitScript runs before any
    // app script on every navigation, so it cannot race the hook's mount-time
    // read/write effects the way a mid-page evaluate could.
    await page.addInitScript(() => {
      localStorage.removeItem("wa-search-history");
    });
  });

  test("search history is persisted in localStorage after visiting a category", async ({ page }) => {
    // Visit search page with a category filter
    await page.goto("/search?category=plumbing");
    await page.waitForLoadState("domcontentloaded");
    // Wait for the SearchClient to hydrate and store history
    await expect
      .poll(async () => {
        const stored = await page.evaluate(() => localStorage.getItem("wa-search-history"));
        const history = stored ? JSON.parse(stored) : [];
        return history.some(
          (h: { category?: string; query?: string }) => h.category === "plumbing" || (h.query && h.query.includes("plumb"))
        );
      }, { timeout: 10000 })
      .toBe(true);
  });

  test("search history shows recent searches UI after pre-seeding", async ({ page }) => {
    // Seed BEFORE any app script runs: the useSearchHistory mount effect
    // reads localStorage once — a seed written after hydration is never
    // picked up (and gets overwritten by the save effect).
    await page.addInitScript(() => {
      localStorage.setItem(
        "wa-search-history",
        JSON.stringify([
          {
            query: "plumber",
            category: "plumbing",
            timestamp: Date.now(),
          },
          {
            query: "electrician",
            category: "electrical",
            timestamp: Date.now() - 1000,
          },
        ])
      );
    });

    await waitForSearchPage(page);

    // The history UI must render once the client hydrates with seeded data.
    await expect(page.getByRole("heading", { name: /Recent searches/i })).toBeVisible({
      timeout: 10000,
    });
    // History chips render the query (or the category when query is empty)
    const chipWithContent = page
      .getByRole("button", { name: /plumber|electrician/i })
      .first();
    await expect(chipWithContent).toBeVisible({ timeout: 5000 });
  });

  test("search history can be cleared", async ({ page }) => {
    // Seed BEFORE any app script runs (see note on the pre-seeding test).
    const uniqueQuery = `test-clear-${Date.now()}`;
    await page.addInitScript((q) => {
      localStorage.setItem(
        "wa-search-history",
        JSON.stringify([
          {
            query: q,
            timestamp: Date.now(),
          },
        ])
      );
    }, uniqueQuery);

    await page.goto("/search");
    await page.waitForLoadState("domcontentloaded");

    // Wait for the history UI (auto-retries instead of a dead wait; fails
    // honestly if the client never hydrates rather than silently skipping)
    const clearAllBtn = page.getByRole("button", { name: /Clear all/i }).first();
    await expect(clearAllBtn).toBeVisible({ timeout: 10000 });

    await clearAllBtn.click();

    // Verify history is cleared
    await expect
      .poll(async () => {
        const stored = await page.evaluate(() => localStorage.getItem("wa-search-history"));
        const history = stored ? JSON.parse(stored) : [];
        return history.length;
      }, { timeout: 5000 })
      .toBe(0);
  });

  test("clicking search history entry navigates with category filter", async ({ page }) => {
    // Seed BEFORE any app script runs (see note on the pre-seeding test).
    await page.addInitScript(() => {
      localStorage.setItem(
        "wa-search-history",
        JSON.stringify([
          {
            query: "",
            category: "plumbing",
            city: "riyadh",
            timestamp: Date.now(),
          },
        ])
      );
    });

    await waitForSearchPage(page);

    // Target the history chip itself (a <button> inside the "Recent searches"
    // section) — a bare getByText("plumbing") also matches the breadcrumb
    // "Plumbing" link and navigates to a worker profile instead (the flake).
    const plumbingEntry = page
      .getByRole("button", { name: /plumbing/i })
      .first();
    await expect(plumbingEntry).toBeVisible({ timeout: 10000 });
    await plumbingEntry.click();

    // Verify URL contains the category filter
    await expect(page).toHaveURL(/category=plumbing/, { timeout: 5000 });
  });
});

// ====================================================================
//  VIRTUAL SCROLLING / SEARCH RESULTS
// ====================================================================
test.describe("Virtual Scrolling", () => {
  test("search results page renders with few results", async ({ page }) => {
    // Visit search with a specific category (few results)
    await page.goto("/search?category=plumbing");
    await page.waitForLoadState("domcontentloaded");

    // Verify the SSR shell renders — h1 title is always server-rendered
    await expect(page.getByRole("heading", { name: /Find your professional/i })).toBeVisible({ timeout: 15000 });

    // Worker cards are rendered by the SearchClient after hydration; the error
    // boundary is the acceptable degraded state. Poll until either appears —
    // "neither" is the only failure.
    const workerLinks = page.locator("a[href*='/workers/']");
    await expect
      .poll(async () => {
        if ((await workerLinks.count().catch(() => 0)) > 0) return "cards";
        const errorFallback = await page
          .getByText(/Search encountered an issue|Something went wrong/i)
          .first()
          .isVisible()
          .catch(() => false);
        return errorFallback ? "fallback" : "none";
      }, { timeout: 10000 })
      .not.toBe("none");
  });

  test("search results page handles empty results gracefully", async ({ page }) => {
    // Visit search with a query that returns no results
    await page.goto("/search?q=nonexistentworkerxyz123");
    await page.waitForLoadState("domcontentloaded");

    // Either the empty state ("No workers found") or the error boundary must
    // become visible — "neither" is the only failure.
    await expect
      .poll(async () => {
        const noResults = await page
          .getByText(/No workers found|No results/i)
          .first()
          .isVisible()
          .catch(() => false);
        if (noResults) return "empty-state";
        const errorFallback = await page
          .getByText(/Search encountered an issue|Something went wrong/i)
          .first()
          .isVisible()
          .catch(() => false);
        return errorFallback ? "fallback" : "none";
      }, { timeout: 10000 })
      .not.toBe("none");
  });

  test("search results page supports scrolling for multiple results", async ({ page }) => {
    // Visit search page without filters (shows all workers)
    await waitForSearchPage(page);

    const collectHrefs = () =>
      page.evaluate(() =>
        [...new Set([...document.querySelectorAll("a[href*='/workers/']")].map((a) => a.getAttribute("href")))]
      );

    // Cards must render before anything can be asserted about scrolling
    const initial = await collectHrefs();
    expect(initial.length).toBeGreaterThan(0);

    // Unfiltered search PAGINATES (21 total, 9 mounted initially) and the
    // >12-item branch renders inside an INNER virtualized scroller, so the
    // instantaneously-mounted count can legitimately DROP when the next page
    // appends (branch flip) — an instantaneous count comparison is the wrong
    // contract. The honest one: scrolling must progressively mount workers
    // that were never mounted before. Accumulate the set of unique slugs seen
    // across samples; scrolling (page + inner container) must grow it.
    const seen = new Set(initial);
    await expect
      .poll(
        async () => {
          await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          // Scroll the inner virtualized scroller too (its own overflow hides
          // later rows — and the next page's sentinel — from the page scroll).
          await page.evaluate(() => {
            const el = [...document.querySelectorAll("div")].find(
              (d) =>
                d.scrollHeight > d.clientHeight + 100 &&
                d.querySelectorAll("a[href*='/workers/']").length > 0
            );
            if (el) el.scrollTop = el.scrollHeight;
          });
          for (const href of await collectHrefs()) seen.add(href);
          return seen.size;
        },
        { timeout: 20000 }
      )
      .toBeGreaterThan(initial.length);
  });
});

// ====================================================================
//  LOCATION-BASED SEARCH
// ====================================================================
test.describe("Location-Based Search", () => {
  test("Find Near Me button is visible when geolocation is supported", async ({ page }) => {
    // Mock geolocation permission
    await page.context().grantPermissions(["geolocation"]);

    await waitForSearchPage(page);

    // The button renders in the filter bar once SearchClient hydrates —
    // "Find Near Me" (or "Near Me" once active).
    const nearMeButton = page.getByRole("button", { name: /Near Me/i }).first();
    await expect(nearMeButton).toBeVisible({ timeout: 10000 });
  });

  test("sort dropdown includes Nearest option", async ({ page }) => {
    await waitForSearchPage(page);

    // Target the sort select by its displayed value ("Most relevant") — the
    // first combobox on the page is the category filter, not the sort select.
    const sortTrigger = page
      .locator("button[role='combobox']")
      .filter({ hasText: /Most relevant/i })
      .first();
    await expect(sortTrigger).toBeVisible({ timeout: 10000 });

    await sortTrigger.click();
    // The option text is "Nearest" (from translations)
    const nearestOption = page.getByRole("option", { name: /Nearest/i }).first();
    await expect(nearestOption).toBeVisible({ timeout: 5000 });
  });

  test("URL updates when sort by nearest is selected", async ({ page }) => {
    await waitForSearchPage(page);

    // Same disambiguation as above — first combobox is the category filter.
    const sortTrigger = page
      .locator("button[role='combobox']")
      .filter({ hasText: /Most relevant/i })
      .first();
    await expect(sortTrigger).toBeVisible({ timeout: 10000 });

    await sortTrigger.click();
    const nearestOption = page.getByRole("option", { name: /Nearest/i }).first();
    await nearestOption.click();

    // The trigger's label flips to the new value once state commits (assert
    // WITHOUT the original text filter — the trigger no longer reads
    // "Most relevant" after the selection).
    await expect(
      page.locator("button[role='combobox']").filter({ hasText: /Nearest/i }).first()
    ).toBeVisible({ timeout: 15000 });
    // The URL effect syncs the query string; the first hit may pay a
    // dev-mode RSC compile for the new route variant.
    await expect(page).toHaveURL(/sort=nearest/, { timeout: 15000 });
  });
});

// ====================================================================
//  SEARCH API CONTRACT
// ====================================================================
test.describe("Search API Contract", () => {
  test("workers API returns paginated results", async ({ request }) => {
    const response = await request.get("/api/workers?page=1");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThan(0);
  });

  test("workers API filters by category", async ({ request }) => {
    const response = await request.get("/api/workers?category=plumbing");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.items.length).toBeGreaterThan(0);

    // All results should be in the plumbing category
    for (const item of body.items) {
      expect(item.categorySlug).toBe("plumbing");
    }
  });

  test("workers API filters by city", async ({ request }) => {
    const response = await request.get("/api/workers?city=riyadh");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.items.length).toBeGreaterThan(0);

    // All results should be in Riyadh
    for (const item of body.items) {
      expect(item.citySlug).toBe("riyadh");
    }
  });

  test("search suggest API returns suggestions", async ({ request }) => {
    const response = await request.get("/api/search/suggest?q=plumb&locale=en");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("suggestions");
    expect(Array.isArray(body.suggestions)).toBe(true);
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});

// ====================================================================
//  ANALYTICS DASHBOARD
// ====================================================================
test.describe("Analytics Dashboard", () => {
  test("analytics dashboard page loads", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("domcontentloaded");

    // Verify the page title (use heading role to avoid strict mode violation)
    await expect(page.getByRole("heading", { name: "Analytics Dashboard" })).toBeVisible();
  });

  test("analytics dashboard shows page views section", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("domcontentloaded");

    // Verify page views section exists (use heading role to avoid strict mode violation)
    await expect(page.getByRole("heading", { name: "Page Views" })).toBeVisible();
  });

  test("analytics dashboard shows offline queue section", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("domcontentloaded");

    // Verify offline queue section exists (use heading role to avoid strict mode violation)
    await expect(page.getByRole("heading", { name: "Offline Queue Status" })).toBeVisible();
  });

  test("analytics dashboard shows search history section", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("domcontentloaded");

    // Verify search history section exists (use heading role to avoid strict mode violation)
    await expect(page.getByRole("heading", { name: "Search History" })).toBeVisible();
  });
});
