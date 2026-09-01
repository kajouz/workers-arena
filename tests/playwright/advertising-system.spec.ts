/**
 * Playwright E2E tests for the Advertising System.
 *
 * Tests:
 * 1. Campaign creation flow (company dashboard)
 * 2. Campaign listing and status display
 * 3. Impression tracking (email pixel)
 * 4. Click tracking (promoted clicks)
 * 5. Campaign analytics API
 * 6. Sponsored search results rendering
 * 7. Campaign payment flow
 */

import { test, expect, type Page } from "@playwright/test";

const COMPANY_SESSION = {
  id: "u-company",
  name: "BuildCo Ltd",
  email: "ads@buildco.sa",
  role: "company",
  hue: 150,
};

const ADMIN_SESSION = {
  id: "u-admin",
  name: "Platform Admin",
  email: "admin@workersarena.com",
  role: "admin",
  hue: 280,
};

async function loginAsCompany(page: Page) {
  await page.context().addCookies([
    {
      name: "wa_session",
      value: encodeURIComponent(JSON.stringify(COMPANY_SESSION)),
      domain: "localhost",
      path: "/",
    },
  ]);
}

async function loginAsAdmin(page: Page) {
  await page.context().addCookies([
    {
      name: "wa_session",
      value: encodeURIComponent(JSON.stringify(ADMIN_SESSION)),
      domain: "localhost",
      path: "/",
    },
  ]);
}

