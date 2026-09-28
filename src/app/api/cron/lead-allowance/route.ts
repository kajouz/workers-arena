import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { cronRoute } from "@/lib/cron-route";
import { getAllWorkers } from "@/lib/data/repo";
import { runMonthlyLeadAllowance } from "@/lib/data/lead-allowance-run";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/lead-allowance — the plans' monthly lead credits
 * (src/lib/data/lead-allowance.ts). Daily: the first run of a month expires
 * last month's unspent allowance and grants this month's; later runs pick up
 * workers whose plan started since. Idempotent per worker per month.
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/lead-allowance
 */
async function handleGet(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const workers = await getAllWorkers();
  const run = await runMonthlyLeadAllowance(
    workers.map((w) => ({ id: w.id, subscription: w.subscription }))
  );
  return NextResponse.json({ ok: true, ...run });
}

export const GET = cronRoute("lead-allowance", handleGet);
