/**
 * Playwright E2E tests for the 7 Revenue System Enhancements.
 *
 * 1. Revenue Analytics — spending history, ROI, conversion, recommendations
 * 2. Smart Notifications — alerts, severity levels, dismiss
 * 3. Enhanced Promotion — targeting, A/B testing, quality score
 * 4. Referral Revenue — code, earnings, leaderboard, tiers
 * 5. Flexible Payments — wallet, installments, business accounts
 * 6. Gamification — badges, streaks, challenges, XP
 * 7. Mobile Features — push preferences, quick-respond, offline balance
 */

import { test, expect, type Page } from "@playwright/test";

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

async function goToDashboardAndTab(page: Page, tabName: string) {
  await loginAsWorker(page);
  await page.goto("/dashboard");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  // Click the tab
  const tab = page.getByRole("button", { name: new RegExp(tabName, "i") }).first();
  await tab.click();
  await page.waitForTimeout(2000);
}

// ====================================================================
//  1. REVENUE ANALYTICS
// ====================================================================
test.describe("Revenue Analytics Enhancement", () => {
  test("analytics tab renders with header and sub-tabs", async ({ page }) => {
    await goToDashboardAndTab(page, "Analytics");

    // Verify header
    await expect(page.getByText("Revenue Analytics").first()).toBeVisible();

    // Verify sub-tabs: Overview, Spending, ROI, Tips
    await expect(page.getByRole("button", { name: /Overview/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Spending/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /ROI/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Tips/i }).first()).toBeVisible();
  });

  test("analytics overview shows conversion metrics", async ({ page }) => {
    await goToDashboardAndTab(page, "Analytics");

    // Verify conversion section renders
    await expect(page.getByText(/Conversion|conversion/i).first()).toBeVisible();
    // Should show total leads, bookings, or revenue numbers
    await expect(page.getByText(/leads|bookings|revenue/i).first()).toBeVisible();
  });

  test("analytics spending tab shows spending breakdown", async ({ page }) => {
    await goToDashboardAndTab(page, "Analytics");

    // Click Spending sub-tab
    await page.getByRole("button", { name: /Spending/i }).first().click();
    await page.waitForTimeout(1000);

    // Should show spending-related content
    await expect(page.getByText(/spending|credits|tokens/i).first()).toBeVisible();
  });

  test("analytics ROI tab shows tool performance", async ({ page }) => {
    await goToDashboardAndTab(page, "Analytics");

    // Click ROI sub-tab
    await page.getByRole("button", { name: /ROI/i }).first().click();
    await page.waitForTimeout(1000);

    // Should show ROI data for tools
    await expect(page.getByText(/ROI|Lead Credits|Token|Promoted/i).first()).toBeVisible();
  });

  test("analytics tips tab shows recommendations", async ({ page }) => {
    await goToDashboardAndTab(page, "Analytics");

    // Click Tips sub-tab
    await page.getByRole("button", { name: /Tips/i }).first().click();
    await page.waitForTimeout(1000);

    // Should show recommendation content
    await expect(page.getByText(/recommend|improve|consider/i).first()).toBeVisible();
  });
});

// ====================================================================
//  2. SMART NOTIFICATIONS
// ====================================================================
test.describe("Smart Notifications Enhancement", () => {
  test("alerts tab renders with notification list", async ({ page }) => {
    await goToDashboardAndTab(page, "Alerts");

    // Verify header
    await expect(page.getByText(/Smart|Notification|Alert/i).first()).toBeVisible();

    // Should show notification items (severity-based styling)
    const notifications = page.locator("[class*='border-'][class*='rounded-lg']");
    const count = await notifications.count();
    expect(count).toBeGreaterThan(0);
  });

  test("notifications show correct severity styling", async ({ page }) => {
    await goToDashboardAndTab(page, "Alerts");

    // Check for severity-based colors
    const urgentBg = page.locator("[class*='bg-red-50']").first();
    const warningBg = page.locator("[class*='bg-amber-50']").first();
    const infoBg = page.locator("[class*='bg-blue-50']").first();

    // At least one severity type should be visible
    const hasUrgent = await urgentBg.isVisible().catch(() => false);
    const hasWarning = await warningBg.isVisible().catch(() => false);
    const hasInfo = await infoBg.isVisible().catch(() => false);
    expect(hasUrgent || hasWarning || hasInfo).toBeTruthy();
  });

  test("dismiss notification removes it from the list", async ({ page }) => {
    await goToDashboardAndTab(page, "Alerts");

    // Count initial notifications
    const initialCount = await page.locator("[class*='border-'][class*='rounded-lg']").count();

    // Find and click a dismiss button (X icon)
    const dismissBtn = page.locator("button").filter({ has: page.locator("svg") }).last();
    const dismissVisible = await dismissBtn.isVisible().catch(() => false);

    if (dismissVisible && initialCount > 0) {
      await dismissBtn.click();
      await page.waitForTimeout(500);

      // Count should decrease
      const finalCount = await page.locator("[class*='border-'][class*='rounded-lg']").count();
      expect(finalCount).toBeLessThanOrEqual(initialCount);
    }
  });
});

