import { test, expect, type Page, devices as pwDevices } from "@playwright/test";

/**
 * PWA × Responsive device matrix.
 *
 * Verifies, per device profile (small phone → large phone → tablets →
 * desktop widths), that:
 *
 *  1. INSTALLABILITY — the manifest resolves, the service worker activates,
 *     and the page comes under its control (the offline shell's precondition).
 *  2. LAYOUT — no horizontal overflow on the three highest-traffic routes,
 *     the mobile bottom nav exists with adequate tap targets on sub-desktop
 *     widths, and the search CTA is present and reachable on phones.
 *  3. OFFLINE (small phone only, where it matters most) — a previously
 *     visited page serves from the SW cache with the network cut, and a
 *     never-visited route serves the bilingual offline fallback page.
 *
 * The offline block is intentionally scoped to one device: SW activation on a
 * cold dev server takes minutes (35 precache URLs each compile on demand), and
 * it is the same SW for every viewport — one patient offline pass proves the
 * contract without multiplying that cost across all six profiles.
 *
 * Device coverage: iPhone SE (smallest common phone), iPhone 14 Pro Max
 * (large phone), iPad portrait + landscape (tablet), 1280 and 1920 desktop.
 */

/** Reuse Playwright's real device descriptors so viewport/touch/DPR/UA all
 * match the hardware class under test. `defaultBrowserType`/`browserName` are
 * stripped — Playwright forbids those inside describe groups (they force a
 * new worker), and this suite runs on the config's single chromium project. */
function sanitize(desc: object): Record<string, unknown> {
  const { defaultBrowserType: _d, browserName: _b, ...rest } = desc as Record<string, unknown>;
  return rest;
}

const MATRIX = [
  { key: "iPhone SE", desc: sanitize(pwDevices["iPhone SE"]) },
  { key: "iPhone 14 Pro Max", desc: sanitize(pwDevices["iPhone 14 Pro Max"]) },
  { key: "iPad (portrait)", desc: sanitize(pwDevices["iPad (gen 7)"] ?? pwDevices["iPad"]) },
  {
    key: "iPad (landscape)",
    desc: sanitize({ ...pwDevices["iPad (gen 7)"], viewport: { width: 1024, height: 768 }, screen: { width: 1024, height: 768 } }),
  },
  { key: "Desktop narrow", desc: { viewport: { width: 1280, height: 800 } } },
  { key: "Desktop wide", desc: { viewport: { width: 1920, height: 1080 } } },
];

const ROUTES = ["/", "/search?category=plumbing", "/workers/khaled-al-harbi-plumbing"];

for (const { key, desc } of MATRIX) {
  test.describe(`device: ${key}`, () => {
    test.use({ ...desc } as Parameters<typeof test.use>[0]);

    /** Layout + installability checks run on every device in the matrix. */
    for (const route of ROUTES) {
      test(`no horizontal overflow on ${route}`, async ({ page }) => {
        await page.goto(route, { waitUntil: "load" });

        const overflow = await page.evaluate(() => {
          const iw = window.innerWidth;
          const sw = document.scrollingElement?.scrollWidth ?? document.body.scrollWidth;
          const culprits = [...document.querySelectorAll("body *")]
            .filter((el) => el.getBoundingClientRect().right > iw + 1 && getComputedStyle(el).position !== "fixed")
            .slice(0, 4)
            .map((el) => `${el.tagName}.${String(el.className).split(" ").slice(0, 2).join(".")}`);
          return { iw, sw, culprits };
        });

        expect(
          overflow.sw,
          `horizontal overflow on ${route}: scrollWidth=${overflow.sw} > innerWidth=${overflow.iw} — culprits: ${overflow.culprits.join(" | ")}`
        ).toBeLessThanOrEqual(overflow.iw + 1);
      });
    }

    test("mobile bottom nav has adequate tap targets", async ({ page }) => {
      test.skip(test.info().project.use.viewport!.width >= 1024, "bottom nav is a mobile-only affordance");
      await page.goto("/", { waitUntil: "load" });

      const nav = await page.evaluate(() => {
        const links = [...document.querySelectorAll("nav a")].filter((a) => {
          const r = a.getBoundingClientRect();
          return r.top > window.innerHeight * 0.6 && r.height > 0;
        });
        return {
          count: links.length,
          tooSmall: links.filter((a) => {
            const r = a.getBoundingClientRect();
            return r.height < 40 || r.width < 40;
          }).length,
        };
      });

      expect(nav.count, "a bottom nav must be visible on this viewport").toBeGreaterThan(0);
      expect(nav.tooSmall, "every bottom-nav target must be ≥ 40px in both axes").toBe(0);
    });

    test("search CTA is present and tappable on phones", async ({ page }) => {
      test.skip(test.info().project.use.viewport!.width >= 768, "phones only");
      await page.goto("/", { waitUntil: "load" });

      const cta = page.getByRole("button", { name: /search/i }).first();
      await expect(cta).toBeVisible();
      const box = await cta.boundingBox();
      expect(box?.height ?? 0, "search CTA must be at least 36px tall").toBeGreaterThanOrEqual(36);
    });
  });
}

