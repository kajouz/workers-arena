import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, it, expect } from "vitest";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * RTL PHYSICAL-CLASS RATCHET (finding 14)
 * ────────────────────────────────────────────────────────────────────────────
 * The audit counted ~228 physical `ml/mr/pl/pr/left/right` classes (plus 227
 * `text-left/right`) that do NOT flip in Arabic — a button padded `ml-2` grows
 * its gap on the wrong side under `dir="rtl"`. Converting all of them in one
 * pass is a large, risky diff, so this test does what a ratchet does:
 *
 *   • the committed baseline pins each file's current count of physical
 *     direction classes;
 *   • ANY file that EXCEEDS its baseline (i.e. adds a new one) fails with the
 *     offending classes listed and the logical replacement spelled out;
 *   • files may improve (drop below baseline) freely — the baseline is a
 *     ceiling, not a quota.
 *
 * New RTL-safe code uses logical utilities that flip automatically:
 *   ml-* → ms-*   mr-* → me-*   pl-* → ps-*   pr-* → pe-*
 *   left-/right- → start-/end-   text-left/right → text-start/end
 * When a file's count reaches 0 you may delete its baseline entry.
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