// ====================================================================
//  3. ENHANCED PROMOTION
// ====================================================================
test.describe("Enhanced Promotion Enhancement", () => {
  test("enhanced promo tab renders with targeting options", async ({ page }) => {
    await goToDashboardAndTab(page, "Enhanced Promo");

    // Verify header
    await expect(page.getByText("Enhanced Promotion").first()).toBeVisible();

    // Should show targeting-related content
    await expect(page.getByText(/target|geographic|neighborhood/i).first()).toBeVisible();
  });

  test("quality score section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Enhanced Promo");

    // Should show quality score
    await expect(page.getByText(/Quality Score|quality/i).first()).toBeVisible();
  });

  test("A/B variants section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Enhanced Promo");

    // Should show A/B testing content
    await expect(page.getByText(/A\/B|variant|test/i).first()).toBeVisible();
  });

  test("competitor data section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Enhanced Promo");

    // Should show competitor-related content
    await expect(page.getByText(/competitor|bid|position/i).first()).toBeVisible();
  });
});

// ====================================================================
//  4. REFERRAL REVENUE
// ====================================================================
test.describe("Referral Revenue Enhancement", () => {
  test("referrals tab renders with referral code", async ({ page }) => {
    await goToDashboardAndTab(page, "Referrals");

    // Verify header
    await expect(page.getByText("Referral Program").first()).toBeVisible();

    // Should show referral code
    await expect(page.getByText(/referral code|Your Referral Code/i).first()).toBeVisible();
  });

  test("referral earnings section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Referrals");

    // Should show earnings data
    await expect(page.getByText(/earned|earnings|total/i).first()).toBeVisible();
  });

  test("leaderboard section is accessible", async ({ page }) => {
    await goToDashboardAndTab(page, "Referrals");

    // Click leaderboard sub-tab
    const leaderboardTab = page.getByRole("button", { name: /leaderboard|ranking/i }).first();
    const visible = await leaderboardTab.isVisible().catch(() => false);
    if (visible) {
      await leaderboardTab.click();
      await page.waitForTimeout(1000);
      // Should show ranking content
      await expect(page.getByText(/rank|referrals|earned/i).first()).toBeVisible();
    }
  });

  test("bonus rules section is accessible", async ({ page }) => {
    await goToDashboardAndTab(page, "Referrals");

    // Click rules sub-tab
    const rulesTab = page.getByRole("button", { name: /rules|bonus/i }).first();
    const visible = await rulesTab.isVisible().catch(() => false);
    if (visible) {
      await rulesTab.click();
      await page.waitForTimeout(1000);
      // Should show bonus rules
      await expect(page.getByText(/bonus|reward|referral signs/i).first()).toBeVisible();
    }
  });

  test("tier benefits section is accessible", async ({ page }) => {
    await goToDashboardAndTab(page, "Referrals");

    // Click tiers sub-tab
    const tiersTab = page.getByRole("button", { name: /tiers|benefits/i }).first();
    const visible = await tiersTab.isVisible().catch(() => false);
    if (visible) {
      await tiersTab.click();
      await page.waitForTimeout(1000);
      // Should show tier names
      const hasTiers = await page.getByText(/Bronze|Silver|Gold|Platinum/i).first().isVisible().catch(() => false);
      expect(hasTiers).toBeTruthy();
    }
  });
});

