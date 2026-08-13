import { NextResponse } from "next/server";
import { runCompletionAutoConfirmEngine } from "@/lib/data/completion-auto-confirm";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/completions — completion auto-confirm cron (§2.3): staged
 * completions (COMPLETION_PENDING) past BOOKING_COMPLETION_CONFIRM_GRACE_HOURS
 * (72h) auto-confirm — the job flips to COMPLETED, net earnings credit the
 * worker's ledger, and the customer gets the completion receipt.
 *
 * Call from a scheduler (Vercel Cron, GitHub Actions, systemd timer), same
 * CRON_SECRET as the other cron endpoints:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/completions
 *
 * Idempotent: each confirm is a CAS on the COMPLETION_PENDING status.
 * Response: `{ ok, autoConfirmed }`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ??
    new URL(req.url).searchParams.get("secret");

  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const run = await runCompletionAutoConfirmEngine();
  return NextResponse.json({ ok: true, ...run });
}
