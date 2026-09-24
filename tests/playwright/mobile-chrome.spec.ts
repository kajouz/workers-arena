/**
 * ────────────────────────────────────────────────────────────────────────────
 * MOBILE CHROME REGRESSION GUARD (375px, both locales)
 * ────────────────────────────────────────────────────────────────────────────
 * The mobile UX audit's closing recommendation: *"Playwright at 375px in both
 * locales: fail when two fixed elements overlap, and assert the current tab is
 * highlighted."* This encodes exactly that, so the two defect classes it caught
 * can never quietly return:
 *
 *  1. **Overlapping fixed chrome** — the WhatsApp FAB (`bottom-6 z-dialog`),
 *     Help (`bottom-24 z-prompt`) and toasts all landed ON the bottom tab bar
 *     and over open dialogs. Every floating layer now positions from
 *     `--bottom-chrome` and sits at `z-fab`, so no fixed element may overlap
 *     the tab bar or another floating button.
 *
 *  2. **Unhighlighted active tab** — the bar compared `usePathname()`'s
 *     locale-prefixed path (`/en/search`) against bare routes, so `aria-current`
 *     was `null` on EVERY tab. Exactly one tab must carry `aria-current="page"`
 *     on each route, and it must be the RIGHT one (a public `/workers/*`
 *     profile must NOT light up "Dashboard").
 *
 * `document.elementFromPoint` hit-tests the ACTUAL stacking order, so a
 * high-z floating button covering the tab bar fails even when the rects are
 * only partially overlapped and z-index has already "fixed" nothing.
 */

import { test, expect, type Page } from "@playwright/test";

/** iPhone SE / common Android width — the audit's measured viewport. */
const WIDTH = 375;
const HEIGHT = 812;

/** Locale cookie consumed by the i18n layer (see mobile-overflow.spec.ts). */
const LOCALE_COOKIE = "wa_locale";

/**
 * A demo worker session (same contract as session-header.spec.ts) — /dashboard
 * redirects a signed-out visitor to /auth/login, which would race the tab
 * assertions mid-evaluate. The dev/prod server accepts the unsigned demo cookie
 * under the test opt-in (ALLOW_UNSIGNED_DEMO_COOKIE, see playwright.config.ts).
 */
const SESSION = {
  id: "u-worker",
  name: "Khaled Al-Harbi",
  email: "khaled@plumbfix.lb",
  role: "worker",
  hue: 25,
};

/** Tab labels per locale — the bar renders the active locale's strings. */
const LABELS = {
  en: {
    home: "Home",
    find: "Find workers",
    bookings: "My bookings",
    favorites: "Favorites",
    dashboard: "Dashboard",
  },
  ar: {
    home: "الرئيسية",
    find: "ابحث عن عامل",
    bookings: "حجوزاتي",
    favorites: "المفضلة",
    dashboard: "لوحتي",
  },
} as const;

/** Each route and the tab that MUST be highlighted there (keyed per locale). */
const ROUTES: {
  path: string;
  name: string;
  activeTab: keyof (typeof LABELS)["en"] | null;
}[] = [
  { path: "/", name: "Homepage", activeTab: "home" },
  { path: "/search", name: "Search", activeTab: "find" },
  { path: "/bookings", name: "Bookings", activeTab: "bookings" },
  { path: "/favorites", name: "Favorites", activeTab: "favorites" },
  { path: "/dashboard", name: "Dashboard", activeTab: "dashboard" },
  { path: "/workers/khaled-al-harbi-plumbing", name: "Worker profile", activeTab: null },
  { path: "/auth/login", name: "Login (bar must be hidden)", activeTab: null },
];

/**
 * Hit-test the bottom band of the viewport: at every point along the tab bar's
 * horizontal centre line, what element actually receives the tap? Returns the
 * set of distinct non-tab-bar elements that "win" any point above the bar.
 */
async function occludersOf(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    if (!nav) return { navPresent: false, occluders: [] as string[], offenders: [] as string[] };

    const rect = nav.getBoundingClientRect();
    const describe = (el: Element | null) => {
      if (!el) return "null";
      const cls = (el as HTMLElement).className;
      return `${el.tagName.toLowerCase()}.${String(cls).split(" ").filter(Boolean).slice(0, 3).join(".")}`;
    };

    // Sample a 1px line across the bar's top edge (where a covering FAB would
    // clip it) and across its middle. Anything not inside the nav that wins the
    // hit test is an occluder.
    const occluders = new Set<string>();
    const y = rect.top + 2;
    for (let x = 0; x <= rect.width; x += Math.max(8, Math.floor(rect.width / 24))) {
      const hit = document.elementFromPoint(Math.min(x, rect.width - 1), y);
      if (hit && !nav.contains(hit) && hit !== document.body && hit !== document.documentElement) {
        occluders.add(describe(hit));
      }
    }

    // Also find any visible fixed element whose rect intersects the tab bar.
    const offenders: string[] = [];
    const navRect = nav.getBoundingClientRect();
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      if (nav.contains(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== "fixed" && cs.position !== "sticky") continue;
      if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const overlaps = r.top < navRect.bottom && r.bottom > navRect.top && r.left < navRect.right && r.right > navRect.left;
      // Ignore the full-screen dialog BACKDROP (it intentionally covers the
      // whole viewport when a modal is open) — only its content should not
      // overlap the bar's taps.
      const isBackdrop = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
      if (overlaps && !isBackdrop) offenders.push(describe(el));
    }

    return { navPresent: true, occluders: [...occluders], offenders };
  });
}

