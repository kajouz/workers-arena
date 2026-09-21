import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * DARK MODE, ON THE SURFACE THAT NEVER HAD IT
 * ────────────────────────────────────────────────────────────────────────────
 * Dark mode is a headline feature and 73 components did not implement it. The
 * entire admin console, plus a third of the worker dashboard, was written with
 * raw Tailwind grays and no `dark:` variants at all — so flipping the theme
 * left near-black text (`text-gray-900`) on a near-black page. Not degraded:
 * unreadable.
 *
 * Nothing caught it because the accessibility suite only ever audited five
 * public pages, in light mode, signed out. These tests audit the admin surface
 * in dark mode, signed in as an admin, which is the combination that was
 * broken.
 *
 * axe's colour-contrast rule is the check that matters here: it computes the
 * real composited foreground against the real background, so a token that
 * failed to flip shows up as a contrast violation rather than needing a
 * screenshot to notice.
 * ────────────────────────────────────────────────────────────────────────────
 */

const ADMIN_SESSION = {
  id: "u-admin",
  name: "Platform Admin",
  email: "admin@workersarena.com",
  role: "admin",
  hue: 280,
};

/** The screens that were written without a single dark: variant. */
const ADMIN_PAGES = [
  { path: "/en/admin/settings", name: "Platform settings" },
  { path: "/en/admin/logs", name: "System logs" },
  { path: "/en/admin/webhooks", name: "Webhooks" },
  { path: "/en/admin/support", name: "Support tickets" },
  { path: "/en/admin/backups", name: "Backups" },
  { path: "/en/admin/cms", name: "Content management" },
];

async function signInAsAdmin(page: Page) {
  await page.context().addCookies([
    {
      name: "wa_session",
      value: encodeURIComponent(JSON.stringify(ADMIN_SESSION)),
      url: new URL(page.url()).origin,
    },
    // The theme bootstrap reads this before first paint.
    { name: "wa_theme", value: "dark", url: new URL(page.url()).origin },
  ]);
}

/**
 * Stop every animation and transition before sampling colours.
 *
 * axe reads COMPUTED colours. An element part-way through a fade or a theme
 * transition reports its intermediate value, so the audit failed on whichever
 * page happened to be mid-animation — a different one on each run, and never
 * when run alone. Waiting for animations to finish is not enough either:
 * entrance animations start on elements that mount after the wait.
 *
 * Freezing them measures the state a reader actually ends up looking at.
 */
async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation: none !important;
      transition: none !important;
    }`,
  });
  // One frame for the freeze to take effect.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

function audit(page: Page) {
  return new AxeBuilder({ page: page as unknown as AxePage })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("script[src*='_vercel']");
}

test.describe("the admin console in dark mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en");
    await signInAsAdmin(page);
  });

  for (const { path, name } of ADMIN_PAGES) {
    test(`${name} renders dark, with readable contrast`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });

      // The theme actually applied — otherwise the contrast check below would
      // pass by auditing the light theme.
      await expect(page.locator("html")).toHaveClass(/dark/);

      await freezeMotion(page);

      const results = await audit(page).analyze();
      const contrast = results.violations.filter((v) => v.id === "color-contrast");
      // The offending MARKUP, not just a selector: the fix is always "this
      // class list has a dark foreground and a light background", and the
      // class list is what says so.
      const details = contrast.flatMap((v) =>
        v.nodes.slice(0, 5).map((n) => `    ${n.html.slice(0, 200)}`)
      );
      expect(
        contrast,
        `${name} has unreadable text in dark mode — the marker of a component ` +
          `still using raw grays with no dark: partner:\n${details.join("\n")}`
      ).toEqual([]);
    });
  }

  test("the page background is actually dark, not a white panel", async ({ page }) => {
    await page.goto("/en/admin/settings", { waitUntil: "load" });
    // A card that kept `bg-white` with no partner is the other half of the bug:
    // dark text tokens flip correctly and then sit on a white surface.
    const lightSurfaces = await page.evaluate(() => {
      const isLight = (rgb: string) => {
        const m = /rgba?\((\d+), (\d+), (\d+)/.exec(rgb);
        if (!m) return false;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        return (r * 299 + g * 587 + b * 114) / 1000 > 200;
      };
      const bad: string[] = [];
      for (const el of document.querySelectorAll("div, section, main, aside, header")) {
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 60) continue; // only real surfaces
        const bg = getComputedStyle(el).backgroundColor;
        if (isLight(bg)) bad.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 60)}`);
      }
      return bad.slice(0, 8);
    });
    expect(
      lightSurfaces,
      `These large surfaces are still light while the theme is dark:\n  ${lightSurfaces.join("\n  ")}`
    ).toEqual([]);
  });
});
