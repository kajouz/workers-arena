/**
 * 360px horizontal-overflow regression sweep (Galaxy Note 9 class).
 *
 * A Note 9's CSS viewport is 360px — narrower than the iPhone SE (375px) the
 * device-matrix spec covers — and the hero search bar + headline used to clip
 * past its right edge (the input's intrinsic min-width inflated the hero grid
 * track; see commit "Fix mobile layout at 320-360px"). This spec pins that
 * class of bug: every major public page, in BOTH locales (Arabic strings are
 * wider in different places than English ones), must fit its viewport with no
 * horizontal document overflow.
 *
 * Layered on the device matrix rather than replacing it: that spec proves the
 * device matrix's 6 profiles; this one adds the 360px width and the per-locale
 * dimension at a swept route set.
 *
 * Tolerance: +1px sub-pixel rendering slack (fractional widths at DPR
 * boundaries) — the device-matrix overflow check uses the same allowance.
 * Fixed-position overlays (ads, banners, tab bar) are exempt from culprit
 * listing but their CONTENT is still bounded: the document cannot scroll
 * horizontally even if they overhang, which is the user-visible defect.
 */

import { test, expect, type Page } from "@playwright/test";

/** The Note 9's exact CSS viewport width — the regression target. */
const NOTE9_WIDTH = 360;

/** Locale cookie consumed by src/lib/i18n/server.ts (getLocale). */
const LOCALE_COOKIE = "wa_locale";

const ROUTES = [
  { path: "/", name: "Homepage" },
  { path: "/search", name: "Search" },
  { path: "/search?category=plumbing", name: "Search (category filter)" },
  { path: "/categories", name: "Categories" },
  { path: "/workers/khaled-al-harbi-plumbing", name: "Worker profile" },
  { path: "/auth/login", name: "Login" },
  { path: "/bookings", name: "Bookings (signed-out shell)" },
  { path: "/favorites", name: "Favorites (signed-out shell)" },
  { path: "/about", name: "About" },
  { path: "/privacy", name: "Privacy" },
  { path: "/faq", name: "FAQ" },
  { path: "/referral", name: "Referral" },
];

async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const clientW = document.documentElement.clientWidth;
    const scrollW = document.scrollingElement?.scrollWidth ?? document.body.scrollWidth;
    // Name the widest non-fixed offenders so a failure is actionable without
    // re-running locally with the debugger open.
    const culprits = [...document.querySelectorAll("body *")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ el, r }) => r.right > clientW + 1 && r.width > 0 && getComputedStyle(el).position !== "fixed")
      .sort((a, b) => b.r.right - a.r.right)
      .slice(0, 4)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ").slice(0, 3).join(".")} → right=${Math.round(r.right)}`);
    return { clientW, scrollW, culprits, dir: document.documentElement.dir };
  });
}

for (const locale of ["en", "ar"] as const) {
  test.describe(`360px overflow sweep — ${locale}`, () => {
    test.use({
      viewport: { width: NOTE9_WIDTH, height: 760 },
      // The i18n layer reads wa_locale (cookie) before Accept-Language, so the
      // cookie below pins the rendering locale; the header is the backstop.
      extraHTTPHeaders: { "accept-language": locale === "ar" ? "ar" : "en" },
    });

    for (const { path, name } of ROUTES) {
      test(`${name} (${path}) fits ${NOTE9_WIDTH}px`, async ({ context, page }) => {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ]);

        await page.goto(path, { waitUntil: "domcontentloaded" });
        // Settle hydration: client-only bars/ads mount after DCL and could
        // otherwise grow the document after the measurement. Network-idle
        // (not a fixed sleep): on a cold dev compile DCL can land tens of
        // seconds before the page is actually done, and a fixed 1.5s sleep
        // both races that and burned the whole test timeout waiting.
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {
          // networkidle never settles on pages with polling (notifications,
          // ads) — the measurement below is still valid after the timeout.
        });

        const { clientW, scrollW, culprits, dir } = await measureOverflow(page);
        expect(
          scrollW,
          `${name} overflows horizontally at ${NOTE9_WIDTH}px [${locale}/${dir}]: scrollWidth=${scrollW} > clientWidth=${clientW}. Widest elements: ${culprits.join(" | ") || "(none captured — check fixed overlays)"}`
        ).toBeLessThanOrEqual(clientW + 1);
      });
    }
  });
}
