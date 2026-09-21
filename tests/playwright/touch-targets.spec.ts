import { test, expect, devices } from "@playwright/test";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * TOUCH TARGETS, MEASURED
 * ────────────────────────────────────────────────────────────────────────────
 * The previous rule looked like it enforced WCAG 2.5.5 and did not:
 *
 *   a, button, [role="button"], input[type=checkbox], input[type=radio],
 *   label, select { min-height: 44px; }
 *   .badge-icon, .text-xs { min-height: auto; }
 *
 * `min-height` does nothing to a non-replaced inline element, so the inline
 * links it appeared to cover were never affected. The exemption was keyed on
 * `.text-xs` — the class `Button size="sm"` sets — so it excused exactly the
 * small buttons it existed to grow, while still inflating `size="default"`
 * from its declared 40px. And it applied on desktop, where a mouse does not
 * need a 44px target.
 *
 * Nothing caught any of that, because nothing measured. This does: it drives a
 * real touch device and reads the rendered boxes.
 * ────────────────────────────────────────────────────────────────────────────
 */

test.use({ ...devices["Pixel 7"] });

/** WCAG 2.5.5 (AAA) and the Apple/Android platform guidance both land here. */
const MIN = 44;

/**
 * Controls a finger actually has to hit. Plain CSS — `:visible` is a Playwright
 * locator pseudo-class and is not valid inside querySelectorAll; the zero-box
 * filter below is what excludes anything not rendered.
 */
const CONTROL_SELECTOR = ['button', '[role="button"]', '[role="tab"]', '[role="switch"]', "select"].join(", ");

test.describe("touch targets on a phone", () => {
  for (const path of ["/en", "/en/search", "/en/workers/khaled-al-harbi-plumbing"]) {
    test(`every visible control on ${path} clears ${MIN}px`, async ({ page }) => {
      await page.goto(path, { waitUntil: "load" });

      const undersized = await page.evaluate(
        ({ selector, min }) => {
          const bad: string[] = [];
          for (const el of document.querySelectorAll(selector)) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue; // not rendered
            if (r.height < min - 0.5) {
              const label =
                el.getAttribute("aria-label") ??
                el.textContent?.trim().slice(0, 30) ??
                el.tagName;
              bad.push(`${el.tagName.toLowerCase()} "${label}" — ${r.height.toFixed(1)}px`);
            }
          }
          return bad;
        },
        { selector: CONTROL_SELECTOR, min: MIN }
      );

      expect(
        undersized,
        `These are below the ${MIN}px touch minimum on a phone:\n  ${undersized.join("\n  ")}`
      ).toEqual([]);
    });
  }

  test('a small button grows on touch — the case the old ".text-xs" exemption excused', async ({
    page,
  }) => {
    await page.goto("/en/search", { waitUntil: "load" });

    // `Button size="sm"` renders `h-8 text-xs` — 32px on a mouse, and the exact
    // shape the old exemption let through. Measure the RENDERED ones: the page
    // also holds small buttons inside closed dialogs, whose box is zero.
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll("button.text-xs")]
        .map((b) => b.getBoundingClientRect().height)
        .filter((h) => h > 0)
    );
    if (heights.length === 0) test.skip(true, "no size=sm button rendered on this page");
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(MIN - 0.5);
  });
});

test.describe("desktop is left dense", () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

  test("a fine pointer keeps the component's own compact sizes", async ({ page }) => {
    await page.goto("/en/search", { waitUntil: "load" });
    // size="default" declares h-10. The old global rule silently overrode it to
    // 44px everywhere, so the component's size scale did not mean what it said.
    const heights = await page.evaluate(() =>
      [...document.querySelectorAll("button")]
        .map((b) => b.getBoundingClientRect().height)
        .filter((h) => h > 0)
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(
      Math.min(...heights),
      "a mouse does not need a 44px floor — dense UI should stay dense"
    ).toBeLessThan(MIN);
  });
});
