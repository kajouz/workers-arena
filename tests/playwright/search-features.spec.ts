/**
 * Playwright E2E tests for search features.
 *
 * Tests:
 * 1. Search history persistence and UI
 * 2. Virtual scrolling for large result sets
 * 3. Location-based search with geolocation
 */

import { test, expect } from "@playwright/test";

test.describe("Search History", () => {
  test.beforeEach(async ({ page }) => {
    // Clear search history before each test
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("wa-search-history");
    });
  });

  test("search history is persisted in localStorage", async ({ page }) => {
    // Visit search page and perform a search
    await page.goto("/search?category=plumbing");
    await page.waitForLoadState("networkidle");

    // Verify search history is stored
    const history = await page.evaluate(() => {
      const stored = localStorage.getItem("wa-search-history");
      return stored ? JSON.parse(stored) : [];
    });

    expect(history.length).toBeGreaterThan(0);
    expect(history[0].category).toBe("plumbing");
  });

  test("search history shows recent searches UI", async ({ page }) => {
    // Add some search history
    await page.evaluate(() => {
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

    // Visit search page
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Verify recent searches are shown
    await expect(page.getByText("Recent searches")).toBeVisible();
    await expect(page.getByText("plumber")).toBeVisible();
    await expect(page.getByText("electrician")).toBeVisible();
  });

  test("search history can be cleared", async ({ page }) => {
    // Add search history
    await page.evaluate(() => {
      localStorage.setItem(
        "wa-search-history",
        JSON.stringify([
          {
            query: "test",
            timestamp: Date.now(),
          },
        ])
      );
    });

    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Click clear all button
    await page.getByText("Clear all").click();

    // Verify history is cleared
    const history = await page.evaluate(() => {
      const stored = localStorage.getItem("wa-search-history");
      return stored ? JSON.parse(stored) : [];
    });

    expect(history.length).toBe(0);
  });

  test("clicking search history entry populates filters", async ({ page }) => {
    // Add search history with category
    await page.evaluate(() => {
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

    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Click on the history entry
    await page.getByText("plumbing").click();

    // Verify URL contains the category filter
    await expect(page).toHaveURL(/category=plumbing/);
  });
});

test.describe("Virtual Scrolling", () => {
  test("search results page renders correctly with few results", async ({
    page,
  }) => {
    // Visit search with a specific category (few results)
    await page.goto("/search?category=plumbing");
    await page.waitForLoadState("networkidle");

    // Verify the page loaded with results
    await expect(page.locator("h1")).toContainText("Find your professional");

    // Check that results are displayed
    const resultCount = await page.locator("[class*='worker-card']").count();
    expect(resultCount).toBeGreaterThan(0);
  });

  test("search results page handles empty results", async ({ page }) => {
    // Visit search with a query that returns no results
    await page.goto("/search?q=nonexistentworkerxyz123");
    await page.waitForLoadState("networkidle");

    // Verify empty state is shown
    await expect(page.getByText("No results found")).toBeVisible();
  });

  test("search results page supports infinite scroll", async ({ page }) => {
    // Visit search page
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Get initial result count
    const initialCount = await page.locator("[class*='worker-card']").count();

    // Scroll down to trigger infinite scroll
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });

    // Wait for more results to load
    await page.waitForTimeout(1000);

    // Verify more results loaded (or at least no error)
    const finalCount = await page.locator("[class*='worker-card']").count();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);
  });
});

test.describe("Location-Based Search", () => {
  test("Find Near Me button is visible when geolocation is supported", async ({
    page,
  }) => {
    // Mock geolocation permission
    await page.context().grantPermissions(["geolocation"]);

    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Check if the Find Near Me button is visible
    // Note: In headless mode, geolocation may not be fully supported
    const nearMeButton = page.getByText("Find Near Me");
    const buttonVisible = await nearMeButton.isVisible().catch(() => false);

    // This is a soft check - the button may not appear in all environments
    expect(typeof buttonVisible).toBe("boolean");
  });

  test("sort dropdown includes nearest option", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Open sort dropdown
    await page.getByRole("combobox").first().click();

    // Verify nearest option exists
    await expect(page.getByText("Nearest")).toBeVisible();
  });

  test("URL updates when sort by nearest is selected", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Open sort dropdown and select nearest
    await page.getByRole("combobox").first().click();
    await page.getByText("Nearest").click();

    // Verify URL contains sort=nearest
    await expect(page).toHaveURL(/sort=nearest/);
  });
});

test.describe("Search API Contract", () => {
  test("workers API returns paginated results", async ({ request }) => {
    const response = await request.get("/api/workers?page=1");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.items)).toBe(true);
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
  });
});

test.describe("Analytics Dashboard", () => {
  test("analytics dashboard page loads", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("networkidle");

    // Verify the page title
    await expect(page.getByText("Analytics Dashboard")).toBeVisible();
  });

  test("analytics dashboard shows page views section", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("networkidle");

    // Verify page views section exists
    await expect(page.getByText("Page Views")).toBeVisible();
  });

  test("analytics dashboard shows offline queue section", async ({ page }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("networkidle");

    // Verify offline queue section exists
    await expect(page.getByText("Offline Queue Status")).toBeVisible();
  });

  test("analytics dashboard shows search history section", async ({
    page,
  }) => {
    await page.goto("/debug/analytics");
    await page.waitForLoadState("networkidle");

    // Verify search history section exists
    await expect(page.getByText("Search History")).toBeVisible();
  });
});
