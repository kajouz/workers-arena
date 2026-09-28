import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { cronRoute } from "@/lib/cron-route";
import { getAllWorkers, getSettlementReconciliation } from "@/lib/data/repo";
import { collectFeeClaims, runWalletAutoRenew } from "@/lib/data/wallet-payments";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/wallet — the prepaid wallet's daily run (src/lib/data/wallet-payments.ts):
 *   1. collect outstanding commission on cash-settled jobs from each worker's
 *      wallet (what the wallet covers; the rest waits for a top-up);
 *   2. renew plans ending within a day (or up to three days ago) from the
 *      wallet, unless the worker switched auto-renew off.
 * Runs before the 07:00 reminders so a renewed plan gets no "expiring" nudge.
 * Every charge is keyed in the ledger, so a re-run never charges twice.
 *
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/wallet
 */
async function handleGet(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const claims = await collectFeeClaims(await getSettlementReconciliation(365));
  const renewals = await runWalletAutoRenew(await getAllWorkers());
  return NextResponse.json({ ok: true, claims, renewals });
}

export const GET = cronRoute("wallet", handleGet);
