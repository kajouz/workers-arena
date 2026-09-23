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
 *   • a page that declares generateStaticParams does not read searchParams
 *     (equally dynamic, and the same silent failure — see the test)
 *
 * and, when a build happens to be present, the EFFECT too — from the NEWEST
 * build in the checkout, since this repo builds into isolated dist dirs.
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

  it("no page that declares generateStaticParams reads searchParams", () => {
    // The two are mutually exclusive by definition: `generateStaticParams` says
    // "build me ahead of time", reading `searchParams` says "render me per
    // request" — and Next resolves that in favour of dynamic, so the route is
    // reported as ƒ and NOTHING from it is prerendered.
    //
    // This is the cookie rule in its other form, and it slipped past the check
    // above only because `searchParams` is deliberately excluded from
    // DYNAMIC_READS: the WhatsApp booking entry resolved `?book=` on the server,
    // `generateStaticParams` still returned all 18 slugs, and yet ZERO of the 36
    // catalogue pages were built. The build printed no error — only the manifest
    // knew. Resolve the entry in the dialog, in the browser
    // (docs/booking-entry.md).
    //
    // `/search` and `/auth/register` are query-driven and keep reading it: they
    // declare no generateStaticParams, so this rule never touches them.
    const offenders = files
      .filter((file) => /\bgenerateStaticParams\b/.test(stripComments(readFileSync(file, "utf8"))))
      .filter((file) => /\bsearchParams\b/.test(stripComments(readFileSync(file, "utf8"))))
      .map((file) => relative(ROOT, file));
    expect(
      offenders,
      "These pages declare generateStaticParams AND read searchParams, so Next renders them dynamically and prerenders none of them:\n  " +
        offenders.join("\n  ") +
        "\n\nRead the query in a client component (window.location.search / useSearchParams behind a Suspense boundary) instead — see the worker profile's booking entry."
    ).toEqual([]);
  });

  it("the locale segment itself enumerates both languages", () => {
    const layout = readFileSync(join(LOCALE_DIR, "layout.tsx"), "utf8");
    expect(layout).toContain("generateStaticParams");
  });
});

/**
 * Find every build's manifest in this checkout. `.next` alone is not enough:
 * this repo deliberately builds into isolated dist dirs (`NEXT_DIST_DIR=.data/.next-*`,
 * `tmp/preview-prod` — one process per dist dir, see .freebuff/run.md), so the
 * newest build's manifest is often NOT the one under `.next`. Reading only
 * `.next` made this whole describe block measure whatever build happened to sit
 * there — including one from before a fix.
 */
function findManifests(dir: string, depth = 5): string[] {
  if (!existsSync(dir) || depth < 0) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findManifests(full, depth - 1));
    else if (entry.name === "prerender-manifest.json") out.push(full);
  }
  return out;
}

/**
 * The manifest of the most recent build — the one a developer just verified.
 */
function newestManifestPath(): string | null {
  const candidates = [
    join(ROOT, ".next/prerender-manifest.json"),
    ...findManifests(join(ROOT, ".data")),
    ...findManifests(join(ROOT, "tmp")),
  ].filter((file) => {
    try {
      return statSync(file).isFile();
    } catch {
      return false;
    }
  });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/**
 * The effect, when a build is around. Skipped rather than failed without one:
 * the unit job does not build, and a test that demands `next build` would
 * either be permanently red there or force a build into every run.
 */
const manifestPath: string | null = newestManifestPath();
const built = manifestPath !== null;

// NOTE: describe.skipIf still EXECUTES the callback during collection — only
// the `it`s inside are skipped. The manifest read must live inside `it`s (or
// be re-checked lazily), otherwise a run without a build crashes collection
// with ENOENT instead of cleanly skipping (exactly what CI's no-build unit
// job hit). Any shared setup must therefore tolerate a missing manifest.
describe.skipIf(!built)("the build actually prerenders the public surface", () => {
  // Lazily read per-test: `built` was true at collection, but a concurrent
  // clean (e.g. the e2e suite's workspace self-heal) may remove the dist dir
  // while this suite runs. A vanished manifest then skips the individual checks
  // instead of crashing the suite.
  const routes = (): string[] => {
    if (!manifestPath || !existsSync(manifestPath)) return [];
    return Object.keys(
      (JSON.parse(readFileSync(manifestPath, "utf8")) as { routes?: Record<string, unknown> }).routes ?? {}
    );
  };

  it("prerenders both homepages", () => {
    const names = routes();
    if (names.length === 0) return; // build vanished mid-run — nothing to assert
    expect(names).toContain("/en");
    expect(names).toContain("/ar");
  });

  it("prerenders worker profiles in both languages", () => {
    const routesList = routes();
    if (routesList.length === 0) return;
    const profiles = routesList.filter((r) => r.includes("/workers/"));
    expect(profiles.some((r) => r.startsWith("/en/"))).toBe(true);
    expect(profiles.some((r) => r.startsWith("/ar/"))).toBe(true);
    // The first version of generateStaticParams called the PAGINATED search
    // seam and got one page of results, so most profiles quietly stayed
    // on-demand. More than a page's worth is the signal that it reads them all.
    expect(profiles.length).toBeGreaterThan(20);
  });

  it("prerenders the trade and city landing pages", () => {
    const names = routes();
    if (names.length === 0) return;
    expect(names.filter((r) => r.includes("/trades/")).length).toBeGreaterThan(20);
    expect(names.some((r) => r.includes("/cities/"))).toBe(true);
  });

  it("keeps the whole public surface well above the pre-migration baseline", () => {
    // It was 3: /_global-error, /robots.txt, /sitemap.xml. Nothing a visitor
    // ever asked for.
    const names = routes();
    if (names.length === 0) return;
    expect(names.length).toBeGreaterThan(50);
  });
});