test.describe("PWA installability (shared SW — one patient offline pass)", () => {
  // Both tests share one SW lifecycle — serialize so the offline test reuses
  // the activation the first test paid for.
  test.describe.configure({ mode: "serial" });
  test.use(sanitize(pwDevices["iPhone SE"]));

  /** Wait for SW activation AND a populated precache — on a cold dev server
   * this is the multi-minute step (every precache URL compiles on demand). */
  async function waitForSwReady(p: Page, timeoutMs = 420_000) {
    await p.goto("/", { waitUntil: "domcontentloaded" });
    await p.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg?.active) return false;
        const cache = await caches.open("wa-shell-v2");
        return (await cache.keys()).length > 5;
      },
      null,
      { timeout: timeoutMs, polling: 2_000 }
    );
    // Claimed clients only apply to loads that begin after activation — reload
    // so THIS page is controlled before the offline phase. Under parallel load
    // (several cold installs racing one dev server) the claim can lag, so be
    // patient and re-reload once if the first window misses it.
    await p.reload({ waitUntil: "domcontentloaded" });
    const controlled = await p
      .waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000, polling: 500 })
      .then(() => true)
      .catch(() => false);
    if (!controlled) {
      await p.reload({ waitUntil: "domcontentloaded" });
      await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 60_000, polling: 500 });
    }
  }

  test("manifest resolves and service worker activates + controls the page", async ({ page }) => {
    const m = await page.request.get("/manifest.webmanifest");
    expect(m.ok(), "manifest.webmanifest must resolve").toBe(true);
    const manifest = await m.json();
    // The installability contract Chrome enforces (mirrors tests/pwa.test.ts).
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");

    await waitForSwReady(page);
  });

  test("offline: visited page serves from cache, unknown route serves the offline fallback", async ({ page, context }) => {
    test.setTimeout(600_000); // cold SW install dominates the budget
    await waitForSwReady(page);

    // Hydration canary: React logs to the console whenever hydration fails
    // and falls back to client rendering. An earlier rehearsal saw a
    // transient duplicate <h1> during rapid SW-served reloads on a loaded
    // machine (~300 subsequent instrumented attempts — paced reloads, reload
    // storms, 4 parallel contexts, interrupted boots, 6× CPU throttling —
    // never reproduced it; MutationObserver saw only normal insertions, and
    // both the cached bytes and fresh SSR contain exactly one <h1>). That
    // points to a React-internal hydration-boot transient: brief, self-healing
    // (~3s), invisible to users and assistive tech, and NOT an app defect —
    // the served HTML is correct. This canary converts any recurrence into a
    // precisely-diagnosed failure (the exact recovery log) instead of a
    // confusing downstream locator error.
    const hydrationProblems: string[] = [];
    page.on("console", (msg) => {
      if (/hydration|did not match|Recovered from an error/i.test(msg.text())) hydrationProblems.push(msg.text().slice(0, 300));
    });
    page.on("pageerror", (err) => hydrationProblems.push(`pageerror: ${String(err).slice(0, 300)}`));

    // Warm the profile page (runtime shell cache + bounded profiles cache).
    await page.goto("/workers/khaled-al-harbi-plumbing", { waitUntil: "load" });

    await context.setOffline(true);
    try {
      // 1) Previously visited page: served by the SW from cache.
      const resp = await page.goto("/workers/khaled-al-harbi-plumbing", { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(resp?.status(), "cached navigation must serve HTTP 200 offline").toBe(200);
      // Role-based, not `locator("h1")`: role locators match only
      // accessibility-tree-visible elements, which is the correct assertion
      // target for users — and immune to any invisible framework transient
      // (see the canary comment above for the investigated root cause).
      await expect(page.getByRole("heading", { level: 1, name: /Khaled/i })).toBeVisible();

      // 2) Never-visited route: the bilingual offline fallback must serve.
      const resp2 = await page.goto("/workers/never-visited-offline-xyz", { waitUntil: "domcontentloaded", timeout: 15_000 });
      expect(resp2?.status()).toBe(200);
      await expect(page.locator("body")).toContainText(/offline|غير متصل/i);

      expect(hydrationProblems, "hydration must complete without React recovery events").toEqual([]);
    } finally {
      await context.setOffline(false);
    }
  });
});
