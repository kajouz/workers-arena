import { inboxAdapterMode } from "./notifications";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * RECURRING GENERATION ENGINE (W2 — docs/ENHANCEMENT-PLAN.md §7 #1)
 * ────────────────────────────────────────────────────────────────────────────
 * Rolls a contract's cadence forward: for every ACTIVE contract whose first
 * occurrence has been accepted, materializes the occurrences due within the
 * lookahead window (now, now + RECURRING_LOOKAHEAD_DAYS] that don't exist yet,
 * each claiming a real AVAILABLE slot. The demo adapter materializes its fixed
 * count at accept time, so demo mode is a no-op here; the prisma adapter does
 * the work (prismaGenerateRecurringOccurrences). Idempotent — a second run
 * materializes nothing new, and the (recurringBookingId, startAt) unique index
 * is the concurrency backstop.
 *
 * Invoke via GET /api/cron/recurring (CRON_SECRET-gated) from the same
 * scheduler that runs /api/cron/reminders.
 * ────────────────────────────────────────────────────────────────────────────
 */

export interface RecurringGenerationRun {
  /** Contracts that gained at least one occurrence this run. */
  contracts: number;
  /** Occurrences materialized this run. */
  materialized: number;
}

/**
 * Run the generation pass for the current adapter mode. Demo mode no-ops
 * (parity: the demo materializes at accept); prisma mode defers to the
 * adapter. Safe to call from a cron job every day.
 */
export async function runRecurringGenerationEngine(now = new Date()): Promise<RecurringGenerationRun> {
  if (inboxAdapterMode() !== "prisma") return { contracts: 0, materialized: 0 };
  const { prismaGenerateRecurringOccurrences } = await import("./prisma-repo");
  return prismaGenerateRecurringOccurrences(now);
}
