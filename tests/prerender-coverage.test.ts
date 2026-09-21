/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE PUBLIC SURFACE MUST STAY PRERENDERABLE
 * ────────────────────────────────────────────────────────────────────────────
 * A single cookie read anywhere under app/[locale]/(public) opts that route —
 * and anything above it — out of static rendering. That is not a loud failure:
 * the build still succeeds, the page still works, it just quietly starts
 * rendering per request and stops being served from the edge.
 *
 * That is exactly how the site ended up with 3 prerendered routes out of ~200.
 * One `getSession()` in the shared layout for the header's Sign-in button, and
 * one `getSession()` on the homepage for a push-notification prompt, were
 * enough. Both looked harmless in review.
 *
 * So this suite checks the CAUSE, in source, on every run:
 *   • nothing under (public) reads cookies, headers or a session
 *   • the pages that carry the catalogue declare generateStaticParams
 *
 * and, when a build happens to be present, the EFFECT too.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const LOCALE_DIR = join(ROOT, "src/app/[locale]");
const PUBLIC_DIR = join(LOCALE_DIR, "(public)");

/**
 * Strip comments before scanning. The first version matched the word
 * "cookies()" inside the (public) layout's own doc comment explaining why it
 * must not call cookies() — a check that fails on its own documentation is a
 * check people delete.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Reads that make a route dynamic. `searchParams` is deliberately NOT here:
 * /search is query-driven and dynamic by nature, and the proxy still lets an
 * anonymous request at it be edge-cached.
 */
const DYNAMIC_READS = [
  { pattern: /\bcookies\s*\(/, what: "cookies()" },
  { pattern: /\bheaders\s*\(/, what: "headers()" },
  { pattern: /\bgetSession\s*\(/, what: "getSession()" },
  { pattern: /\bdraftMode\s*\(/, what: "draftMode()" },
  { pattern: /export const dynamic\s*=\s*["']force-dynamic["']/, what: 'dynamic = "force-dynamic"' },
];

describe("the public surface stays statically renderable", () => {
  const files = walk(PUBLIC_DIR);

  it("finds the public route group (guards against a silently empty scan)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("no page under (public) reads a cookie, a header, or the session", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, "utf8"));
      for (const { pattern, what } of DYNAMIC_READS) {
        if (pattern.test(src)) offenders.push(`${relative(ROOT, file)} — ${what}`);
      }
    }
    expect(
      offenders,
      "These make their route render per request, which takes it off the edge " +
        "and out of the prerender manifest:\n  " +
        offenders.join("\n  ") +
        "\n\nResolve it on the client instead (src/hooks/use-session.ts is the " +
        "pattern the header uses), or move the page to (app) if it is genuinely per-user."
    ).toEqual([]);
  });

  it("the catalogue pages declare generateStaticParams", () => {
    // Without it a dynamic segment has nothing to build ahead of time, so every
    // profile and landing page falls back to on-demand rendering.
    const required = [
      "(public)/workers/[slug]/page.tsx",
      "(public)/cities/[city]/page.tsx",
      "(public)/trades/[trade]/page.tsx",
    ];
    for (const rel of required) {
      const file = join(LOCALE_DIR, rel);
      expect(existsSync(file), `${rel} is missing`).toBe(true);
      expect(
        readFileSync(file, "utf8"),
        `${rel} has a dynamic segment but no generateStaticParams`
      ).toContain("generateStaticParams");
    }
  });

  it("the locale segment itself enumerates both languages", () => {
    const layout = readFileSync(join(LOCALE_DIR, "layout.tsx"), "utf8");
    expect(layout).toContain("generateStaticParams");
  });
});

/**
 * The effect, when a build is around. Skipped rather than failed without one:
 * the unit job does not build, and a test that demands `next build` would
 * either be permanently red there or force a build into every run.
 */
const manifestPath = join(ROOT, ".next/prerender-manifest.json");
const built = existsSync(manifestPath) && statSync(manifestPath).isFile();

describe.skipIf(!built)("the build actually prerenders the public surface", () => {
  const routes = Object.keys(
    (JSON.parse(readFileSync(manifestPath, "utf8")) as { routes?: Record<string, unknown> }).routes ?? {}
  );

  it("prerenders both homepages", () => {
    expect(routes).toContain("/en");
    expect(routes).toContain("/ar");
  });

  it("prerenders worker profiles in both languages", () => {
    const profiles = routes.filter((r) => r.includes("/workers/"));
    expect(profiles.some((r) => r.startsWith("/en/"))).toBe(true);
    expect(profiles.some((r) => r.startsWith("/ar/"))).toBe(true);
    // The first version of generateStaticParams called the PAGINATED search
    // seam and got one page of results, so most profiles quietly stayed
    // on-demand. More than a page's worth is the signal that it reads them all.
    expect(profiles.length).toBeGreaterThan(20);
  });

  it("prerenders the trade and city landing pages", () => {
    expect(routes.filter((r) => r.includes("/trades/")).length).toBeGreaterThan(20);
    expect(routes.some((r) => r.includes("/cities/"))).toBe(true);
  });

  it("keeps the whole public surface well above the pre-migration baseline", () => {
    // It was 3: /_global-error, /robots.txt, /sitemap.xml. Nothing a visitor
    // ever asked for.
    expect(routes.length).toBeGreaterThan(50);
  });
});
