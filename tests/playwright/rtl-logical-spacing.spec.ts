import { test, expect, type Page } from "@playwright/test";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LOGICAL SPACING ACTUALLY MIRRORS (measured, not grepped)
 * ────────────────────────────────────────────────────────────────────────────
 * `tests/rtl-ratchet.test.ts` bans the *class names* — it proves every
 * `ml-*`/`mr-*`/`pl-*`/`pr-*`/`text-left`/`text-right` was rewritten to a
 * logical utility. That is a source-text invariant, and it is satisfiable by a
 * swap that renders wrong: `ms-2` in the wrong place, a physical `ml-*` hiding
 * in a component's `style`, a `!important` overriding the logical margin, or a
 * future Tailwind/Preset regression that resolves `ms-*` physically. None of
 * those show up in a grep.
 *
 * This spec closes that gap by reading RESOLVED GEOMETRY out of the browser:
 *
 *   • EN (dir=ltr): `ms-N`/`ps-N` must land on the LEFT, `me-N`/`pe-N` RIGHT.
 *   • AR (dir=rtl): the same class must land on the RIGHT (and vice versa) —
 *     `text-start`/`text-end` must follow suit.
 *
 * Run at two widths (the `sm:`-variant winner differs) across three routes that
 * between them carry the bulk of the converted call sites.
 *
 * Deliberate scoping rules — a pass has to MEAN something, and a failure must
 * never be a probe artifact:
 *   1. Only elements whose horizontal spacing comes EXCLUSIVELY from logical
 *      utilities are judged. An element that also carries `px-4`/`mx-auto` has
 *      a cascade-order-dependent winner (Tailwind's layer order, not class
 *      order) this probe does not model, so it is skipped.
 *   1b. Same reason for a `space-x-*` PARENT: that utility injects
 *      `margin-inline-*` on its direct children, which competes with the
 *      child's own `ms-*` for the same property.
 *   2. Competing logical tokens in one element (`ps-1.5 sm:ps-2`) are treated as
 *      a candidate SET for that side — the viewport decides the winner. The
 *      invariant is the SIDE: the opposite side must stay untouched.
 *   3. Chromium reports `text-align` as the *specified* keyword (`end`), not
 *      the resolved physical side, so both forms are accepted.
 *
 * The `inspected > 0` assertion is load-bearing: without it a page that
 * rendered no logical utilities at all would "pass" vacuously. The closing
 * negative control makes the sweep self-validating: asked for LTR geometry on
 * the Arabic page it MUST report violations, so a parser that quietly stopped
 * finding candidates cannot masquerade as a green suite.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Routes between them carrying most of the converted logical call sites. */
const PAGES = ["/search", "/workers/khaled-al-harbi-plumbing", "/"];

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 }, // base (unprefixed) classes win
  { name: "desktop", width: 1280, height: 800 }, // sm:/lg: variants win
];

const LOCALES = [
  { code: "en", dir: "ltr" },
  { code: "ar", dir: "rtl" },
] as const;

type Probe = { inspected: number; bad: string[] };

