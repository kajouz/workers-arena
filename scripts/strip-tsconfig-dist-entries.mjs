#!/usr/bin/env node
/**
 * strip-tsconfig-dist-entries.mjs
 *
 * Removes auto-appended NEXT_DIST_DIR type entries from tsconfig.json's include
 * array. Next.js appends the dist dir's generated type globs every time
 * `next dev` / `next build` runs with a custom NEXT_DIST_DIR, e.g. for a dist
 * dir of `.data/.next-dev-preview` it appends two entries under that directory.
 * They are redundant (`.data/` is already excluded) but they accumulate and
 * pollute git diffs.
 *
 * It compares against the COMMITTED tsconfig (HEAD) and removes only entries
 * that are not in it. That distinction matters: the repository intentionally
 * carries some globs of its own (repro dirs under tmp/), and an allowlist-only
 * filter would delete those too — turning "clean up the noise" into a diff that
 * removes repo content. When HEAD cannot be read (no git, a fresh tarball) it
 * falls back to the allowlist and says so.
 *
 * Usage:  node scripts/strip-tsconfig-dist-entries.mjs
 *         (safe to run any time — idempotent, exits 0 if nothing to fix)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");

/** Entries every checkout is expected to carry, whatever HEAD says. */
const ALWAYS_KEEP = new Set([
  "next-env.d.ts",
  ".next/types/**/*.ts",
  ".next/dev/types/**/*.ts",
]);

/**
 * The include array with the generated dist-dir entries removed.
 *
 * Pure and exported so it can be tested without touching a real tsconfig:
 * `committed` is the include array from HEAD (or null when it is unavailable).
 */
export function stripDistEntries(include, committed) {
  const keep = (entry) => {
    if (entry === "next-env.d.ts" || entry.startsWith("src/") || entry.startsWith("tests/") || entry.startsWith("scripts/")) {
      return true;
    }
    if (ALWAYS_KEEP.has(entry)) return true;
    // Anything the repository already commits is not noise, whatever it looks like.
    if (committed && committed.has(entry)) return true;
    // Without HEAD, fall back to the allowlist: keep only the standard entries.
    return false;
  };
  return include.filter(keep);
}

/** The include array as committed, or null when git/HEAD is unavailable. */
function committedInclude() {
  try {
    const raw = execFileSync("git", ["show", "HEAD:tsconfig.json"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.include) ? new Set(parsed.include) : null;
  } catch {
    return null;
  }
}

function main() {
  const TSCONFIG = resolve(ROOT, "tsconfig.json");
  const raw = readFileSync(TSCONFIG, "utf8");
  const config = JSON.parse(raw);
  if (!Array.isArray(config.include)) {
    console.log("tsconfig.json has no include array — nothing to do.");
    return;
  }

  const committed = committedInclude();
  const next = stripDistEntries(config.include, committed);
  if (next.length === config.include.length) {
    console.log("tsconfig.json include array is already clean.");
    return;
  }

  const removed = config.include.filter((entry) => !next.includes(entry));
  config.include = next;
  writeFileSync(TSCONFIG, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Cleaned tsconfig.json: removed ${removed.length} auto-appended dist-dir entr${removed.length === 1 ? "y" : "ies"}.`);
  for (const entry of removed) console.log(`  - ${entry}`);
  if (!committed) {
    console.log("(HEAD was unavailable, so this used the built-in allowlist — check the diff before committing.)");
  }
}

// Only act when executed directly — the module is imported by its test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