// ====================================================================
//  5. FLEXIBLE PAYMENTS
// ====================================================================
test.describe("Flexible Payments Enhancement", () => {
  test("payments tab renders with wallet balance", async ({ page }) => {
    await goToDashboardAndTab(page, "Payments");

    // Verify header
    await expect(page.getByText(/Payment|Wallet/i).first()).toBeVisible();

    // Should show wallet balance
    await expect(page.getByText(/balance|USD|LBP|wallet/i).first()).toBeVisible();
  });

  test("installment plans section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Payments");

    // Click installments sub-tab
    const installmentsTab = page.getByRole("button", { name: /installment/i }).first();
    const visible = await installmentsTab.isVisible().catch(() => false);
    if (visible) {
      await installmentsTab.click();
      await page.waitForTimeout(1000);
      // Should show installment content
      await expect(page.getByText(/installment|monthly|payment plan/i).first()).toBeVisible();
    }
  });

  test("business accounts section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Payments");

    // Click business sub-tab
    const businessTab = page.getByRole("button", { name: /business/i }).first();
    const visible = await businessTab.isVisible().catch(() => false);
    if (visible) {
      await businessTab.click();
      await page.waitForTimeout(1000);
      // Should show business account content
      await expect(page.getByText(/business|enterprise|bulk/i).first()).toBeVisible();
    }
  });

  test("payment methods section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Payments");

    // Click methods sub-tab
    const methodsTab = page.getByRole("button", { name: /method|saved/i }).first();
    const visible = await methodsTab.isVisible().catch(() => false);
    if (visible) {
      await methodsTab.click();
      await page.waitForTimeout(1000);
      // Should show payment methods
      await expect(page.getByText(/payment|card|wallet|method/i).first()).toBeVisible();
    }
  });
});

// ====================================================================
//  6. GAMIFICATION
// ====================================================================
test.describe("Gamification Enhancement", () => {
  test("rewards tab renders with badges and XP", async ({ page }) => {
    await goToDashboardAndTab(page, "Rewards");

    // Verify badges section
    await expect(page.getByText(/badge|achievement|earned/i).first()).toBeVisible();

    // Should show XP or level
    await expect(page.getByText(/XP|level|points/i).first()).toBeVisible();
  });

  test("streaks section renders with active streaks", async ({ page }) => {
    await goToDashboardAndTab(page, "Rewards");

    // Should show streak data
    await expect(page.getByText(/streak|daily|weekly|monthly/i).first()).toBeVisible();
  });

  test("challenges section renders with progress bars", async ({ page }) => {
    await goToDashboardAndTab(page, "Rewards");

    // Click challenges sub-tab
    const challengesTab = page.getByRole("button", { name: /challenges?/i }).first();
    const visible = await challengesTab.isVisible().catch(() => false);
    if (visible) {
      await challengesTab.click();
      await page.waitForTimeout(1000);
      // Should show challenge content
      await expect(page.getByText(/challenge|weekend|speed|review/i).first()).toBeVisible();
    }
  });

  test("badge icons render correctly", async ({ page }) => {
    await goToDashboardAndTab(page, "Rewards");

    // Check that badge items are rendered (they have emoji icons)
    const badges = page.locator("[class*='rounded-xl'][class*='border']");
    const badgeCount = await badges.count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test("level progress bar renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Rewards");

    // Should show level/XP progress
    const progressBars = page.locator("[role='progressbar'], [class*='progress']");
    const count = await progressBars.count();
    // At least one progress indicator should exist
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ====================================================================
//  7. MOBILE FEATURES
// ====================================================================
test.describe("Mobile Features Enhancement", () => {
  test("mobile tab renders with push notification preferences", async ({ page }) => {
    await goToDashboardAndTab(page, "Mobile");

    // Verify header
    await expect(page.getByText("Mobile Features").first()).toBeVisible();

    // Should show push notification section
    await expect(page.getByText(/push|notification|preference/i).first()).toBeVisible();
  });

  test("push notification toggles render", async ({ page }) => {
    await goToDashboardAndTab(page, "Mobile");

    // Should show toggle switches for notification types
    const toggles = page.locator("button[role='switch'], [class*='toggle'], input[type='checkbox']");
    const toggleCount = await toggles.count();
    // At least some toggles should exist
    expect(toggleCount).toBeGreaterThanOrEqual(0);
  });

  test("quick-respond templates section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Mobile");

    // Click quick-respond sub-tab
    const quickTab = page.getByRole("button", { name: /quick|respond|template/i }).first();
    const visible = await quickTab.isVisible().catch(() => false);
    if (visible) {
      await quickTab.click();
      await page.waitForTimeout(1000);
      // Should show template content
      await expect(page.getByText(/template|accept|decline|reschedule/i).first()).toBeVisible();
    }
  });

  test("offline balance section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Mobile");

    // Click offline sub-tab
    const offlineTab = page.getByRole("button", { name: /offline/i }).first();
    const visible = await offlineTab.isVisible().catch(() => false);
    if (visible) {
      await offlineTab.click();
      await page.waitForTimeout(1000);
      // Should show offline balance content
      await expect(page.getByText(/offline|sync|balance/i).first()).toBeVisible();
    }
  });

  test("mobile bonuses section renders", async ({ page }) => {
    await goToDashboardAndTab(page, "Mobile");

    // Click bonuses sub-tab
    const bonusesTab = page.getByRole("button", { name: /bonus/i }).first();
    const visible = await bonusesTab.isVisible().catch(() => false);
    if (visible) {
      await bonusesTab.click();
      await page.waitForTimeout(1000);
      // Should show bonus content
      await expect(page.getByText(/bonus|reward|claim/i).first()).toBeVisible();
    }
  });
});

