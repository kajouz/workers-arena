import type { RecurringFrequency } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * RECURRING BOOKINGS — PURE GENERATOR (M1 — docs/ENHANCEMENT-PLAN.md §7 #1)
 * ────────────────────────────────────────────────────────────────────────────
 * Pure + injectable so tests can assert exact dates without a clock. Both
 * adapters (demo now, prisma in the next wave) share this single cadence
 * source so they can never drift.
 *
 * Rules:
 *   weekly   → +7 days
 *   biweekly → +14 days
 *   monthly  → same day-of-month, clamped to the target month's length
 *              (Jan 31 → Feb 28 → Mar 28: the day-of-month sticks at the
 *              clamped value rather than re-walking — a deliberate, documented
 *              simplification for M1).
 * Every occurrence keeps the anchor's time-of-day.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** How many future occurrences a contract materializes on accept (M1). */
export const RECURRING_OCCURRENCE_COUNT = 4;

function nextOccurrence(from: Date, frequency: RecurringFrequency): Date {
  if (frequency === "weekly") return new Date(from.getTime() + 7 * 24 * 3600 * 1000);
  if (frequency === "biweekly") return new Date(from.getTime() + 14 * 24 * 3600 * 1000);
  // monthly — same day-of-month, clamped to the target month's length.
  const day = from.getDate();
  const target = new Date(from.getFullYear(), from.getMonth() + 1, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(day, lastDay),
    from.getHours(),
    from.getMinutes(),
    from.getSeconds(),
    from.getMilliseconds()
  );
}

/**
 * The next `count` occurrence start-times after the anchor (exclusive of the
 * anchor itself — the anchor IS the first occurrence, materialized by the
 * request). Returns ISO strings, ascending.
 */
export function generateRecurringOccurrences(
  anchorStart: string,
  frequency: RecurringFrequency,
  count: number
): string[] {
  const results: string[] = [];
  let d = new Date(anchorStart);
  for (let i = 0; i < count; i++) {
    d = nextOccurrence(d, frequency);
    results.push(d.toISOString());
  }
  return results;
}
