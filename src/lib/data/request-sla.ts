import { ACTION_CODES, logAdminActivity } from "./activity";
import { inboxAdapterMode } from "./notifications";
import { BOOKING_SLA_EXPIRE_HOURS, type RequestSlaRun } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REQUEST SLA ENGINE (ENHANCEMENT-PLAN §2.2)
 * ────────────────────────────────────────────────────────────────────────────
 * A REQUESTED booking the worker hasn't answered is dead air for both sides —
 * the customer waits in the dark and the slot stays reserved. This cron
 * NUDGES the worker once the request has sat past BOOKING_SLA_NUDGE_HOURS and
 * AUTO-EXPIRES it past BOOKING_SLA_EXPIRE_HOURS: the request closes, the slot
 * frees back to AVAILABLE (the cancel mechanics), and the customer is told.
 *
 * Both adapters return the same RequestSlaRun shape; idempotency differs by
 * design — the demo dedupes nudges per process, the prisma adapter stamps
 * Booking.lastSlaNudgeAt with a CAS (the lastReminderSent pattern), so
 * overlapping cron invocations can never double-nudge, and a CANCELLED
 * booking is never scanned again. The engine logs each auto-expiry to the
 * admin activity feed (BOOKING_CANCELLED) so the funnel's cancelled bucket
 * and Recent activity keep telling one story.
 *
 * Invoke via GET /api/cron/requests (CRON_SECRET-gated) from the same
 * scheduler that runs /api/cron/reminders and /api/cron/recurring.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Run the Request-SLA pass for the current adapter mode. Safe to call from a
 * cron job every hour (nudges/expiries are idempotent by the rules above).
 */
export async function runRequestSlaEngine(now = new Date()): Promise<RequestSlaRun> {
  const run: RequestSlaRun =
    inboxAdapterMode() === "prisma"
      ? await (await import("./prisma-repo")).prismaRunRequestSla(now)
      : await (await import("./bookings")).demoRunRequestSla(now);

  // Feed lockstep — an auto-expired request is a real cancel: the admin
  // funnel counts it, so Recent activity must show it too (mirrors how the
  // seam logs user-driven cancels).
  for (const number of run.expiredNumbers) {
    await logAdminActivity({
      code: ACTION_CODES.BOOKING_CANCELLED,
      actionEn: `System auto-cancelled ${number} — no worker response within ${BOOKING_SLA_EXPIRE_HOURS}h`,
      actionAr: `ألغى النظام تلقائياً ${number} — لا رد من العامل خلال ${BOOKING_SLA_EXPIRE_HOURS} ساعة`,
      actor: "System",
      type: "booking",
      bookingNo: number,
    });
  }

  return run;
}
