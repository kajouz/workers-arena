import { NextResponse } from "next/server";
import { runRequestSlaEngine } from "@/lib/data/request-sla";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/requests — Request-SLA cron (ENHANCEMENT-PLAN §2.2): REQUESTED
 * bookings are nudged (worker) after BOOKING_SLA_NUDGE_HOURS and auto-expired
 * (slot freed, customer notified) after BOOKING_SLA_EXPIRE_HOURS.
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer), same
 * CRON_SECRET as /api/cron/reminders and /api/cron/recurring:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/requests
 *
 * Idempotent: the nudge stamps Booking.lastSlaNudgeAt with a CAS so a re-run
 * can never double-nudge; expired bookings are CANCELLED and never rescanned.
 * Response: `{ ok, nudged, expired, scanned, expiredNumbers }`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await runRequestSlaEngine();
  return NextResponse.json({ ok: true, ...run });
}
