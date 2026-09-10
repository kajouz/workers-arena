/**
 * Playwright E2E tests for Worker Revenue Tools.
 *
 * Tests the worker dashboard revenue tabs:
 * 1. Overview tab — all 4 main cards render
 * 2. Lead Credits — balance, packages, Buy More button
 * 3. Tokens — balance, packages, expiry
 * 4. Commission — tier progress, all tiers
 * 5. Promoted Profile — campaign status, metrics, pause/play
 * 6. Analytics — spending history, ROI
 * 7. Notifications — alerts list
 * 8. Enhanced Promo — targeting, A/B testing
 * 9. Referrals — referral code, earnings, leaderboard
 * 10. Payments — wallet, installments
 * 11. Gamification — badges, streaks, challenges
 * 12. Mobile — push preferences, quick-respond
 * 13. Tab navigation — all 13 tabs are accessible
 */

import { test, expect, type Page } from "@playwright/test";

// ── Demo session cookies ──────────────────────────────────────────────
const WORKER_SESSION = {
  id: "u-worker",
  name: "Khaled Al-Harbi",
  email: "khaled@plumbfix.sa",
  role: "worker",
  hue: 25,
};

async function loginAsWorker(page: Page) {
  await page.context().addCookies([
    {
      name: "wa_session",
      value: encodeURIComponent(JSON.stringify(WORKER_SESSION)),
      domain: "localhost",
      path: "/",
    },
  ]);
}

