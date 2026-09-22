/**
 * Every cron route must be SCHEDULED, not just implemented.
 *
 * The repo shipped ten handlers under src/app/api/cron/ and registered one of
 * them in vercel.json. The other nine — recurring-occurrence generation,
 * booking reminders, completion auto-confirm, the request SLA clock, masked-
 * number expiry, the WhatsApp retry sweep and the pruning jobs — were dead
 * code in production: no scheduler ever called them, and nothing failed
 * loudly enough to notice. Worker earnings simply never auto-credited.
 *
 * A route with no schedule is the failure mode, so this test asserts the two
 * lists match exactly in both directions.
 *
 * THE REGISTRY MOVED. Schedules used to live in `vercel.json` `"crons"`, but
 * Vercel only allows DAILY cron expressions on the Hobby plan and a single
 * sub-daily entry blocked the entire production deploy ("Hobby accounts are
 * limited to daily cron jobs"). They now live in
 * `.github/workflows/cron.yml`, which calls the same endpoints over HTTPS with
 * the `x-cron-secret` header. The source of truth is that workflow file, so
 * that is what this guard reads — and it still fails loudly if a route is
 * implemented but nothing schedules it.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CRON_DIR = join(process.cwd(), "src/app/api/cron");
const WORKFLOW = join(process.cwd(), ".github/workflows/cron.yml");
const VERCEL_JSON = join(process.cwd(), "vercel.json");

/** Every cron handler on disk, as the path a scheduler would call. */
function implementedCronPaths(): string[] {
  return readdirSync(CRON_DIR)
    .filter((name) => statSync(join(CRON_DIR, name)).isDirectory())
    .filter((name) => {
      try {
        return statSync(join(CRON_DIR, name, "route.ts")).isFile();
      } catch {
        return false;
      }
    })
    .map((name) => `/api/cron/${name}`)
    .sort();
}

function workflowSource(): string {
  return readFileSync(WORKFLOW, "utf8");
}

/**
 * The `cron: "…"` entries under `on.schedule`. Parsed by pattern rather than
 * with a YAML parser: the shape is ours and stable, and a drift fails the
 * assertions below instead of silently checking nothing.
 */
function declaredSchedules(): string[] {
  return [...workflowSource().matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

/** The `/api/cron/*` endpoints the workflow actually calls. */
function scheduledCronPaths(): string[] {
  return [...workflowSource().matchAll(/\$BASE_URL(\/api\/cron\/[a-z-]+)/g)]
    .map((m) => m[1])
    .sort();
}

describe("cron registration", () => {
  it("schedules every implemented cron route", () => {
    const scheduled = new Set(scheduledCronPaths());
    const missing = implementedCronPaths().filter((p) => !scheduled.has(p));
    expect(
      missing,
      `These cron routes exist but nothing schedules them — add them to .github/workflows/cron.yml:\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("does not schedule a cron route that no longer exists", () => {
    const implemented = new Set(implementedCronPaths());
    const orphans = scheduledCronPaths().filter((p) => !implemented.has(p));
    expect(
      orphans,
      `The workflow calls paths with no handler:\n  ${orphans.join("\n  ")}`
    ).toEqual([]);
  });

  it("gives every scheduled job a well-formed 5-field cron expression", () => {
    const schedules = declaredSchedules();
    expect(schedules.length, "the workflow declares no schedules").toBeGreaterThan(0);
    for (const schedule of schedules) {
      const fields = schedule.trim().split(/\s+/);
      expect(fields, `malformed schedule: "${schedule}"`).toHaveLength(5);
    }
  });

  it("binds every step to a declared schedule (no orphaned trigger)", () => {
    const declared = new Set(declaredSchedules());
    const used = new Set(
      [...workflowSource().matchAll(/env\.SCHEDULE\s*==\s*'([^']+)'/g)].map((m) => m[1])
    );
    const undeclared = [...used].filter((s) => !declared.has(s));
    expect(
      undeclared,
      `These step conditions name a schedule the workflow never triggers on — the job would never run:\n  ${undeclared.join("\n  ")}`
    ).toEqual([]);
  });

  it("schedules each endpoint exactly once", () => {
    const paths = scheduledCronPaths();
    expect(paths).toEqual([...new Set(paths)]);
  });

  it("keeps crons out of vercel.json (Hobby rejects sub-daily entries and blocks the deploy)", () => {
    const config = JSON.parse(readFileSync(VERCEL_JSON, "utf8"));
    expect(
      config.crons,
      'vercel.json declares "crons" again — on the Hobby plan any expression that runs more than once a day fails the production deploy. Schedule via .github/workflows/cron.yml instead.'
    ).toBeUndefined();
  });
});
