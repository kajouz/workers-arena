import { inboxAdapterMode } from "./notifications";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * COMPLETION AUTO-CONFIRM ENGINE (ENHANCEMENT-PLAN §2.3)
 * ────────────────────────────────────────────────────────────────────────────
 * The customer-confirms-completion trust fix: a worker's "completed" flip is
 * STAGED (status completionPending) until the customer confirms it — so
 * fake-COMPLETED noise can't pollute the funnel, ratings, and no-show stats.
 * A staged completion the customer never confirms would otherwise hang
 * forever, so this cron AUTO-CONFIRMS it after BOOKING_COMPLETION_CONFIRM_GRACE_HOURS
 * (72h): the job flips to completed (system actor), net earnings credit the
 * worker's ledger, and the customer gets the completion receipt.
 *
 * Idempotent: each confirm is a CAS on the COMPLETION_PENDING status (a
 * concurrent customer confirm or overlapping cron run loses the race and is
 * skipped), and a completed booking is never rescanned.
 *
 * Invoke via GET /api/cron/completions (CRON_SECRET-gated) from the same
 * scheduler that runs the reminders / recurring / request-SLA crons.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface CompletionAutoConfirmRun {
  /** Staged completions auto-confirmed this pass. */
  autoConfirmed: number;
}

/**
 * Run the grace pass for the current adapter mode. Safe to call from a cron
 * job every hour (idempotent by the CAS rules above).
 */
export async function runCompletionAutoConfirmEngine(now = new Date()): Promise<CompletionAutoConfirmRun> {
  const autoConfirmed =
    inboxAdapterMode() === "prisma"
      ? await (await import("./prisma-repo")).prismaAutoConfirmCompletions(now)
      : await (await import("./bookings")).demoAutoConfirmCompletions(now);
  return { autoConfirmed };
}
