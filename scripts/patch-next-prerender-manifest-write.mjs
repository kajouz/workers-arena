#!/usr/bin/env node
/**
 * patch-next-prerender-manifest-write.mjs
 *
 * Makes `next dev` write prerender-manifest.json atomically.
 *
 * The first request to each dynamic page (every page under [locale] here, since
 * the locale layout has generateStaticParams) makes the dev server read
 * prerender-manifest.json, add the page's routes, and write the file back with
 * a plain `fs.promises.writeFile` (next/dist/server/dev/next-dev-server.js,
 * unfixed as of 16.3.6 and 16.4.0-canary.50). When two such requests overlap,
 * the writes interleave. A reader can then see an empty file ("Unexpected end
 * of JSON input"), or the file can be left as a shorter manifest followed by
 * the tail of a longer one ("Unexpected non-whitespace character after JSON at
 * position N"). The dev server parses the file on every request to a dynamic
 * page, so a doubled file makes those requests answer 500 until something
 * rewrites it.
 *
 * The service worker's install precaches ~60 URLs at once (public/sw.js), which
 * hits several dynamic pages concurrently on a fresh dev server. That made the
 * e2e smoke fail intermittently (seed routes 500, renew dialog timeout).
 *
 * The patch replaces that one write with Next's own writeFileAtomic (temp file +
 * rename, already used for its other manifests). Readers then always see a
 * complete file. Two overlapping updates can still drop one page's entry, but
 * the next request to that page adds it again.
 *
 * Runs from `postinstall`. Idempotent. When the target line is missing (a Next
 * upgrade changed or fixed it) it warns and leaves the file alone;
 * tests/next-prerender-manifest-patch.test.ts then fails so the patch gets
 * revisited instead of silently lapsing.
 *
 * Usage:  node scripts/patch-next-prerender-manifest-write.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const UNPATCHED =
  "await _fs.default.promises.writeFile((0, _path.join)(this.distDir, _constants1.PRERENDER_MANIFEST), updatedManifest);";

/** Relative to next-dev-server.js. Kept out of a literal require() call so
 * check:scripts doesn't try to resolve it from this script. */
export const WRITE_ATOMIC = "../../lib/fs/write-atomic";

export const PATCHED =
  `require(${JSON.stringify(WRITE_ATOMIC)}).writeFileAtomic((0, _path.join)(this.distDir, _constants1.PRERENDER_MANIFEST), updatedManifest); /* patched by scripts/patch-next-prerender-manifest-write.mjs */`;

/**
 * Pure: the patched source and what happened.
 * - "patched": the non-atomic write was replaced
 * - "already-patched": nothing to do
 * - "not-found": neither form is present (Next changed this code)
 */
export function patchSource(source) {
  if (source.includes(PATCHED)) return { status: "already-patched", source };
  const count = source.split(UNPATCHED).length - 1;
  if (count !== 1) return { status: "not-found", source };
  return { status: "patched", source: source.replace(UNPATCHED, PATCHED) };
}

/** Path of the installed dev server module, or undefined when next is absent. */
export function devServerPath() {
  try {
    return createRequire(import.meta.url).resolve("next/dist/server/dev/next-dev-server.js");
  } catch {
    return undefined;
  }
}

function main() {
  const file = devServerPath();
  if (!file) {
    console.log("[patch-next] next is not installed; nothing to patch");
    return;
  }
  const { status, source } = patchSource(readFileSync(file, "utf8"));
  if (status === "patched") {
    writeFileSync(file, source);
    console.log("[patch-next] next dev now writes prerender-manifest.json atomically");
  } else if (status === "not-found") {
    console.warn(
      "[patch-next] WARNING: the prerender-manifest write in next-dev-server.js has changed; " +
        "patch not applied. Check whether Next fixed it and update or remove " +
        "scripts/patch-next-prerender-manifest-write.mjs."
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
