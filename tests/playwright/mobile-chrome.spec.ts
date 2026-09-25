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
 *  3. **A menu panel that covers the header or fills the screen** — the mobile
 *     menu was the CENTERED modal primitive re-anchored by passing `top-6
 *     translate-y-0` into its className, which removed nothing: the base
 *     `top-1/2` / `-translate-y-1/2` were still there, and the winner was
 *     decided by Tailwind's emitted stylesheet order. Measured on a 375px
 *     phone the panel started 42px INSIDE the sticky header (`z-dialog` 60
 *     outranks `z-header` 40) and, wherever its content met the
 *     `max-h-[calc(100dvh-2rem)]` cap, grew to the full screen height with its
 *     own actions pushed into a scroll. It is now `placement="anchored"`:
 *     below the header (safe area included) and capped above the tab bar.
 *
 *  4. **Sub-16px phone body copy** — the same audit's readability floor. Prose
 *     (≥40 characters of leaf text) must compute at least 16px at phone width;
 *     the denser 12-14px scale is restored from `sm:` up. Compact labels —
 *     chips, durations, attributions — keep the small steps by design.
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

/** Menu button accessible name — `t("common.menu")`, per locale. */
const MENU_LABEL = { en: "Menu", ar: "القائمة" } as const;

/**
 * Two phone shapes. The portrait case never reaches the panel's height cap, so
 * testing only 375x812 would leave the cap itself unguarded; the short viewport
 * (a phone in landscape) is exactly where the panel used to fill the screen.
 */
const MENU_VIEWPORTS = [
  { name: "portrait", width: 375, height: 812 },
  { name: "short", width: 667, height: 375 },
];

type MenuGeometry = {
  found: boolean;
  violations: string[];
  unreachable: string[];
  /** Rows whose icon+label pair is not centered as one unit. */
  misaligned: string[];
  inspected: number;
  scrollable: boolean;
};

/**
 * Measure the OPEN menu panel against the chrome it must not collide with.
 * Returned as data rather than assertions so the negative control below can run
 * the very same measurement against the pre-fix geometry.
 */
async function menuGeometry(page: Page): Promise<MenuGeometry> {
  return page.evaluate(() => {
    const violations: string[] = [];
    const unreachable: string[] = [];
    const panel = document.querySelector('[role="dialog"]') as HTMLElement | null;
    const header = document.querySelector("header");
    const tabbar = document.querySelector('nav[aria-label="Main navigation"]');
    if (!panel || !header || !tabbar) {
      return { found: false, violations: ["panel, header or tab bar missing"], unreachable, misaligned: [], inspected: 0, scrollable: false };
    }

    const vh = window.visualViewport?.height ?? window.innerHeight;
    const p = panel.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    const t = tabbar.getBoundingClientRect();
    const cs = getComputedStyle(panel);

    // 1. Under the header, never inside it — `z-dialog` (60) outranks
    //    `z-header` (40), so an overlap hides the logo and the menu button.
    if (p.top < h.bottom - 1) {
      violations.push(
        `panel top ${Math.round(p.top)} is inside the header (bottom ${Math.round(h.bottom)})`
      );
    }
    // 2. Never reaching the bottom chrome — a menu that fills the screen is the
    //    defect this guard exists for.
    if (p.bottom > t.top + 1) {
      violations.push(
        `panel bottom ${Math.round(p.bottom)} reaches the tab bar (top ${Math.round(t.top)})`
      );
    }
    // 3. And it may not claim more vertical space than it was given.
    if (p.height > vh - p.top + 1) {
      violations.push(
        `panel is ${Math.round(p.height)}px tall from top ${Math.round(p.top)} in a ${Math.round(vh)}px viewport`
      );
    }

    // 4. Whatever it clips must be reachable by scrolling INSIDE the panel.
    const actions = Array.from(panel.querySelectorAll("a, button")).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) as HTMLElement[];
    panel.scrollTop = panel.scrollHeight;
    const scrolled = panel.getBoundingClientRect();
    for (const el of actions) {
      if (el.getBoundingClientRect().top > scrolled.bottom - 1) {
        const label = (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24);
        unreachable.push(`${el.tagName.toLowerCase()} "${label}"`);
      }
    }

    // 5. Icon and label sit centered as ONE unit on every menu row — the menu
    //    used to mix bare-text rows with icon rows, all pinned to the start
    //    edge. Measured against the panel's box (not classes), so RTL and any
    //    future padding changes are handled by geometry, not grep.
    const misaligned: string[] = [];
    for (const el of actions) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // The dialog primitive's own Close button is absolutely positioned in
      // the panel corner by design — it is chrome, not a menu row.
      if (getComputedStyle(el).position === "absolute") continue;
      const hasIcon = el.querySelector("svg") !== null;
      if (!hasIcon) {
        misaligned.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 20)}" has no icon`);
        continue;
      }
      const rowCenter = (r.left + r.right) / 2;
      // The label is a text node, not an element — measure the icon+label pair
      // with a Range spanning the icon through the row's last child.
      const range = document.createRange();
      range.setStartBefore(el.querySelector("svg")!);
      range.setEnd(el, el.childNodes.length);
      const content = range.getBoundingClientRect();
      const contentCenter = (content.left + content.right) / 2;
      if (Math.abs(rowCenter - contentCenter) > 2) {
        misaligned.push(
          `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 20)}" content center ${Math.round(contentCenter)} vs row center ${Math.round(rowCenter)}`
        );
      }
    }

    return {
      found: true,
      violations,
      unreachable,
      misaligned,
      inspected: actions.length,
      scrollable: cs.overflowY === "auto" || cs.overflowY === "scroll",
    };
  });
}

