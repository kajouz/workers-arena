#!/usr/bin/env node
/**
 * strip-tsconfig-dist-entries.mjs
 *
 * Removes auto-appended NEXT_DIST_DIR type entries from tsconfig.json's
 * include array. Next.js adds entries like:
 *   ".data/.next-dev-preview/types/**/*.ts",
 *   ".data/.next-dev-preview/dev/types/**/*.ts"
 * every time `next dev` runs with a custom NEXT_DIST_DIR.  These are
 * redundant because .data/ .next/ and tmp/ are already in the exclude
 * array, but they accumulate over time and pollute git diffs.
 *
 * Usage:  node scripts/strip-tsconfig-dist-entries.mjs
 *         (safe to run any time — idempotent, exits 0 if nothing to fix)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TSCONFIG = resolve(import.meta.dirname, "..", "tsconfig.json");
const raw = readFileSync(TSCONFIG, "utf8");
const config = JSON.parse(raw);

const BEFORE = JSON.stringify(config.include);
// Remove any entry that looks like a dist-dir types glob
// (contains /types/**/*.ts or /dev/types/**/*.ts but is NOT next-env.d.ts, src/**, tests/**, or scripts/**)
config.include = config.include.filter((entry) => {
  if (entry === "next-env.d.ts" || entry.startsWith("src/") || entry.startsWith("tests/") || entry.startsWith("scripts/")) return true;
  // Keep only the standard .next entry (the production cache — harmless, present in repo)
  if (entry === ".next/types/**/*.ts" || entry === ".next/dev/types/**/*.ts") return true;
  // Everything else is a custom-dist-dir artifact — strip it
  return false;
});

const AFTER = JSON.stringify(config.include);
if (BEFORE === AFTER) {
  console.log("tsconfig.json include array is already clean.");
  process.exit(0);
}

writeFileSync(TSCONFIG, JSON.stringify(config, null, 2) + "\n", "utf8");
const removed = JSON.parse(BEFORE).length - config.include.length;
console.log(`Cleaned tsconfig.json: removed ${removed} auto-appended dist-dir entries.`);
