import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { auditVerdict, parseAuditInput, BLOCKING_SEVERITIES } from "../scripts/audit-prod-gate.mjs";

/**
 * The production-audit ratchet. The dependency-security pass left the
 * production tree at 0 critical / 0 high; this gate is what keeps it there.
 * The workflow contract it enforces lives at the bottom of this file: the
 * audit step is unmasked, audits only the production tree, and runs inside
 * the lint job — which build, e2e and deploy-production all `needs`.
 */

const SCRIPT = fileURLToPath(new URL("../scripts/audit-prod-gate.mjs", import.meta.url));
const WORKFLOW = readFileSync(fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)), "utf8");

const vulnerabilities = (overrides: Record<string, number>) => ({
  info: 0,
  low: 0,
  moderate: 0,
  high: 0,
  critical: 0,
  total: 0,
  ...overrides,
});
const report = (vulns: Record<string, number>) => ({ metadata: { vulnerabilities: vulnerabilities(vulns) } });

describe("auditVerdict", () => {
  it("passes the clean production tree", () => {
    expect(auditVerdict(report({}))).toEqual([]);
  });

  it("blocks a high finding", () => {
    expect(auditVerdict(report({ high: 2, total: 2 }))).toEqual([{ severity: "high", count: 2 }]);
  });

  it("blocks a critical finding", () => {
    expect(auditVerdict(report({ critical: 1, total: 1 }))).toEqual([{ severity: "critical", count: 1 }]);
  });

  it("blocks every blocking severity, in BLOCKING_SEVERITIES order", () => {
    expect(BLOCKING_SEVERITIES).toEqual(["critical", "high"]);
    expect(auditVerdict(report({ high: 2, critical: 1, total: 3 }))).toEqual([
      { severity: "critical", count: 1 },
      { severity: "high", count: 2 },
    ]);
  });

  it("does NOT block dev-only moderates — the accepted vitest residue", () => {
    // A dev-only finding must never block: a full-tree report (local
    // `npm audit --json`) passes the gate — only critical/high block, whatever
    // carries them. (The vitest-3→5 upgrade cleared the last two dev-tree
    // moderates, but the severities rule itself is version-independent.)
    expect(auditVerdict(report({ moderate: 2, total: 2 }))).toEqual([]);
  });
});

describe("parseAuditInput", () => {
  it("parses a normal report", () => {
    expect(parseAuditInput(JSON.stringify(report({})))).toEqual(report({}));
  });

  it("fails closed on empty stdin", () => {
    expect(() => parseAuditInput("")).toThrow(/empty stdin/);
    expect(() => parseAuditInput("   \n")).toThrow(/empty stdin/);
  });

  it("fails closed on non-JSON stdin", () => {
    expect(() => parseAuditInput("npm ERR! code ECONNREFUSED")).toThrow(/not valid JSON/);
  });

  it("fails closed on npm's own error payload (registry outage, lockfile drift)", () => {
    const npmError = JSON.stringify({ error: { summary: "Unexpected end of JSON input while fetching", detail: "…" } });
    expect(() => parseAuditInput(npmError)).toThrow(/npm audit itself failed/);
  });

  it("accepts report-shaped input — schema validation is auditVerdict's job", () => {
    // parseAuditInput owns transport-level failures (empty, non-JSON, npm
    // errors, size); auditVerdict owns the report schema. The split keeps each
    // failure message naming exactly one thing.
    expect(parseAuditInput(JSON.stringify({ vulnerabilities: {} }))).toEqual({ vulnerabilities: {} });
    expect(parseAuditInput("{}")).toEqual({});
  });

  it("fails closed when metadata is missing", () => {
    expect(() => auditVerdict({})).toThrow(/not an npm audit report/);
    expect(() => auditVerdict(JSON.parse("{}"))).toThrow(/not an npm audit report/);
  });

  it("fails closed when npm's report shape drops a severity count", () => {
    const shapeChange = { metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, total: 0 } } };
    // BLOCKING_SEVERITIES iterates critical before high, so the first missing
    // blocking count is named first — either means the same shape change.
    expect(() => auditVerdict(shapeChange)).toThrow(/no "(critical|high)" severity count/);
  });
});

describe("the gate script over a real pipe", () => {
  const run = (stdin: string) =>
    spawnSync(process.execPath, [SCRIPT], { input: stdin, encoding: "utf8", timeout: 30_000 });

  it("exits 0 with a hold message on the clean tree", () => {
    const res = run(JSON.stringify(report({})));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("ratchet holds");
  });

  it("exits 1 naming the finding when a high appears", () => {
    const res = run(JSON.stringify(report({ high: 1, total: 1 })));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("ratchet is broken");
    expect(res.stderr).toContain("1 high");
  });

  it("exits 1 with a fail-closed message on empty stdin", () => {
    const res = run("");
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("empty stdin");
  });

  it("exits 1 on npm's error payload instead of passing silently", () => {
    const res = run(JSON.stringify({ error: { summary: "ECONNREFUSED" } }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("npm audit itself failed");
  });
});

describe("ci.yml wiring of the ratchet", () => {
  function steps(): { name: string; body: string }[] {
    return WORKFLOW.split(/\n\s*- name:\s*/)
      .slice(1)
      .map((chunk) => {
        const [firstLine = "", ...rest] = chunk.split("\n");
        return { name: firstLine.trim(), body: rest.join("\n") };
      });
  }

  it("runs the audit as an enforced, unmasked step", () => {
    const audit = steps().find((step) => step.name.startsWith("Production dependency audit"));
    expect(audit, "no production-audit step in ci.yml").toBeDefined();
    expect(audit?.body).toContain("npm audit --omit=dev --json");
    expect(audit?.body).toContain("node scripts/audit-prod-gate.mjs");
    expect(audit?.body).not.toContain("continue-on-error");
    expect(audit?.body).not.toContain("|| true");
  });

  it("audits only the production tree — no full-tree audit in CI", () => {
    // Every `npm audit` invocation in the workflow must be --omit=dev — CI's
    // contract is the production tree, and a full-tree audit would tie CI's
    // fate to dev-only advisories. Comment lines are ignored — prose may
    // mention the bare command.
    const code = WORKFLOW.split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    const bare = [...code.matchAll(/npm audit[^\n"']*/g)]
      .map(([command]) => command.trim())
      .filter((command) => !command.startsWith("npm audit --omit=dev"));
    expect(bare).toEqual([]);
  });

  it("runs after the pinned-npm install (npm 10 ignores the scoped overrides)", () => {
    // The pinned install lives in a step BODY ("npm install -g npm@…"), not a
    // step name, so both probes search the full step records.
    const records = steps();
    const auditIdx = records.findIndex((step) => step.name.startsWith("Production dependency audit"));
    const installIdx = records.findIndex((step) => step.body.includes("npm install -g npm@"));
    expect(auditIdx).toBeGreaterThan(-1);
    expect(installIdx).toBeGreaterThan(-1);
    expect(auditIdx).toBeGreaterThan(installIdx);
  });

  it("stays in the lint job, which deploy-production needs", () => {
    // If the step moved out of a job that gates the deploy, the ratchet would
    // be advisory again — this pins the job graph, not just the step.
    expect(WORKFLOW).toContain("needs: [lint, test, e2e, build]");
    const lintJob = WORKFLOW.slice(WORKFLOW.indexOf("lint:"), WORKFLOW.indexOf("test:"));
    expect(lintJob).toContain("Production dependency audit");
  });
});