for (const locale of ["en", "ar"] as const) {
  test.describe(`mobile menu panel — ${locale}`, () => {
    test.use({
      extraHTTPHeaders: { "accept-language": locale === "ar" ? "ar" : "en" },
    });

    for (const vp of MENU_VIEWPORTS) {
      test(`${vp.name} ${vp.width}x${vp.height}: hangs under the header, never fills the screen`, async ({
        context,
        page,
      }) => {
        // Signed in: the menu renders its tallest shape (account + logout rows).
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
          {
            name: "wa_session",
            value: encodeURIComponent(JSON.stringify(SESSION)),
            domain: "localhost",
            path: "/",
          },
        ]);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.getByRole("button", { name: MENU_LABEL[locale] }).click();
        await page.locator('[role="dialog"]').waitFor({ state: "visible" });
        await page.waitForTimeout(300); // let the open transition settle

        const g = await menuGeometry(page);
        expect(g.found, "menu panel, header and tab bar must all be present").toBe(true);
        expect(
          g.violations,
          `menu panel collides with mobile chrome (${locale} ${vp.name}): ${g.violations.join(" | ")}`
        ).toHaveLength(0);
        expect(
          g.unreachable,
          `menu actions below the panel after scrolling to the end (${locale} ${vp.name}): ${g.unreachable.join(" | ")}`
        ).toHaveLength(0);
        expect(
          g.inspected,
          "the panel exposed no interactive element — the check would be vacuous"
        ).toBeGreaterThan(0);
        expect(
          g.misaligned,
          `menu rows not centered as icon+label units (${locale} ${vp.name}): ${g.misaligned.join(" | ")}`
        ).toHaveLength(0);
      });
    }

    test("negative control: the pre-fix anchor must be reported", async ({ context, page }) => {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
      ]);
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.getByRole("button", { name: MENU_LABEL[locale] }).click();
      await page.locator('[role="dialog"]').waitFor({ state: "visible" });

      // Put back what the panel used to be: the centred primitive pinned with a
      // bare `top-6` and a cap measured from the screen rather than from the
      // header. If this does NOT trip the guard, the guard proves nothing.
      await page.addStyleTag({
        content:
          '[role="dialog"] { top: 24px !important; max-height: calc(100dvh - 2rem) !important; }',
      });
      await page.waitForTimeout(100);

      const g = await menuGeometry(page);
      expect(g.found).toBe(true);
      expect(
        g.violations.length,
        "restoring the old top-6 anchor must be reported as a header collision"
      ).toBeGreaterThan(0);
    });
  });
}

/** Routes the mobile audit swept for sub-16px prose. */
const READING_ROUTES = ["/", "/search", "/workers/khaled-al-harbi-plumbing"];

/** Phone reading floor (audit guideline #67: 16px body text on mobile). */
const MIN_BODY_PX = 16;

/**
 * Characters before text counts as PROSE rather than a compact label. A chip, a
 * price, a duration or an attribution ("Facility Manager · Badaro, Beirut") may
 * keep the design's small steps; a sentence may not.
 */
const PROSE_CHARS = 40;

for (const locale of ["en", "ar"] as const) {
  test.describe(`phone reading floor — ${locale}`, () => {
    test.use({
      viewport: { width: 390, height: 844 },
      extraHTTPHeaders: { "accept-language": locale === "ar" ? "ar" : "en" },
    });

    for (const route of READING_ROUTES) {
      test(`${route}: prose is at least ${MIN_BODY_PX}px`, async ({ context, page }) => {
        await context.addCookies([
          { name: LOCALE_COOKIE, value: locale, domain: "localhost", path: "/" },
        ]);
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

        const offenders = await page.evaluate(
          (limits) => {
            const bad: string[] = [];
            const leaves = document.querySelectorAll("p, li, blockquote, span, div");
            for (const node of Array.from(leaves)) {
              const el = node as HTMLElement;
              if (el.children.length > 0) continue; // leaf text only
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue; // not rendered
              const text = (el.textContent ?? "").trim();
              if (text.length < limits.prose) continue;
              const size = Number.parseFloat(getComputedStyle(el).fontSize);
              if (size < limits.min) bad.push(`${size}px "${text.slice(0, 40)}"`);
            }
            return bad;
          },
          { min: MIN_BODY_PX, prose: PROSE_CHARS }
        );

        expect(
          offenders,
          `${offenders.length} prose element(s) under ${MIN_BODY_PX}px on ${route} (${locale}):\n  ${offenders.join("\n  ")}`
        ).toHaveLength(0);
      });
    }
  });
}
