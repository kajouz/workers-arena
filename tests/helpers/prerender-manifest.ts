/**
 * Locate the prerender manifest of the newest PRODUCTION build in a checkout,
 * for tests/prerender-coverage.test.ts.
 *
 * `.next` alone is not enough: this repo deliberately builds into isolated dist
 * dirs (`NEXT_DIST_DIR=.data/.next-*`, `tmp/preview-prod` — one process per dist
 * dir, see .freebuff/run.md), so the newest build's manifest is often NOT the
 * one under `.next`. Reading only `.next` made the coverage suite measure
 * whatever build happened to sit there — including one from before a fix.
 *
 * Only production manifests count. `next dev` writes one too, at
 * `<distDir>/dev/prerender-manifest.json`, listing only the pages visited so
 * far — and while the e2e smoke runs its dev server under `.data/.next-e2e-*`,
 * that one is the newest, so the coverage suite read it and failed with
 * "expected 0 to be greater than 20". The signal used is a sibling `BUILD_ID`:
 * in Next 16.3 only `next build` writes it (build/index.js → writeBuildId),
 * while `next dev` always redirects its output into `<distDir>/dev`
 * (server/config.js) and never writes one. A positive marker of a finished
 * build is sturdier than pattern-matching the dev path.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export function findManifests(dir: string, depth = 5): string[] {
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

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** A manifest written by `next build` — it has a BUILD_ID beside it. */
export function isProductionManifest(file: string): boolean {
  return isFile(file) && isFile(join(dirname(file), "BUILD_ID"));
}

/**
 * The manifest of the most recent production build — the one a developer just
 * verified — or null when the checkout has none.
 */
export function newestManifestPath(root: string): string | null {
  const candidates = [
    join(root, ".next/prerender-manifest.json"),
    ...findManifests(join(root, ".data")),
    ...findManifests(join(root, "tmp")),
  ].filter(isProductionManifest);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}