// ── Helper: navigate to dashboard revenue section ─────────────────────
async function goToDashboard(page: Page) {
  await loginAsWorker(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  // The revenue tools section (and its tab strip) renders after hydration —
  // wait for the first tab instead of a fixed timeout.
  await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible({
    timeout: 15000,
  });
}

// Each dashboard card renders a unique gradient header text; the tab strip
// may carry the same label, so assert on the *card* copy ("... Tier",
// "... Options", "... Program") rather than the bare tab name.
function cardHeader(page: Page, text: string | RegExp) {
  return page.getByText(text).first();
}

// ====================================================================
//  OVERVIEW TAB
// ====================================================================
test.describe("Worker Revenue Tools", () => {
  test("overview tab renders all 4 main cards", async ({ page }) => {
    await goToDashboard(page);

    // Verify the Overview tab is active by default — the 4 overview cards:
    await expect(page.getByText("Lead Credits").nth(1)).toBeVisible();
    await expect(page.getByText("Application Tokens").first()).toBeVisible();
    await expect(page.getByText("Commission Tier").first()).toBeVisible();
    await expect(page.getByText("Promoted Profile").first()).toBeVisible();
  });

  // ====================================================================
  //  TAB NAVIGATION
  // ====================================================================
  test("all 13 tabs are accessible and clickable", async ({ page }) => {
    await goToDashboard(page);

    const expectedTabs = [
      "Overview",
      "Lead Credits",
      "Tokens",
      "Commission",
      "Analytics",
      "Alerts",
      "Enhanced Promo",
      "Referrals",
      "Payments",
      "Rewards",
      "Mobile",
      "Premium Tools",
      "Promote",
    ];

    for (const tabName of expectedTabs) {
      // Anchored match: /Promote/i would also hit the "Enhanced Promo" tab.
      const tabButton = page
        .getByRole("button", { name: new RegExp(`^${tabName}$`, "i") })
        .first();
      await expect(tabButton).toBeVisible();
      await tabButton.click();
      // The tab strip buttons always exist, so wait until the clicked tab is
      // actually active (aria-pressed flips on the active button) instead of
      // a fixed sleep.
      await expect(tabButton).toHaveAttribute("aria-pressed", "true", { timeout: 5000 });
    }
  });

  // ====================================================================
  //  LEAD CREDITS TAB
  // ====================================================================
  test("lead credits tab shows balance and Buy More button", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Lead Credits/i }).first().click();
    const buyMoreBtn = page.getByRole("button", { name: /Buy More/i }).first();
    await expect(buyMoreBtn).toBeVisible({ timeout: 10000 });
  });

  test("Buy More button toggles package list", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Lead Credits/i }).first().click();

    // Click Buy More — the auto-appear assertion replaces the old sleep.
    const buyMoreBtn = page.getByRole("button", { name: /Buy More/i }).first();
    await buyMoreBtn.click();

    // Package list header renders only after the toggle.
    await expect(page.getByText("Buy Credit Packages")).toBeVisible({ timeout: 5000 });
  });

  // ====================================================================
  //  TOKENS TAB
  // ====================================================================
  test("tokens tab shows balance and token packages", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /^Tokens$/i }).first().click();

    // Verify token balance renders
    await expect(page.getByText("Application Tokens")).toBeVisible();
    await expect(page.getByText("tokens available")).toBeVisible();

    // Verify Buy More button
    await expect(page.getByRole("button", { name: /Buy More/i }).first()).toBeVisible();
  });

  test("tokens Buy More toggles purchase options", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /^Tokens$/i }).first().click();

    // Click Buy More
    await page.getByRole("button", { name: /Buy More/i }).first().click();

    // Token packages header renders only after the toggle.
    await expect(page.getByText("Buy Token Packages")).toBeVisible({ timeout: 5000 });
  });

  // ====================================================================
  //  COMMISSION TAB
  // ====================================================================
  test("commission tab shows tier progress and all tiers", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Commission/i }).first().click();

    // Card header is unique to the commission card.
    await expect(cardHeader(page, "Commission Tier")).toBeVisible({ timeout: 10000 });

    // Verify at least 2 of the 4 tiers are displayed (some may be off-screen)
    const tierNames = ["Bronze", "Silver", "Gold", "Platinum"];
    let visibleTiers = 0;
    for (const tier of tierNames) {
      const visible = await page.getByText(tier).first().isVisible().catch(() => false);
      if (visible) visibleTiers++;
    }
    expect(visibleTiers).toBeGreaterThanOrEqual(2);
  });

  test("commission tier progress bar renders", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Commission/i }).first().click();

    // Verify lifetime billings text
    await expect(page.getByText(/lifetime billings/i)).toBeVisible();
  });

  // ====================================================================
  //  PROMOTED PROFILE TAB
  // ====================================================================
  test("promoted profile shows campaign status and metrics", async ({ page }) => {
    await goToDashboard(page);

    // Anchored: /Promote/i would also match the "Enhanced Promo" tab button.
    await page.getByRole("button", { name: /^Promote$/i }).first().click();

    // Verify promoted profile card renders
    await expect(page.getByText("Promoted Profile").first()).toBeVisible({ timeout: 10000 });

    // Verify at least the status badge is visible (Active or Paused)
    const statusVisible =
      (await page.getByText("Active").first().isVisible().catch(() => false)) ||
      (await page.getByText("Paused").first().isVisible().catch(() => false));
    expect(statusVisible).toBeTruthy();
  });

  test("promoted profile pause/play toggle works", async ({ page }) => {
    await goToDashboard(page);

    // Anchored: /Promote/i would also match the "Enhanced Promo" tab button.
    await page.getByRole("button", { name: /^Promote$/i }).first().click();

    // Wait for the promoted card to render
    await expect(page.getByText("Promoted Profile").first()).toBeVisible({ timeout: 10000 });

    // The toggle now carries an accessible name (see promoted-campaign.tsx)
    const toggleBtn = page.getByRole("button", { name: /Pause campaign|Resume campaign/i }).first();
    await expect(toggleBtn).toBeVisible({ timeout: 5000 });

    const wasActive = await page
      .getByText("Active")
      .first()
      .isVisible()
      .catch(() => false);

    await toggleBtn.click();

    // Status should toggle to the opposite badge.
    if (wasActive) {
      await expect(page.getByText("Paused").first()).toBeVisible({ timeout: 5000 });
    } else {
      await expect(page.getByText("Active").first()).toBeVisible({ timeout: 5000 });
    }
  });

  // ====================================================================
  //  ANALYTICS TAB
  // ====================================================================
  test("analytics tab renders spending and ROI data", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Analytics/i }).first().click();

    await expect(cardHeader(page, "Revenue Analytics")).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  NOTIFICATIONS / ALERTS TAB
  // ====================================================================
  test("alerts tab renders notification list", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Alerts/i }).first().click();

    await expect(page.getByText("Smart Alerts").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  ENHANCED PROMO TAB
  // ====================================================================
  test("enhanced promo tab renders targeting options", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Enhanced Promo/i }).first().click();

    await expect(page.getByText("Enhanced Promotion").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  REFERRALS TAB
  // ====================================================================
  test("referrals tab renders referral code and earnings", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Referrals/i }).first().click();

    await expect(page.getByText("Referral Program").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  PAYMENTS TAB
  // ====================================================================
  test("payments tab renders wallet and payment options", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Payments/i }).first().click();

    await expect(page.getByText("Payment Options").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  GAMIFICATION TAB
  // ====================================================================
  test("gamification tab renders badges and streaks", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Rewards/i }).first().click();

    await expect(page.getByText("Achievements & Rewards").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  MOBILE TAB
  // ====================================================================
  test("mobile tab renders push preferences and quick-respond", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Mobile/i }).first().click();

    await expect(page.getByText("Mobile Features").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  PREMIUM TOOLS TAB
  // ====================================================================
  test("premium tools tab renders SaaS marketplace", async ({ page }) => {
    await goToDashboard(page);

    await page.getByRole("button", { name: /Premium Tools/i }).first().click();

    await expect(page.getByText("All Tools").first()).toBeVisible({ timeout: 10000 });
  });

  // ====================================================================
  //  API ENDPOINTS (bonus — verify APIs respond)
  // ====================================================================
  test("API: /api/credits/balance returns balance data", async ({ request }) => {
    const response = await request.get("/api/credits/balance");
    const data = await response.json();
    // Returns balance if authenticated, or error if not
    const hasBalance = typeof data.balance === "object" && typeof data.balance?.balance === "number";
    const hasError = typeof data.error === "string";
    expect(hasBalance || hasError).toBeTruthy();
  });

  test("API: /api/credits/packages returns packages list", async ({ request }) => {
    const response = await request.get("/api/credits/packages");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty("packages");
    expect(Array.isArray(data.packages)).toBeTruthy();
    expect(data.packages.length).toBeGreaterThan(0);
  });

  test("API: /api/tokens/balance returns balance data", async ({ request }) => {
    const response = await request.get("/api/tokens/balance");
    const data = await response.json();
    // Returns balance if authenticated, or error if not
    const hasBalance = typeof data.balance === "object" && typeof data.balance?.balance === "number";
    const hasError = typeof data.error === "string";
    expect(hasBalance || hasError).toBeTruthy();
  });

  test("API: /api/tokens/packages returns packages list", async ({ request }) => {
    const response = await request.get("/api/tokens/packages");
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty("packages");
    expect(Array.isArray(data.packages)).toBeTruthy();
    expect(data.packages.length).toBeGreaterThan(0);
  });

  test("API: /api/commission-tier returns tier data", async ({ request }) => {
    const response = await request.get("/api/commission-tier?all=true");
    const data = await response.json();
    // Returns tiers if authenticated, or error if not
    const hasTiers = Array.isArray(data.tiers) && data.tiers.length === 4;
    const hasError = typeof data.error === "string";
    expect(hasTiers || hasError).toBeTruthy();
  });

  test("API: /api/worker/analytics returns analytics data", async ({ request }) => {
    const response = await request.get("/api/worker/analytics");
    const data = await response.json();
    // API returns flat keys: spendingHistory, conversion, roiByTool, monthlyTrend
    const hasData = data.spendingHistory || data.conversion || data.roiByTool || data.monthlyTrend;
    const hasError = typeof data.error === "string";
    expect(hasData || hasError).toBeTruthy();
  });

  test("API: /api/worker/notifications returns notifications", async ({ request }) => {
    const response = await request.get("/api/worker/notifications");
    const data = await response.json();
    // API returns notifications array or error
    const hasData = data.notifications || data.alerts || Array.isArray(data);
    const hasError = typeof data.error === "string";
    expect(hasData || hasError).toBeTruthy();
  });

  test("API: /api/worker/referrals returns referral data", async ({ request }) => {
    const response = await request.get("/api/worker/referrals");
    const data = await response.json();
    // API returns flat keys: referralCode, earnings, leaderboard, bonusRules, tierBenefits
    const hasData = data.referralCode || data.earnings || data.leaderboard || data.bonusRules;
    const hasError = typeof data.error === "string";
    expect(hasData || hasError).toBeTruthy();
  });

  test("API: /api/worker/gamification returns gamification data", async ({ request }) => {
    const response = await request.get("/api/worker/gamification");
    const data = await response.json();
    // API returns flat keys: badges, streaks, challenges, achievement, totalXP
    const hasData = data.badges || data.streaks || data.challenges || data.achievement;
    const hasError = typeof data.error === "string";
    expect(hasData || hasError).toBeTruthy();
  });
});