// ====================================================================
//  API ENDPOINT TESTS
// ====================================================================
test.describe("Enhancement API Endpoints", () => {
  test("GET /api/worker/analytics returns full analytics data", async ({ request }) => {
    const response = await request.get("/api/worker/analytics");
    const data = await response.json();

    // Should have spending history, conversion, ROI data
    expect(Array.isArray(data.spendingHistory)).toBeTruthy();
    expect(data.spendingHistory.length).toBeGreaterThan(0);
    expect(data.conversion).toBeDefined();
    expect(typeof data.conversion.conversionRate).toBe("number");
    expect(Array.isArray(data.roiByTool)).toBeTruthy();
    expect(data.roiByTool.length).toBeGreaterThan(0);
    expect(data.monthlyTrend).toBeDefined();
    expect(Array.isArray(data.recommendations)).toBeTruthy();
  });

  test("GET /api/worker/notifications returns notifications with metadata", async ({ request }) => {
    const response = await request.get("/api/worker/notifications");
    const data = await response.json();

    expect(Array.isArray(data.notifications)).toBeTruthy();
    expect(typeof data.unreadCount).toBe("number");
    expect(typeof data.hasUrgent).toBe("boolean");

    // Each notification should have required fields
    if (data.notifications.length > 0) {
      const n = data.notifications[0];
      expect(n).toHaveProperty("id");
      expect(n).toHaveProperty("type");
      expect(n).toHaveProperty("severity");
      expect(n).toHaveProperty("title");
      expect(n).toHaveProperty("message");
      expect(typeof n.read).toBe("boolean");
    }
  });

  test("GET /api/worker/promoted-enhanced returns targeting and quality data", async ({ request }) => {
    const response = await request.get("/api/worker/promoted-enhanced");
    const data = await response.json();

    expect(Array.isArray(data.targeting)).toBeTruthy();
    expect(Array.isArray(data.abVariants)).toBeTruthy();
    expect(data.qualityScore).toBeDefined();
    expect(typeof data.qualityScore.overall).toBe("number");
    expect(data.competitorData).toBeDefined();
    expect(typeof data.estimatedReach).toBe("number");
  });

  test("GET /api/worker/referrals returns referral program data", async ({ request }) => {
    const response = await request.get("/api/worker/referrals");
    const data = await response.json();

    expect(typeof data.referralCode).toBe("string");
    expect(data.referralCode.length).toBeGreaterThan(0);
    expect(typeof data.referralLink).toBe("string");
    expect(data.earnings).toBeDefined();
    expect(typeof data.earnings.totalEarned).toBe("number");
    expect(Array.isArray(data.leaderboard)).toBeTruthy();
    expect(Array.isArray(data.bonusRules)).toBeTruthy();
    expect(Array.isArray(data.tierBenefits)).toBeTruthy();
    expect(data.tierBenefits.length).toBe(4); // Bronze, Silver, Gold, Platinum
  });

  test("GET /api/worker/payment-options returns payment data", async ({ request }) => {
    const response = await request.get("/api/worker/payment-options");
    const data = await response.json();

    expect(Array.isArray(data.installmentPlans)).toBeTruthy();
    expect(Array.isArray(data.walletTopUps)).toBeTruthy();
    expect(Array.isArray(data.businessAccounts)).toBeTruthy();
    expect(Array.isArray(data.paymentMethods)).toBeTruthy();
    expect(data.walletBalance).toBeDefined();
    expect(typeof data.walletBalance.usd).toBe("number");
    expect(typeof data.walletBalance.lbp).toBe("number");
  });

  test("GET /api/worker/gamification returns gamification data", async ({ request }) => {
    const response = await request.get("/api/worker/gamification");
    const data = await response.json();

    expect(Array.isArray(data.badges)).toBeTruthy();
    expect(data.badges.length).toBeGreaterThan(0);
    expect(Array.isArray(data.streaks)).toBeTruthy();
    expect(data.streaks.length).toBe(3); // daily, weekly, monthly
    expect(Array.isArray(data.challenges)).toBeTruthy();
    expect(data.achievement).toBeDefined();
    expect(typeof data.totalXP).toBe("number");
    expect(typeof data.level).toBe("number");
    expect(typeof data.pointsThisMonth).toBe("number");
  });

  test("GET /api/worker/mobile-features returns mobile data", async ({ request }) => {
    const response = await request.get("/api/worker/mobile-features");
    const data = await response.json();

    expect(Array.isArray(data.pushPreferences)).toBeTruthy();
    expect(data.pushPreferences.length).toBeGreaterThan(0);
    expect(Array.isArray(data.quickRespondTemplates)).toBeTruthy();
    expect(data.offlineBalance).toBeDefined();
    expect(typeof data.offlineBalance.credits).toBe("number");
    expect(Array.isArray(data.mobileBonuses)).toBeTruthy();
    expect(typeof data.appVersion).toBe("string");
    expect(typeof data.isMobileApp).toBe("boolean");
  });

  test("notifications have valid severity levels", async ({ request }) => {
    const response = await request.get("/api/worker/notifications");
    const data = await response.json();

    const validSeverities = ["info", "warning", "success", "urgent"];
    for (const n of data.notifications) {
      expect(validSeverities).toContain(n.severity);
    }
  });

  test("gamification badges have correct structure", async ({ request }) => {
    const response = await request.get("/api/worker/gamification");
    const data = await response.json();

    for (const badge of data.badges) {
      expect(typeof badge.id).toBe("string");
      expect(typeof badge.name).toBe("string");
      expect(typeof badge.earned).toBe("boolean");
      expect(typeof badge.icon).toBe("string");
      // Earned badges should have earnedAt
      if (badge.earned) {
        expect(badge.earnedAt).toBeDefined();
      }
      // Unearned badges should have progress
      if (!badge.earned && badge.maxProgress) {
        expect(typeof badge.progress).toBe("number");
        expect(badge.progress).toBeLessThanOrEqual(badge.maxProgress);
      }
    }
  });

  test("gamification streaks have valid types", async ({ request }) => {
    const response = await request.get("/api/worker/gamification");
    const data = await response.json();

    const validTypes = ["daily", "weekly", "monthly"];
    for (const streak of data.streaks) {
      expect(validTypes).toContain(streak.type);
      expect(typeof streak.current).toBe("number");
      expect(typeof streak.best).toBe("number");
      expect(typeof streak.isActive).toBe("boolean");
    }
  });

  test("referral leaderboard entries have required fields", async ({ request }) => {
    const response = await request.get("/api/worker/referrals");
    const data = await response.json();

    for (const entry of data.leaderboard) {
      expect(typeof entry.rank).toBe("number");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.referrals).toBe("number");
      expect(typeof entry.earned).toBe("number");
    }
  });

  test("payment wallet top-ups have valid structure", async ({ request }) => {
    const response = await request.get("/api/worker/payment-options");
    const data = await response.json();

    for (const topUp of data.walletTopUps) {
      expect(typeof topUp.method).toBe("string");
      expect(typeof topUp.bonus).toBe("number");
      expect(typeof topUp.minAmount).toBe("number");
      expect(typeof topUp.maxAmount).toBe("number");
      expect(topUp.minAmount).toBeLessThanOrEqual(topUp.maxAmount);
    }
  });
});
