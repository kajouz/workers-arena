import { test, expect } from "@playwright/test";

/**
 * Install affordances in a browser that never fires `beforeinstallprompt`.
 *
 * Desktop Chromium — the only browser CI runs — never fires the event, so
 * this suite reproduces exactly the environment where the install UI used to
 * be invisible: the header button rendered only while `canInstall` was true,
 * the landing promo section returned null for desktop user agents, and the
 * "Get the app" CTA link pointed at the pricing section. These tests pin the
 * three fixes:
 *
 *   1. header  — an install button ALWAYS exists; without the native prompt
 *                it opens a help dialog with manual steps.
 *   2. dialog  — the steps shown match the detected platform (negative
 *                control: iOS steps must not leak into a desktop dialog).
 *   3. landing — the `#app` section renders (with desktop steps), and the
 *                CTA "Get the app" link scrolls to it — not to `#plans`.
 *
 * Like offline-flow, this assumes headless Chromium never fires
 * `beforeinstallprompt`; if a browser project that fires it is added later,
 * tests 1–2 must branch on which button the header rendered.
 */

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

test.describe("install affordances without beforeinstallprompt", () => {
  test.use({ viewport: MOBILE });

  test("header install button opens the manual-steps help dialog", async ({ page }) => {
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    // The install button is server-rendered, but its onClick is not live until
    // React hydrates — clicking too early silently does nothing.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    // The header must ALWAYS offer an install entry point — native prompt or
    // help. In this browser only the help path can exist.
    const installButton = page
      .locator("header")
      .first()
      .getByRole("button", { name: "Install app" })
      .first();
    await expect(installButton).toBeVisible();

    await installButton.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Install WorkersArena")).toBeVisible();
    // Desktop Chromium → the address-bar steps, numbered.
    await expect(dialog.getByText(/address bar/i)).toBeVisible();
  });

  test("help dialog shows desktop steps, not another platform's (negative control)", async ({ page }) => {
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    // The install button is server-rendered, but its onClick is not live until
    // React hydrates — clicking too early silently does nothing.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    await page
      .locator("header")
      .first()
      .getByRole("button", { name: "Install app" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Exactly the two desktop steps — if platform detection ever breaks and
    // reports ios/android on a desktop UA, the wrong step text appears here.
    const steps = dialog.getByRole("listitem");
    await expect(steps).toHaveCount(2);
    await expect(dialog.getByText(/Share button/i)).toHaveCount(0); // iOS-only text
    await expect(dialog.getByText(/⋮ menu/i)).toHaveCount(0); // Android-only text
  });

  test("landing #app section renders with install steps (en + ar)", async ({ page }) => {
    for (const locale of ["en", "ar"]) {
      await page.goto(`/${locale}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const section = page.locator("#app");
      await section.scrollIntoViewIfNeeded();
      await expect(section).toBeVisible();

      const steps = section.getByRole("listitem");
      expect(await steps.count()).toBeGreaterThanOrEqual(2);

      if (locale === "en") {
        await expect(section.getByText("Take WorkersArena with you")).toBeVisible();
        await expect(section.getByText("Install for Desktop")).toBeVisible();
        await expect(section.getByText(/address bar/i)).toBeVisible();
      }
    }
  });

  test("'Get the app' CTA link scrolls to #app — not to pricing", async ({ page }) => {
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    // The install button is server-rendered, but its onClick is not live until
    // React hydrates — clicking too early silently does nothing.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const link = page.getByRole("link", { name: /Get the app/ });
    await expect(link).toBeVisible();
    // Regression guard: the link used to target #plans (the pricing section).
    await expect(link).toHaveAttribute("href", "#app");

    await link.click();
    await expect(page.locator("#app")).toBeInViewport();
  });

  test("desktop viewport: the header still offers install help", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/en", { waitUntil: "domcontentloaded" });
    // The install button is server-rendered, but its onClick is not live until
    // React hydrates — clicking too early silently does nothing.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    const installButton = page
      .locator("header")
      .first()
      .getByRole("button", { name: "Install app" })
      .first();
    await expect(installButton).toBeVisible();

    await installButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/address bar/i)).toBeVisible();
  });
});
