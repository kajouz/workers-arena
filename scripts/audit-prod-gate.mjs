#!/usr/bin/env node
/**
 * audit-prod-gate.mjs — the enforced ratchet on production dependency risk
 *
 * CI runs `npm audit --omit=dev --json | node scripts/audit-prod-gate.mjs`.
 * The dependency-security pass drove the production tree to a 0/0/0 baseline
 * (0 critical / 0 high / 0 moderate); this gate is what keeps it there.
 * `npm audit` alone is advisory — a summary nobody is forced to act on — while
 * this step lives in the lint job, which build, e2e and deploy-production all
 * `needs`, so a new critical or high production finding blocks the deploy
 * instead of shipping silently.
 *
 * Rules of the road:
 *
 *   - Only `metadata.vulnerabilities` is read, and only critical/high block.
 *     The gate ACCEPTS a full-tree report too (e.g. piping plain
 *     `npm audit --json` from a local run): a full report carries the same
 *     metadata, and dev-only findings are simply severities that cannot block.
 *     That is exactly why CI audits with `--omit=dev`, and why the parser does
 *     not reject dev findings it would see otherwise — accepting the full-tree
 *     shape keeps local runs and CI on one verdict path.
 *   - Anything unexpected fails closed: empty stdin, unparsable JSON, an npm
 *     error payload (`{"error": …}` — registry down, lockfile drift), missing
 *     metadata, or a severity count npm stops emitting. A silent pass on a
 *     broken report is the one bug this gate must never have.
 *
 * Usage:  npm audit --omit=dev --json | node scripts/audit-prod-gate.mjs
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Severities that block. Bump deliberately, in a reviewed change — never to get a run green. */
export const BLOCKING_SEVERITIES = ["critical", "high"];

/** Hard ceiling on stdin so a runaway pipe cannot exhaust the runner's memory. */
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;

/**
 * The blocking findings in an npm audit report.
 *
 * Pure and exported so tests can exercise success and failure without npm: it
 * accepts any npm-audit JSON shape — `--omit=dev` or the full tree — and
 * returns the blocking severities as `{ severity, count }` entries (empty when
 * the ratchet holds).
 *
 * @param {unknown} report parsed `npm audit --json` output
 * @param {{ blocking?: string[] }} [options]
 * @returns {{ severity: string, count: number }[]}
 */
export function auditVerdict(report, { blocking = BLOCKING_SEVERITIES } = {}) {
  const counts = report?.metadata?.vulnerabilities;
  if (typeof counts !== "object" || counts === null) {
    throw new Error("not an npm audit report: metadata.vulnerabilities is missing");
  }
  return blocking.flatMap((severity) => {
    const count = counts[severity];
    if (typeof count !== "number") {
      throw new Error(`npm audit report has no "${severity}" severity count — npm's report shape changed; re-review this gate`);
    }
    return count > 0 ? [{ severity, count }] : [];
  });
}

/**
 * Stdin text → parsed audit report, fail-closed every step of the way.
 * Exported so the failure paths are testable without a real pipe.
 *
 * @param {string} raw
 * @param {{ maxBytes?: number }} [options]
 * @returns {object} the parsed report
 */
export function parseAuditInput(raw, { maxBytes = MAX_INPUT_BYTES } = {}) {
  if (raw.trim() === "") {
    throw new Error("empty stdin — npm audit produced no report (registry unreachable? npm ci drifted?)");
  }
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new Error(`audit report exceeds ${maxBytes} bytes — refusing to parse; is stdin actually npm audit output?`);
  }
  let report;
  try {
    report = JSON.parse(raw);
  } catch (error) {
    throw new Error(`stdin is not valid JSON: ${error.message}`);
  }
  // npm emits `{"error": {summary, detail, …}}` when IT fails (network, bad
  // lockfile state). Treating that as clean would make an outage a green gate.
  if (report !== null && typeof report === "object" && "error" in report && report.error != null) {
    const detail = typeof report.error === "object"
      ? (report.error.summary ?? report.error.message ?? JSON.stringify(report.error))
      : String(report.error);
    throw new Error(`npm audit itself failed: ${detail}`);
  }
  return report;
}

async function main() {
  let blocked;
  let totals;
  try {
    const report = parseAuditInput(readFileSync(0, "utf8"));
    blocked = auditVerdict(report);
    totals = report.metadata.vulnerabilities;
  } catch (error) {
    console.error(`✗ production-audit gate: ${error.message}`);
    console.error("  (expected `npm audit --omit=dev --json` on stdin — the gate fails closed, not open.)");
    process.exitCode = 1;
    return;
  }

  if (blocked.length === 0) {
    const at = (severity) => totals[severity] ?? 0;
    console.log(
      `✓ production dependency audit: 0 critical / 0 high — ratchet holds` +
        ` (moderate ${at("moderate")}, low ${at("low")}, info ${at("info")}, total ${at("total")}).`
    );
    return;
  }

  console.error(
    `✗ production dependency audit found ${blocked.map(({ severity, count }) => `${count} ${severity}`).join(" + ")} finding(s) — the 0/0 ratchet is broken.`
  );
  for (const { severity, count } of blocked) console.error(`    ${severity}: ${count}`);
  console.error("  Fix: run `npm audit` for the advisories, then bump or add scoped overrides in package.json.");
  console.error("  To accept a finding deliberately, change BLOCKING_SEVERITIES in scripts/audit-prod-gate.mjs");
  console.error("  in a reviewed change — never mask this step in ci.yml.");
  process.exitCode = 1;
}

// Only act when executed directly — the module is imported by its test
// (and by check:scripts' import probe, which is why the guard is mandatory).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
