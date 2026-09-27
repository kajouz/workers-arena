/**
 * Manifest selection for the prerender coverage suite
 * (tests/helpers/prerender-manifest.ts). The regression: while the e2e smoke's
 * `next dev` ran under .data/.next-e2e-<pid>, its DEV manifest — only the pages
 * visited so far — was the newest, got picked, and the coverage suite failed
 * with "expected 0 to be greater than 20".
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isProductionManifest, newestManifestPath } from "./helpers/prerender-manifest";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "prerender-manifest-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Seconds since epoch — distinct, explicit mtimes instead of relying on write order. */
let clock = 1_800_000_000;

/** Lay out a dist dir the way `next build` does: manifest + BUILD_ID. */
function prodBuild(distDir: string): string {
  const dir = join(root, distDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "BUILD_ID"), "abc123");
  return manifest(dir);
}

/** Lay out a dist dir the way `next dev` does: `<distDir>/dev/`, no BUILD_ID. */
function devServer(distDir: string): string {
  const dir = join(root, distDir, "dev");
  mkdirSync(dir, { recursive: true });
  return manifest(dir);
}

function manifest(dir: string): string {
  const file = join(dir, "prerender-manifest.json");
  writeFileSync(file, JSON.stringify({ routes: {} }));
  clock += 60;
  utimesSync(file, clock, clock);
  return file;
}

describe("newestManifestPath", () => {
  it("returns null when there is no build at all", () => {
    expect(newestManifestPath(root)).toBeNull();
  });

  it("returns null when only a dev server has run", () => {
    devServer(".next");
    devServer(".data/.next-e2e-1234");
    expect(newestManifestPath(root)).toBeNull();
  });

  it("ignores a running e2e dev server's newer manifest in favour of the last build", () => {
    const build = prodBuild(".data/.next-gsp");
    const dev = devServer(".data/.next-e2e-4242"); // written after the build
    expect(newestManifestPath(root)).toBe(build);
    expect(newestManifestPath(root)).not.toBe(dev);
  });

  it("ignores .next/dev even though .next itself is a candidate root", () => {
    const build = prodBuild("tmp/preview-prod");
    devServer(".next");
    expect(newestManifestPath(root)).toBe(build);
  });

  it("picks the newest production build across .next, .data and tmp", () => {
    prodBuild(".next");
    prodBuild("tmp/preview-prod");
    const newest = prodBuild(".data/.next-gsp");
    devServer(".data/.next-e2e-1");
    expect(newestManifestPath(root)).toBe(newest);
  });

  it("does not count a manifest whose build never wrote BUILD_ID", () => {
    // e.g. a build that died after emitting the manifest but before finishing
    const dir = join(root, ".data/.next-broken");
    mkdirSync(dir, { recursive: true });
    const orphan = manifest(dir);
    expect(isProductionManifest(orphan)).toBe(false);
    expect(newestManifestPath(root)).toBeNull();
  });
});