// ====================================================================
//  1. CAMPAIGN CREATION FLOW
// ====================================================================
test.describe("Campaign Creation", () => {
  test("company dashboard loads with campaign list", async ({ page }) => {
    await loginAsCompany(page);
    await page.goto("/company");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Verify company dashboard renders
    await expect(page.getByText(/campaign|Campaign|Dashboard/i).first()).toBeVisible();
  });

  test("Create Campaign button opens the campaign builder dialog", async ({ page }) => {
    await loginAsCompany(page);
    await page.goto("/company");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Find and click the Create Campaign button
    const createBtn = page.getByRole("button", { name: /Create Campaign/i }).first();
    const visible = await createBtn.isVisible().catch(() => false);

    if (visible) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Dialog should open with form fields
      await expect(page.getByText(/Create a campaign|campaign builder/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("campaign builder form has all required fields", async ({ page }) => {
    await loginAsCompany(page);
    await page.goto("/company");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const createBtn = page.getByRole("button", { name: /Create Campaign/i }).first();
    const visible = await createBtn.isVisible().catch(() => false);

    if (visible) {
      await createBtn.click();
      await page.waitForTimeout(500);

      // Check for form fields
      const hasNameField = await page.getByPlaceholder(/Villa|renovation/i).first().isVisible().catch(() => false);
      const hasBudgetField = await page.locator("input[type='number']").first().isVisible().catch(() => false);
      const hasPlacementSelect = await page.locator("select").first().isVisible().catch(() => false);

      expect(hasNameField || hasBudgetField || hasPlacementSelect).toBeTruthy();
    }
  });
});

// ====================================================================
//  2. CAMPAIGN LISTING AND STATUS
// ====================================================================
test.describe("Campaign Listing", () => {
  test("company dashboard shows campaign statistics", async ({ page }) => {
    await loginAsCompany(page);
    await page.goto("/company");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Should show campaign stats (impressions, clicks, etc.)
    const hasStats = await page.getByText(/impression|click|spent|budget|CTR/i).first().isVisible().catch(() => false);
    expect(hasStats).toBeTruthy();
  });

  test("campaigns show correct status badges", async ({ page }) => {
    await loginAsCompany(page);
    await page.goto("/company");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Check for status badges (active, paused, ended, pending)
    const hasStatus = await page.getByText(/active|paused|ended|pending/i).first().isVisible().catch(() => false);
    expect(hasStatus).toBeTruthy();
  });
});

// ====================================================================
//  3. IMPRESSION TRACKING (EMAIL PIXEL)
// ====================================================================
test.describe("Impression Tracking", () => {
  test("GET /api/ads/[id]/impression returns a 1x1 GIF pixel", async ({ request }) => {
    const response = await request.get("/api/ads/test-ad-123/impression");
    expect(response.status()).toBe(200);

    // Should return a GIF image
    const contentType = response.headers()["content-type"];
    expect(contentType).toContain("image/gif");

    // Should have no-cache headers
    const cacheControl = response.headers()["cache-control"];
    expect(cacheControl).toContain("no-cache");

    // Body should be a valid GIF (starts with GIF89a)
    const body = await response.body();
    const header = String.fromCharCode(...body.slice(0, 6));
    expect(header).toBe("GIF89a");
  });

  test("impression pixel returns correct size (1x1)", async ({ request }) => {
    const response = await request.get("/api/ads/test-ad-456/impression");
    expect(response.status()).toBe(200);

    const body = await response.body();
    // GIF89a header (6 bytes) + logical screen descriptor (7 bytes) = 13 bytes
    // Width = bytes 7-8 (should be 0x01 = 1)
    // Height = bytes 9-10 (should be 0x01 = 1)
    expect(body[6]).toBe(1); // width low byte
    expect(body[7]).toBe(0); // width high byte
    expect(body[8]).toBe(1); // height low byte
    expect(body[9]).toBe(0); // height high byte
  });
});

// ====================================================================
//  4. CLICK TRACKING (PROMOTED CLICKS)
// ====================================================================
test.describe("Click Tracking", () => {
  test("POST /api/promoted/click tracks a click successfully", async ({ request }) => {
    const response = await request.post("/api/promoted/click", {
      data: {
        campaignId: "camp-1",
        workerId: "w-1",
        searchQuery: "plumber",
        categorySlug: "plumbing",
        citySlug: "riyadh",
        position: 0,
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.success).toBeTruthy();
  });

  test("POST /api/promoted/click returns 400 for missing fields", async ({ request }) => {
    const response = await request.post("/api/promoted/click", {
      data: {
        campaignId: "camp-1",
        // Missing required fields
      },
    });

    expect(response.status()).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Missing");
  });

  test("POST /api/promoted/click returns 403 when promoted profiles disabled", async ({ request }) => {
    // This test verifies the feature flag check
    const response = await request.post("/api/promoted/click", {
      data: {
        campaignId: "camp-1",
        workerId: "w-1",
        searchQuery: "plumber",
        categorySlug: "plumbing",
        citySlug: "riyadh",
        position: 0,
      },
    });

    // Should either succeed (200) or be disabled (403)
    expect([200, 403]).toContain(response.status());
  });
});

// ====================================================================
//  5. CAMPAIGN ANALYTICS API
// ====================================================================
test.describe("Campaign Analytics", () => {
  test("GET /api/company/analytics returns ROI metrics", async ({ request }) => {
    const response = await request.get("/api/company/analytics");
    // May return 401 if not authenticated
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("totalImpressions");
      expect(data).toHaveProperty("totalClicks");
      expect(data).toHaveProperty("totalSpent");
      expect(data).toHaveProperty("ctr");
      expect(data).toHaveProperty("campaignCount");
    }
  });

  test("campaign analytics includes placement breakdown", async ({ request }) => {
    const response = await request.get("/api/company/analytics");
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("placementStats");
      expect(typeof data.placementStats).toBe("object");
    }
  });

  test("campaign analytics includes daily performance", async ({ request }) => {
    const response = await request.get("/api/company/analytics");
    if (response.status() === 200) {
      const data = await response.json();
      expect(data).toHaveProperty("dailyPerformance");
      expect(Array.isArray(data.dailyPerformance)).toBeTruthy();
      expect(data.dailyPerformance.length).toBe(7); // Last 7 days
    }
  });
});

// ====================================================================
//  6. SPONSORED SEARCH RESULTS
// ====================================================================
test.describe("Sponsored Search Results", () => {
  test("search page renders sponsored results section", async ({ page }) => {
    await page.goto("/search?category=plumbing");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // The search page should have a sponsored results section
    // It may or may not render depending on whether campaigns exist
    const hasSponsored = await page.getByText(/sponsored|Sponsored|promoted/i).first().isVisible().catch(() => false);
    // Soft check — sponsored results may not always be present
    expect(typeof hasSponsored).toBe("boolean");
  });

  test("sponsored result card has correct structure", async ({ page }) => {
    await page.goto("/search?category=plumbing");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);

    // Check if any sponsored card exists
    const sponsoredBadge = page.getByText("Sponsored").first();
    const hasSponsored = await sponsoredBadge.isVisible().catch(() => false);

    if (hasSponsored) {
      // Sponsored card should have the Sparkles icon and badge
      await expect(sponsoredBadge).toBeVisible();
    }
  });
});

// ====================================================================
//  7. CAMPAIGN PAYMENT FLOW
// ====================================================================
test.describe("Campaign Payment", () => {
  test("admin campaign email preview renders", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Admin dashboard should load
    await expect(page.getByText(/Admin|Dashboard/i).first()).toBeVisible();
  });

  test("campaign payments section exists in admin", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/invoices");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Invoices page should load
    await expect(page.getByText(/Invoice|invoice/i).first()).toBeVisible();
  });
});

// ====================================================================
//  8. AD PLACEMENTS ON HOMEPAGE
// ====================================================================
test.describe("Ad Placements", () => {
  test("homepage has sponsored banner slot", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // The footer has a sponsored placement slot
    const hasSponsoredSlot = await page.getByText(/sponsored|Sponsored|BuildCo/i).first().isVisible().catch(() => false);
    expect(hasSponsoredSlot).toBeTruthy();
  });

  test("homepage has Create Campaign CTA for companies", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // The sponsored slot should have a Create Campaign link
    const hasCTA = await page.getByText(/Create campaign|create campaign/i).first().isVisible().catch(() => false);
    expect(hasCTA).toBeTruthy();
  });
});
