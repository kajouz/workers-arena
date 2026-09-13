import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { overlayAudit, restoreTsconfigTypes } from "../scripts/smoke-preview.mjs";

/**
 * Pins the CONTRACT of the preview smoke's overlay audit
 * (`scripts/smoke-preview.mjs` → `overlayAudit`), which is what makes
 * `npm run smoke:preview` fail when a fixed overlay traps an interactive
 * control.
 *
 * Why this file exists: the audit's whole value is its JUDGEMENT — trap vs
 * "covered at first paint but scrollable past" vs "dismissible overlay, not the
 * user's problem" — and judgement is exactly what silently rots. Every fixture
 * here is a miniature of a case seen in the real app:
 *
 *  A. a full-screen `position: fixed` panel with no way out   → TRAPPED
 *  B. the same panel with a Dismiss control                   → excused (advisory)
 *  C. a dialog-style overlay (`role="dialog"`, Esc/close)     → excused (advisory)
 *  D. a bottom tab bar over a control at first paint          → reachable by
 *     scrolling, so ADVISORY only — the pre-fix /auth/login demo buttons lived
 *     here, and treating that as fatal would red-flag every mobile page
 *  E. the exclusions: chrome's own children, and anything whose reachability is
 *     governed by a user-scrollable ancestor
 *
 * The direction of failure matters: a false TRAP is a flaky gate (the audit
 * would be deleted), and a missed trap is a useless gate. Both are asserted.
 *
 * Skips itself when no Chrome is available, like tests/e2e-smoke.test.ts.
 */

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
].filter((p): p is string => Boolean(p));

const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));

if (!CHROME) {
  console.warn(
    "⚠ preview-overlay-audit: no Chrome/Chromium executable found — overlay audit contract test SKIPPED. " +
      "Set PUPPETEER_EXECUTABLE_PATH to enable it."
  );
}

interface AuditFinding {
  el: string;
  region: string;
  positions: number;
  blocker: string;
  overlay: string | null;
  overlayKind: string;
  dismissible: boolean;
}

interface Audit {
  controls: number;
  maxScroll: number;
  unreachable: AuditFinding[];
  atRest: Array<{ el: string; region: string; blocker: string; overlay: string | null }>;
}

/** 375×667 — the smoke's default phone viewport, and where fixed chrome bites. */
const VIEWPORT = { width: 375, height: 667 };

const SHARED_STYLE = `
  body { margin: 0; font: 14px system-ui; }
  button, a { display: block; width: 220px; height: 40px; }
  .gap { height: 900px; }
`;

/** A: full-screen fixed panel, no dismiss affordance. */
const FIXTURE_SHIELD = `<!doctype html><html><head><style>${SHARED_STYLE}
  #shield { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.02); }
</style></head><body>
  <button aria-label="outside-a">outside a</button>
  <div class="gap"></div>
  <button aria-label="outside-b">outside b</button>
  <div class="gap"></div>
  <div id="shield"><button aria-label="inside-shield">x</button></div>
</body></html>`;

/** B: the same panel, but with a Dismiss control. */
const FIXTURE_DISMISSIBLE = FIXTURE_SHIELD.replace(
  '<div id="shield"><button aria-label="inside-shield">x</button></div>',
  '<div id="shield"><button aria-label="Dismiss">x</button></div>'
);

/** C: dialog-style overlay — Esc/close is the way out, no Dismiss button. */
const FIXTURE_DIALOG = FIXTURE_SHIELD.replace(
  '<div id="shield"><button aria-label="inside-shield">x</button></div>',
  '<div id="shield" role="dialog" aria-modal="true"><button aria-label="inside-shield">x</button></div>'
);

/** C2: the onboarding-tour shape — full-screen, escaped by skipping. */
const FIXTURE_SKIPPABLE = FIXTURE_SHIELD.replace(
  '<div id="shield"><button aria-label="inside-shield">x</button></div>',
  '<div id="shield"><button aria-label="Skip onboarding">skip</button></div>'
);

/** D: bottom tab bar over a control that sits in its band at first paint. */
const FIXTURE_BOTTOM_BAR = `<!doctype html><html><head><style>${SHARED_STYLE}
  #tabbar { position: fixed; left: 0; right: 0; bottom: 0; height: 70px; z-index: 40; }
</style></head><body>
  <button aria-label="top-control">top</button>
  <div style="height: 580px"></div>
  <button aria-label="under-bar">under the bar at rest</button>
  <div style="height: 1200px"></div>
  <nav id="tabbar"><a aria-label="tab-link" href="#x">tab</a></nav>
</body></html>`;

/** E: a control whose reachability belongs to a horizontally scrollable rail. */
const FIXTURE_SCROLLER = `<!doctype html><html><head><style>${SHARED_STYLE}
  #rail { overflow-x: auto; width: 300px; }
  .wide { width: 2000px; }
</style></head><body>
  <div id="rail"><div class="wide"><a aria-label="slide" href="#s">slide</a></div></div>
  <button aria-label="plain">plain</button>
</body></html>`;

/**
 * The smoke builds into an isolated dist dir, which makes Next append that dir's
 * type paths to tsconfig.json's TRACKED `include` array — so every run left a
 * machine-specific diff and `--no-build` runs then carried it forward. The strip
 * must be exact: only this run's own entries go, and the file stays strict JSON.
 * (No Chrome needed — this block always runs.)
 */
