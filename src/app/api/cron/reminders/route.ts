import { NextResponse } from "next/server";
import { runDueReminderEngine } from "@/lib/notifications/reminders";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders — reminder engine: subscription expiry reminders
 * plus the M4 booking "job starts tomorrow" notifications.
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer):
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/reminders
 *
 * Dispatch is idempotent: subscription reminders dedupe per worker+window;
 * booking reminders stamp Booking.lastReminderSent (compare-and-swap on the
 * null column) so overlapping cron invocations can never double-send. The
 * response includes `bookings: { dispatched, alreadySent, total }`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await runDueReminderEngine();
  return NextResponse.json({ ok: true, ...run });
}
