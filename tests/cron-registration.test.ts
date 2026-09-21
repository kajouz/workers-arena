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
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CRON_DIR = join(process.cwd(), "src/app/api/cron");
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

interface VercelCron {
  path: string;
  schedule: string;
}

function scheduledCrons(): VercelCron[] {
  return (JSON.parse(readFileSync(VERCEL_JSON, "utf8")).crons ?? []) as VercelCron[];
}

describe("cron registration", () => {
  it("schedules every implemented cron route", () => {
    const scheduled = new Set(scheduledCrons().map((c) => c.path));
    const missing = implementedCronPaths().filter((p) => !scheduled.has(p));
    expect(
      missing,
      `These cron routes exist but nothing schedules them — add them to vercel.json "crons":\n  ${missing.join("\n  ")}`
    ).toEqual([]);
  });

  it("does not schedule a cron route that no longer exists", () => {
    const implemented = new Set(implementedCronPaths());
    const orphans = scheduledCrons()
      .map((c) => c.path)
      .filter((p) => !implemented.has(p));
    expect(
      orphans,
      `vercel.json schedules paths with no handler:\n  ${orphans.join("\n  ")}`
    ).toEqual([]);
  });

  it("gives every scheduled cron a well-formed 5-field cron expression", () => {
    for (const cron of scheduledCrons()) {
      const fields = cron.schedule.trim().split(/\s+/);
      expect(fields, `${cron.path} has a malformed schedule: "${cron.schedule}"`).toHaveLength(5);
    }
  });

  it("registers no duplicate cron paths", () => {
    const paths = scheduledCrons().map((c) => c.path);
    expect(paths).toEqual([...new Set(paths)]);
  });
});
