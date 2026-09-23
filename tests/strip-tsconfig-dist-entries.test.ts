import { describe, expect, it } from "vitest";
import { stripDistEntries } from "../scripts/strip-tsconfig-dist-entries.mjs";

/**
 * The stripper is the documented recovery tool for the tsconfig noise every
 * NEXT_DIST_DIR run leaves behind (`next dev` appends `<distDir>/types` globs).
 * Two things must hold, and the first version of this script got both wrong: it
 * must remove the generated entries, and it must NOT remove the globs the
 * repository commits on purpose (repro dirs under tmp/).
 */

const COMMITTED = new Set([
  "next-env.d.ts",
  "**/*.ts",
  "**/*.tsx",
  ".next/types/**/*.ts",
  "tmp/locale-repro/types/**/*.ts",
  "tmp/locale-repro/dev/types/**/*.ts",
]);

describe("stripDistEntries", () => {
  it("removes the dist-dir globs a run appended", () => {
    const include = [
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts",
      ".data/.next-verify/types/**/*.ts",
      ".data/.next-verify/dev/types/**/*.ts",
    ];
    expect(stripDistEntries(include, COMMITTED)).toEqual([
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
      ".next/types/**/*.ts",
    ]);
  });

  it("never removes an entry the repository commits on purpose", () => {
    const include = [
      "next-env.d.ts",
      "tmp/locale-repro/types/**/*.ts",
      "tmp/locale-repro/dev/types/**/*.ts",
      ".data/.next-dev-preview/types/**/*.ts",
    ];
    const next = stripDistEntries(include, COMMITTED);
    expect(next).toContain("tmp/locale-repro/types/**/*.ts");
    expect(next).toContain("tmp/locale-repro/dev/types/**/*.ts");
    expect(next).not.toContain(".data/.next-dev-preview/types/**/*.ts");
  });

  it("keeps the source, test and script globs whatever HEAD says", () => {
    const include = ["src/**/*.ts", "tests/**/*.tsx", "scripts/**/*.mjs", "weird-dist/types/**/*.ts"];
    expect(stripDistEntries(include, null)).toEqual([
      "src/**/*.ts",
      "tests/**/*.tsx",
      "scripts/**/*.mjs",
    ]);
  });

  it("is idempotent — a cleaned array is left exactly as it is", () => {
    const cleaned = ["next-env.d.ts", "**/*.ts", ".next/types/**/*.ts"];
    expect(stripDistEntries(cleaned, COMMITTED)).toEqual(cleaned);
    // …and running it again on its own output changes nothing.
    expect(stripDistEntries(stripDistEntries(cleaned, COMMITTED), COMMITTED)).toEqual(cleaned);
  });

  it("falls back to the allowlist when HEAD is unavailable", () => {
    // Without git the standard entries survive and unknown ones go — and the
    // caller is told to check the diff rather than promised it is right.
    const include = [".next/types/**/*.ts", ".next/dev/types/**/*.ts", ".data/.next-x/types/**/*.ts"];
    expect(stripDistEntries(include, null)).toEqual([".next/types/**/*.ts", ".next/dev/types/**/*.ts"]);
    // A committed tmp glob is NOT protected in this mode — hence the warning.
    expect(stripDistEntries(["tmp/locale-repro/types/**/*.ts"], null)).toEqual([]);
  });
});
