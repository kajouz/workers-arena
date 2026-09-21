import { test, expect } from "@playwright/test";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LANGUAGE LIVES IN THE URL
 * ────────────────────────────────────────────────────────────────────────────
 * The existing specs navigate to unprefixed paths and keep passing, because
 * the proxy redirects them — which is exactly why they cannot catch a
 * regression here. This spec drives the contract directly:
 *
 *   • a prefix-less URL lands in a language, permanently (301)
 *   • a /ar/… URL renders Arabic RTL, and /en/… renders English LTR
 *   • switching language keeps you on the same page, and changes the URL
 *   • an Arabic deep link survives being shared — which is the thing that was
 *     impossible when both languages lived behind one cookie-keyed URL
 * ────────────────────────────────────────────────────────────────────────────
 */

test.describe("locale routing", () => {
  test("a prefix-less URL redirects into a language and keeps the query", async ({ page }) => {
    const response = await page.goto("/search?q=plumber");
    expect(new URL(page.url()).pathname).toBe("/en/search");
    expect(new URL(page.url()).searchParams.get("q")).toBe("plumber");
    // The redirect chain must be permanent so the old URLs pass their ranking
    // on rather than being treated as a temporary detour.
    const chain = response?.request().redirectedFrom();
    if (chain) expect((await chain.response())?.status()).toBe(301);
  });

  test("Accept-Language decides the landing language for a first visit", async ({ browser }) => {
    const context = await browser.newContext({ locale: "ar-LB" });
    const page = await context.newPage();
    await page.goto("/search");
    expect(new URL(page.url()).pathname).toBe("/ar/search");
    await context.close();
  });

  test("/ar renders Arabic RTL and /en renders English LTR", async ({ page }) => {
    await page.goto("/ar");
    expect(await page.locator("html").getAttribute("lang")).toBe("ar");
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");

    await page.goto("/en");
    expect(await page.locator("html").getAttribute("lang")).toBe("en");
    expect(await page.locator("html").getAttribute("dir")).toBe("ltr");
  });

  test("an Arabic deep link renders Arabic directly, with no cookie in play", async ({ browser }) => {
    // A fresh context: no wa_locale anywhere. Before the move, this URL did not
    // exist and the page would have rendered in whatever language the visitor's
    // own cookie said — so a shared Arabic link showed English to most people.
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/ar/workers/khaled-al-harbi-plumbing");
    expect(new URL(page.url()).pathname).toBe("/ar/workers/khaled-al-harbi-plumbing");
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
    await context.close();
  });

  test("every page advertises both languages to crawlers", async ({ page }) => {
    for (const path of ["/en/search", "/ar/search", "/en/workers/khaled-al-harbi-plumbing"]) {
      await page.goto(path);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
      expect(canonical, `${path} must canonicalize to itself, not to the locale root`).toContain(
        path
      );
      for (const lang of ["en", "ar", "x-default"]) {
        await expect(
          page.locator(`link[rel="alternate"][hreflang="${lang}"]`),
          `${path} is missing hreflang=${lang}`
        ).toHaveCount(1);
      }
    }
  });

  test("switching language keeps the reader on the same page", async ({ page }) => {
    await page.goto("/en/search?q=plumber");

    // The switcher is a dropdown in the header.
    await page.getByRole("button", { name: /switch|language|اللغة/i }).first().click();
    await page.getByRole("menuitem", { name: /العربية/ }).click();

    await page.waitForURL(/\/ar\/search/);
    expect(new URL(page.url()).searchParams.get("q"), "the query survives the switch").toBe(
      "plumber"
    );
    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");
  });

  test("the language choice is remembered for a later prefix-less visit", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/en/search");
    await page.getByRole("button", { name: /switch|language|اللغة/i }).first().click();
    await page.getByRole("menuitem", { name: /العربية/ }).click();
    await page.waitForURL(/\/ar\/search/);

    // A bare bookmark later should land in the language they picked.
    await page.goto("/categories");
    expect(new URL(page.url()).pathname).toBe("/ar/categories");
    await context.close();
  });

  test("robots and sitemap keep their single canonical URL", async ({ request }) => {
    // A crawler asks for /robots.txt, never /en/robots.txt — these must not be
    // swept into the locale redirect.
    for (const path of ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} must not redirect`).toBe(200);
    }
  });

  test("the sitemap lists both languages and cross-links them", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("<loc>");
    expect(xml).toMatch(/\/en\/workers\//);
    expect(xml).toMatch(/\/ar\/workers\//);
    expect(xml).toContain('hreflang="ar"');
    expect(xml).toContain('hreflang="x-default"');
  });
});
