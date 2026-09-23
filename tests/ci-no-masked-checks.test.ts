import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A masked check is worse than no check: the pipeline reports success and nobody
 * looks. That is not hypothetical here — `scripts/strip-tsconfig-dist-entries.mjs`
 * shipped a `SyntaxError` in its own header comment and was a no-op on every
 * invocation for its entire life, because CI ran it as
 *
 *     node scripts/strip-tsconfig-dist-entries.mjs || true
 *
 * This file pins the fix at the point where it can silently regress: the workflow
 * itself. It deliberately does NOT forbid `|| true` outright — `kill … || kill …
 * || true` in a cleanup block is correct, since a process that is already gone is
 * not a failure. It forbids masking the steps whose whole job is to VERIFY.
 */

const WORKFLOW = readFileSync(path.resolve(process.cwd(), ".github/workflows/ci.yml"), "utf8");

/** The workflow's steps, as `{ name, body }`, split on `- name:` boundaries. */
function steps(): { name: string; body: string }[] {
  return WORKFLOW.split(/\n\s*- name:\s*/)
    .slice(1)
    .map((chunk) => {
      const [firstLine = "", ...rest] = chunk.split("\n");
      return { name: firstLine.trim(), body: rest.join("\n") };
    });
}

const VERIFY_COMMANDS = [
  "npm run lint",
  "npm run typecheck",
  "npm run check:scripts",
  "npm run check:docs-links",
  "npm run validate:diagrams",
  "npm run db:smoke",
];

describe("CI does not mask its own checks", () => {
  it("runs the scripts gate as an enforced step", () => {
    // `scripts/**` is outside ESLint's reach, so this step is the only thing
    // standing between a broken script and `main`.
    const gate = steps().find((step) => /^\s*run:\s*npm run check:scripts\s*$/m.test(step.body));
    expect(gate, "no `npm run check:scripts` step in ci.yml").toBeDefined();
    expect(gate?.body).not.toContain("continue-on-error");
  });

  it("never marks a verification step continue-on-error", () => {
    const masked = steps()
      .filter((step) => /continue-on-error:\s*true/.test(step.body))
      .filter((step) => VERIFY_COMMANDS.some((command) => step.body.includes(command)))
      .map((step) => step.name);
    expect(masked).toEqual([]);
  });

  it("never pipes a verification command into `|| true`", () => {
    const masked = VERIFY_COMMANDS.filter((command) =>
      new RegExp(`${command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*\\|\\| true`).test(WORKFLOW)
    );
    expect(masked).toEqual([]);
  });

  it("leaves the cleanup step's process-kill guard alone", () => {
    // The one legitimate `|| true`: killing a pid that already exited is not an
    // error. Asserting it stays proves the rule above is narrow, not blanket.
    expect(WORKFLOW).toMatch(/kill[^\n]*\|\| kill[^\n]*\|\| true/);
  });

  it("still hides nothing about the strip step specifically", () => {
    expect(WORKFLOW).toContain("node scripts/strip-tsconfig-dist-entries.mjs");
    expect(WORKFLOW).not.toMatch(/strip-tsconfig-dist-entries\.mjs[^\n]*\|\| true/);
  });
});
