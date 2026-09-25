import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runRequestSlaEngine } from "@/lib/data/request-sla";
import { expireQuoteRequests } from "@/lib/data/repo";
import { sweepExpiredOtpChallenges } from "@/lib/data/guest-otp";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/requests — Request-SLA cron (ENHANCEMENT-PLAN §2.2): REQUESTED
 * bookings are nudged (worker) after BOOKING_SLA_NUDGE_HOURS and auto-expired
 * (slot freed, customer notified) after BOOKING_SLA_EXPIRE_HOURS. The same
 * pass also expires multi-candidate quote jobs (docs/multi-candidate-quotes.md)
 * past QUOTE_SLA_MS, declining their open bids (both adapters return a count).
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer), same
 * CRON_SECRET as /api/cron/reminders and /api/cron/recurring:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/requests
 *
 * Idempotent: the nudge stamps Booking.lastSlaNudgeAt with a CAS so a re-run
 * can never double-nudge; expired bookings are CANCELLED and never rescanned;
 * expired quote jobs flip to EXPIRED once. The same pass deletes expired
 * guest-OTP challenges (a dead challenge must not linger with its hash in the
 * table — verification reads `expiresAt`, so this is hygiene, not correctness).
 * Response:
 * `{ ok, nudged, expired, scanned, expiredNumbers, quotesExpired, otpChallengesDeleted }`.
 */
export async function GET(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const run = await runRequestSlaEngine();
  const quotesExpired = await expireQuoteRequests();
  const otpChallengesDeleted = await sweepExpiredOtpChallenges();
  return NextResponse.json({ ok: true, ...run, quotesExpired, otpChallengesDeleted });
}
