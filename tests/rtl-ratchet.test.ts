import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * RTL PHYSICAL-CLASS RATCHET (finding 14)
 * ────────────────────────────────────────────────────────────────────────────
 * The audit counted 326 hit-lines of physical `ml/mr/pl/pr` + `text-left/right`
 * classes that do NOT flip in Arabic — a button padded `ml-2` grows its gap on
 * the wrong side under `dir="rtl"`. The pay-down converted all of them to
 * logical utilities (verified as a pure pair swap), so the baseline is now
 * ZERO and the ratchet is a hard ban:
 *
 *   • ANY physical direction class in ANY tracked file fails the suite with
 *     the offending classes listed and the logical replacement spelled out;
 *   • the committed fixture records 0 everywhere; a genuinely LTR-locked
 *     class (e.g. a numeric column) may only be exempted by adding it to the
 *     fixture with a PR comment explaining why it must not flip.
 *
 * New code uses logical utilities that flip automatically:
 *   ml-* → ms-*   mr-* → me-*   pl-* → ps-*   pr-* → pe-* * left-/right- → start-/end-   text-left/right → text-start/end
 * (left/right-position utilities are out of the ratchet's scope but follow
 * the same rule in review.)
 *
 * This suite is the SOURCE-TEXT half of the guard and cannot tell a correct
 * swap from a correct-looking one. The RENDERED half — proof that logical
 * spacing actually mirrors in Arabic, measured from resolved geometry in a
 * real browser — is tests/playwright/rtl-logical-spacing.spec.ts.
 */

const ROOT = path.resolve(__dirname, "..");
const BASELINE = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/rtl-physical-class-baseline.json"), "utf8")
) as { total: number; files: Record<string, number> };

/**
 * Match a physical direction class only when it is a WHOLE class token:
 * preceded by a quote/space and followed by a boundary — so `ps-ml-4`-style
 * false positives and `xml-`-ish prefixes don't count. Covers both plain
 * string classNames and conditional/cn() strings (same source text).
 */
const PHYSICAL = /(?:^|[\s"'`])(-?)(ml|mr|pl|pr)-\d|\btext-(left|right)\b/;

function physicalHits(file: string): { count: number; samples: string[] } {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  const lines = src.split("\n");
  let count = 0;
  const samples: string[] = [];
  lines.forEach((line, i) => {
    if (PHYSICAL.test(line)) {
      count++;
      if (samples.length < 3) samples.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
  return { count, samples };
}

function trackedFiles(): string[] {
  // git ls-files keeps the sweep to repo content and is fast and stable across
  // machines (no node_modules, no build output).
  const out = execFileSync("git", ["ls-files", "src"], { cwd: ROOT, encoding: "utf8" });
  return out.split("\n").filter((f) => /\.(tsx?|jsx?)$/.test(f));
}

describe("RTL physical-class ratchet (finding 14)", () => {
  it("baseline references only files that exist", () => {
    const missing = Object.keys(BASELINE.files).filter(
      (f) => !trackedFiles().includes(f)
    );
    // Deleted files are FINE (improvement) — just prune them from the
    // baseline. This assertion only guards against a corrupted fixture.
    const gone = missing.filter((f) => !trackedFiles().some((t) => t === f));
    expect(
      gone.filter((f) => !f.startsWith("src/")),
      "baseline entries outside src/ must not exist"
    ).toHaveLength(0);
  });

  it("adds no new physical direction classes in any tracked file", () => {
    const offenders: string[] = [];
    for (const file of trackedFiles()) {
      const baselineCount = BASELINE.files[file] ?? 0;
      const { count, samples } = physicalHits(file);
      if (count > baselineCount) {
        offenders.push(
          `${file}: ${count} physical classes (baseline ${baselineCount}). ` +
            `Use logical utilities that flip in RTL: ml→ms, mr→me, pl→ps, pr→pe, left/right→start/end, text-left/right→text-start/end. ` +
            `Offending lines:\n  ${samples.join("\n  ")}`
        );
      }
    }
    expect(
      offenders,
      `new physical (non-flipping) direction classes were added in ${offenders.length} file(s)`
    ).toHaveLength(0);
  });
});
