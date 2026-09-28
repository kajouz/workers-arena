import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { isStreamEnabled } from "@/lib/data/revenue-settings";
import { getSessionWorker } from "@/lib/data/authz";
import { getWorkerCreditBalance } from "@/lib/data/credit-ledger";

/**
 * GET /api/credits/balance
 *
 * The signed-in worker's platform credit position, DERIVED from the append-only
 * ledger (`WorkerCreditEntry`) rather than a hard-coded number — the same source
 * the lead marketplace debits when a worker buys a lead, so the dashboard card
 * and the board can never disagree.
 *
 * Requires authentication as worker or admin.
 */

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!await isStreamEnabled("credits")) {
      return NextResponse.json({ error: "Credits system is disabled" }, { status: 403 });
    }

    // Only the signed-in worker's own position. Admins, customers and
    // companies hold no credits — an empty position is honest, whereas someone
    // else's balance would not be.
    const worker = await getSessionWorker(session);
    const ledger = worker
      ? await getWorkerCreditBalance(worker.id)
      : { workerId: session.id, balance: 0, granted: 0, spent: 0, refunded: 0 };

    return NextResponse.json({
      balance: {
        workerId: ledger.workerId,
        balance: ledger.balance,
        // The card's labels predate the ledger; map them onto real rows so no
        // number on the dashboard is invented (granted = credits added).
        totalPurchased: ledger.granted,
        totalSpent: ledger.spent,
        totalRefunded: ledger.refunded,
        expiresAt: null,
        lastActivityAt: ledger.lastActivityAt ?? null,
      },
    });
  } catch (error) {
    console.error("Error fetching credit balance:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