async function activeTabState(page: Page) {
  return page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main navigation"]');
    if (!nav) return { navPresent: false, active: [] as string[] };
    const links = Array.from(nav.querySelectorAll("a"));
    const active = links
      .filter((a) => a.getAttribute("aria-current") === "page")
      .map((a) => (a.textContent ?? "").trim());
    return { navPresent: true, active };
  });
}

for (const locale of ["en", "ar"] as const) {
  test.describe(`mobile chrome guard @ ${WIDTH}px — ${locale}`, () => {
    test.use({
      viewport: { width: WIDTH, height: HEIGHT },
      extraHTTPHeaders: { "accept-language": locale === "ar" ? "ar" : "en" },
    });

    for (const { path, name, activeTab } of ROUTES) {
      test(`${name}: tab highlight + no chrome overlap`, async ({ context, page }) => {
        // A signed-in visitor hitting /auth/login gets REDIRECTED to the
        // dashboard — the auth route must be tested signed-out so it actually
        // serves the login card (whose contract is "no tab bar over it").
        const cookies: { name: string; value: string; domain: string; path: string }[] = [
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ];
        if (!path.startsWith("/auth/")) {
          cookies.push({
            name: "wa_session",
            value: encodeURIComponent(JSON.stringify(SESSION)),
            domain: "localhost",
            path: "/",
          });
        }
        await context.addCookies(cookies);
        await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
        // The bar mounts with the page (it is SSR now) — wait for it so a slow
        // first compile can't race the measurement.
        await page
          .waitForSelector('nav[aria-label="Main navigation"]', { timeout: 30_000 })
          .catch(() => { /* auth pages legitimately have no bar */ });
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => { /* polling pages never idle — measurement is still valid */ });

        const { navPresent, active } = await activeTabState(page);

        if (activeTab === null && path.startsWith("/auth/")) {
          // Auth screens yield the viewport entirely — the bar must not render.
          expect(navPresent, `tab bar must be hidden on ${path} (${locale})`).toBe(false);
          return;
        }

        expect(navPresent, `tab bar missing on ${path} (${locale})`).toBe(true);

        // Exactly one active tab, and it is the right one.
        if (activeTab !== null) {
          expect(active, `${path} (${locale}) must highlight exactly one tab`).toHaveLength(1);
          expect(active[0], `${path} (${locale}) highlighted the wrong tab`).toBe(LABELS[locale][activeTab]);
        } else {
          // Public worker profile: NO account tab may light up — the audit
          // caught Dashboard (its match included /workers/*) doing exactly that.
          expect(active, `public profile ${path} (${locale}) must not light an account tab`).toEqual([]);
        }

        // No floating chrome may cover the tab bar's taps or overlap its box.
        const { occluders, offenders } = await occludersOf(page);
        expect(
          occluders,
          `elements steal taps from the tab bar on ${path} (${locale}): ${occluders.join(" | ")}`
        ).toHaveLength(0);
        expect(
          offenders,
          `fixed/sticky elements overlap the tab bar on ${path} (${locale}): ${offenders.join(" | ")}`
        ).toHaveLength(0);
      });
    }

    // The floating WhatsApp FAB / sticky bar must not stack on each other on a
    // worker profile (both fixed to the bottom band).
    test("worker profile: sticky booking bar does not cover the tab bar", async ({ context, page }) => {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        {
          name: "wa_session",
          value: encodeURIComponent(JSON.stringify(SESSION)),
          domain: "localhost",
          path: "/",
        },
      ]);
      await page.goto("/workers/khaled-al-harbi-plumbing", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page
        .waitForSelector('nav[aria-label="Main navigation"]', { timeout: 30_000 })
        .catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

      const stacked = await page.evaluate(() => {
        const nav = document.querySelector('nav[aria-label="Main navigation"]');
        if (!nav) return { navPresent: false, offenders: [] as string[] };
        const navRect = nav.getBoundingClientRect();
        const offenders: string[] = [];
        for (const el of Array.from(document.querySelectorAll("body *"))) {
          if (nav.contains(el)) continue;
          const cs = getComputedStyle(el);
          if (cs.position !== "fixed") continue;
          if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const overlaps = r.top < navRect.bottom && r.bottom > navRect.top && r.left < navRect.right && r.right > navRect.left;
          const isBackdrop = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9;
          if (overlaps && !isBackdrop) {
            offenders.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(" ").slice(0, 3).join(".")}`);
          }
        }
        return { navPresent: true, offenders };
      });

      expect(stacked.navPresent, "tab bar must render on the worker profile").toBe(true);
      expect(
        stacked.offenders,
        `fixed elements overlap the tab bar on the profile (${locale}): ${stacked.offenders.join(" | ")}`
      ).toHaveLength(0);
    });
  });
}