describe("preview smoke tsconfig self-heal", () => {
  const DIST = ".data/.next-preview-smoke";

  function tempTsconfig(content: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), "preview-smoke-tsconfig-"));
    const file = path.join(dir, "tsconfig.json");
    writeFileSync(file, content);
    return file;
  }

  function withTempTsconfig(content: string, run: (file: string) => void) {
    const file = tempTsconfig(content);
    try {
      run(file);
    } finally {
      rmSync(path.dirname(file), { recursive: true, force: true });
    }
  }

  const restorable = (dist: string) =>
    `{\n  "include": [\n    "next-env.d.ts",\n    "**/*.ts",\n    "${dist}/types/**/*.ts",\n    "${dist}/dev/types/**/*.ts"\n  ]\n}\n`;

  it("removes the generated entries it owns and keeps the file strict JSON", () => {
    withTempTsconfig(restorable(DIST), (file) => {
      restoreTsconfigTypes(file, DIST);
      const fixed = readFileSync(file, "utf8");
      expect(fixed).not.toContain(DIST);
      expect(fixed).toContain('"next-env.d.ts"');
      expect(fixed).toContain('"**/*.ts"');
      // The removed entry was the array's last — no dangling comma may survive.
      expect(() => JSON.parse(fixed)).not.toThrow();
      expect(JSON.parse(fixed).include).toEqual(["next-env.d.ts", "**/*.ts"]);
    });
  });

  it("leaves another run's dist dir alone", () => {
    const other = restorable(".data/.next-e2e-4858");
    withTempTsconfig(other, (file) => {
      restoreTsconfigTypes(file, DIST);
      expect(readFileSync(file, "utf8")).toBe(other);
    });
  });

  it("is a no-op on a clean file, and never throws on a missing one", () => {
    const clean = '{\n  "include": [\n    "next-env.d.ts",\n    "**/*.ts"\n  ]\n}\n';
    withTempTsconfig(clean, (file) => {
      restoreTsconfigTypes(file, DIST);
      expect(readFileSync(file, "utf8")).toBe(clean);
    });
    expect(() => restoreTsconfigTypes(path.join(tmpdir(), "no-such-tsconfig.json"), DIST)).not.toThrow();
  });
});

const describeBrowser = CHROME ? describe : describe.skip;

describeBrowser("preview overlay audit contract", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
      protocolTimeout: 60_000,
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close().catch(() => {});
  });

  /** Load a fixture and run the audit exactly as the smoke does. */
  async function audit(html: string): Promise<Audit> {
    const page = await browser.newPage();
    try {
      await page.setViewport(VIEWPORT);
      await page.setContent(html, { waitUntil: "load" });
      return (await page.evaluate(overlayAudit)) as Audit;
    } finally {
      await page.close().catch(() => {});
    }
  }

  const trapped = (result: Audit) => result.unreachable.filter((finding) => !finding.dismissible);
  const excused = (result: Audit) => result.unreachable.filter((finding) => finding.dismissible);
  /** `describe()` renders a control as `button[aria-label-or-text]`. */
  const named = (findings: Array<{ el: string }>, needle: string) => findings.filter((f) => f.el.includes(needle));
  const label = (el: string) => el.match(/\[([^\]]*)\]/)?.[1] ?? el;

  it("traps controls behind a fixed overlay that offers no way out", async () => {
    const result = await audit(FIXTURE_SHIELD);

    const blocked = trapped(result);
    expect(blocked.map((f) => label(f.el)).sort()).toEqual(["outside-a", "outside-b"]);
    // The failure line has to NAME the overlay, or it is not diagnosable.
    expect(blocked[0].overlayKind).toBe("fixed");
    expect(blocked[0].overlay).toContain("shield");
    expect(blocked[0].positions).toBeGreaterThan(0);
    expect(blocked[0].dismissible).toBe(false);
    // The overlay's own children are chrome, not content it covers.
    expect(named(result.unreachable, "inside-shield")).toEqual([]);
    expect(named(result.atRest, "inside-shield")).toEqual([]);
    expect(result.controls).toBe(2);
  });

  it("excuses the same overlay once it carries a Dismiss control", async () => {
    const result = await audit(FIXTURE_DISMISSIBLE);
    expect(trapped(result)).toEqual([]);
    const excusedFindings = excused(result);
    expect(excusedFindings).toHaveLength(2);
    expect(excusedFindings.every((f) => f.dismissible)).toBe(true);
  });

  it("excuses a dialog-style overlay — Esc/close is the way out", async () => {
    const result = await audit(FIXTURE_DIALOG);
    expect(trapped(result)).toEqual([]);
    expect(excused(result)).toHaveLength(2);
  });

  it("excuses the onboarding-tour shape — skipping is the way out", async () => {
    const result = await audit(FIXTURE_SKIPPABLE);
    expect(trapped(result)).toEqual([]);
    expect(excused(result)).toHaveLength(2);
  });

  it("does not call a control under the bottom bar trapped when scrolling reveals it", async () => {
    const result = await audit(FIXTURE_BOTTOM_BAR);

    // Fatal only if no legal resting position clears the bar.
    expect(trapped(result)).toEqual([]);
    // …but it IS reported, because that is the class the /auth/login bug was in.
    expect(named(result.atRest, "under-bar")).toHaveLength(1);
    expect(result.atRest[0].overlay).toMatch(/^fixed /);
    expect(result.atRest[0].overlay).toContain("tabbar");
    // Controls above the fold are untouched, and the bar's own link is chrome.
    expect(named(result.atRest, "top-control")).toEqual([]);
    expect(named(result.unreachable, "tab-link")).toEqual([]);
    expect(result.controls).toBe(2);
    // The audit only claims reachability where scrolling can actually get there.
    expect(result.maxScroll).toBeGreaterThan(0);
  });

  it("leaves controls inside a scrollable rail to that rail", async () => {
    const result = await audit(FIXTURE_SCROLLER);
    expect(result.unreachable).toEqual([]);
    expect(result.atRest).toEqual([]);
    expect(result.controls).toBe(1);
    expect(named(result.unreachable, "slide")).toEqual([]);
  });
});