/** Resolved-geometry sweep of one rendered page. Runs in the browser. */
async function probeLogicalSpacing(page: Page, dir: "ltr" | "rtl"): Promise<Probe> {
  return page.evaluate((expectedDir) => {
    const out = { inspected: 0, bad: [] as string[] };
    const num = (v: string) => Number.parseFloat(v) || 0;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.6;

    // Rule 1: the element's own non-logical horizontal spacing.
    const ambiguous = (cls: string) =>
      cls.split(/\s+/).some((t) => {
        const bare = t.replace(/^[a-z0-9-]+:/, "").replace(/^!/, "");
        return /^(p|px|mx|m)-/.test(bare) || bare === "mx-auto" || bare === "m-auto";
      });

    // Rule 1b: `space-x-*` on the immediate parent injects margins on children.
    const spacedParent = (el: HTMLElement) => {
      const cls = el.parentElement?.getAttribute("class") ?? "";
      return cls.split(/\s+/).some((t) => /^(?:!)?(?:[a-z0-9-]+:)?space-x-/.test(t));
    };

    for (const el of Array.from(document.querySelectorAll<HTMLElement>("[class]"))) {
      const cls = el.getAttribute("class") ?? "";
      const tokens = cls.split(/\s+/);
      const cand = {
        m: { left: [] as number[], right: [] as number[] },
        p: { left: [] as number[], right: [] as number[] },
      };

      for (const t of tokens) {
        const m = /^(?:[a-z0-9-]+:)?(ms|me|ps|pe)-(\d+(?:\.\d+)?)$/.exec(t);
        if (!m) continue;
        const px = Number.parseFloat(m[2]) * 4; // Tailwind spacing scale = 4px
        const isStart = m[1] === "ms" || m[1] === "ps";
        const goesRight = expectedDir === "rtl" ? isStart : !isStart;
        const family = m[1] === "ms" || m[1] === "me" ? cand.m : cand.p;
        family[goesRight ? "right" : "left"].push(px);
      }

      if (!ambiguous(cls) && !spacedParent(el)) {
        const cs = getComputedStyle(el);
        const got = {
          mLeft: num(cs.marginLeft),
          mRight: num(cs.marginRight),
          pLeft: num(cs.paddingLeft),
          pRight: num(cs.paddingRight),
        };
        for (const [family, key] of [
          [cand.m, "m"],
          [cand.p, "p"],
        ] as const) {
          if (family.left.length === 0 && family.right.length === 0) continue;
          out.inspected++;
          const left = key === "m" ? got.mLeft : got.pLeft;
          const right = key === "m" ? got.mRight : got.pRight;
          const okLeft = family.left.length ? family.left.some((px) => near(left, px)) : left === 0;
          const okRight = family.right.length ? family.right.some((px) => near(right, px)) : right === 0;
          if (!okLeft || !okRight) {
            out.bad.push(
              `${expectedDir}: <${el.tagName.toLowerCase()} class="${cls.slice(0, 110)}"> ${key}-side candidates L∈{${family.left.join(",")}} R∈{${family.right.join(",")}} — got L=${left} R=${right}`
            );
          }
        }
      }

      // text-start / text-end must follow the writing direction, unless another
      // alignment utility in the same element competes for the winner.
      const aligns = tokens.filter((t) =>
        /(?:^|:)text-(left|right|center|justify|start|end)$/.test(t)
      );
      if (aligns.length === 1) {
        const t = aligns[0].replace(/^[a-z0-9-]+:/, "");
        if (t === "text-start" || t === "text-end") {
          const rtl = expectedDir === "rtl";
          const want = t === "text-start" ? (rtl ? "right" : "left") : rtl ? "left" : "right";
          const keyword = t === "text-start" ? "start" : "end";
          out.inspected++;
          const gotAlign = getComputedStyle(el).textAlign;
          if (gotAlign !== want && gotAlign !== keyword) {
            out.bad.push(
              `${expectedDir}: <${el.tagName.toLowerCase()} class="${cls.slice(0, 110)}"> .${t} → expected text-align:${want} (or keyword "${keyword}"), got ${gotAlign}`
            );
          }
        }
      }
    }
    return out;
  }, dir);
}

for (const vp of VIEWPORTS) {
  for (const { code, dir } of LOCALES) {
    test.describe(`[${vp.name}] logical spacing in ${code} (dir=${dir})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const path of PAGES) {
        test(`${path} resolves every logical utility to the ${
          dir === "rtl" ? "mirrored" : "physical"
        } side`, async ({ page }) => {
          await page.goto(`/${code}${path}`, { waitUntil: "domcontentloaded" });
          // Settle hydration: client-only bars/ads mount after DCL. networkidle
          // never settles on pages that poll, and the sweep is still valid then.
          await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

          // Anchor the claim to the direction actually rendered — if locale
          // routing regressed to LTR, "mirrors in Arabic" would be a lie the
          // geometry sweep alone could not tell.
          const html = page.locator("html");
          expect(
            await html.getAttribute("dir"),
            `/${code}${path} must render dir=${dir} for this sweep to mean anything`
          ).toBe(dir);
          expect(await html.getAttribute("lang")).toBe(code);

          const { inspected, bad } = await probeLogicalSpacing(page, dir);
          expect(
            bad,
            `${bad.length} logical utility assertion(s) failed on /${code}${path} at ${vp.width}px`
          ).toHaveLength(0);
          expect(
            inspected,
            `no unambiguous logical-utility element on /${code}${path} at ${vp.width}px — the check would be vacuous`
          ).toBeGreaterThan(0);

          console.log(
            `[${vp.name}] /${code}${path} (dir=${dir}): ${inspected} unambiguous logical-spacing check(s), 0 misresolved`
          );
        });
      }
    });
  }
}

/**
 * Negative control: the sweep above must be capable of FAILING. On the Arabic
 * page the geometry is mirrored, so judging it against LTR expectations has to
 * produce violations — if it produces none, either Arabic stopped mirroring or
 * the probe stopped detecting, and every "0 misresolved" line above is noise.
 */
test.describe("negative control — the sweep can detect non-mirrored geometry", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("LTR expectations against the Arabic page must report violations", async ({ page }) => {
    await page.goto("/ar/search", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    expect(await page.locator("html").getAttribute("dir")).toBe("rtl");

    const { inspected, bad } = await probeLogicalSpacing(page, "ltr");
    expect(
      inspected,
      "the Arabic page exposed no unambiguous logical-utility element — the sweep has nothing to check"
    ).toBeGreaterThan(0);
    expect(
      bad.length,
      "the probe accepted LTR geometry on the Arabic page, so its '0 misresolved' verdict elsewhere proves nothing"
    ).toBeGreaterThan(0);
  });
});

