import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(
  path.resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8"
);

describe("nightly critical-flow environment isolation", () => {
  it("uses a disposable database distinct from the primary smoke database", () => {
    expect(WORKFLOW).toContain("CREATE DATABASE workers_arena_critical");
    expect(WORKFLOW).toContain(
      "postgresql://postgres:postgres@localhost:5432/workers_arena_critical?schema=public"
    );
    expect(WORKFLOW).toContain(
      "postgresql://postgres:postgres@localhost:5432/workers_arena_test?schema=public"
    );
  });

  it("gives critical flows their own relative Next dist directory", () => {
    expect(WORKFLOW).toContain(
      "NEXT_DIST_DIR: .data/.next-e2e-critical-${{ github.run_id }}"
    );
    expect(WORKFLOW).toContain(
      "ADMIN_ACTIVITY_FILE: .data/.next-e2e-critical-${{ github.run_id }}/activity.json"
    );
    expect(WORKFLOW).toContain(
      "PUSH_STORE_FILE: .data/.next-e2e-critical-${{ github.run_id }}/push-subscriptions.json"
    );
  });

  it("keeps the isolated server alive for the flow step and cleans it afterward", () => {
    expect(WORKFLOW).toContain('echo "CRITICAL_SERVER_PID=$SERVER_PID" >> "$GITHUB_ENV"');
    expect(WORKFLOW).toMatch(
      /- name: Stop critical-flows server and remove isolated artifacts\n\s+if: always\(\)/
    );
    expect(WORKFLOW).toContain('rm -rf "${CRITICAL_DIST_DIR:-.data/.next-e2e-critical-${GITHUB_RUN_ID}}"');
    // The strip step is NOT masked: it once swallowed a SyntaxError on every run
    // behind `|| true`, which is how the script stayed broken unnoticed. It is
    // covered by `check:scripts` now, so a failure here is real news.
    expect(WORKFLOW).toContain("node scripts/strip-tsconfig-dist-entries.mjs");
    expect(WORKFLOW).not.toMatch(/node scripts\/strip-tsconfig-dist-entries\.mjs[^\n]*\|\| true/);
  });
});
