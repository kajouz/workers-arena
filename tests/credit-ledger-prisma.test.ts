import { describe, expect, it } from "vitest";

/**
 * Prisma mirror of the demo credit-ledger tests: LIVE-DB grant → ledger rows →
 * derived balance, including the idempotency that keeps a re-confirmed purchase
 * from double-granting a campaign bonus.
 *
 * Gated on a live DATABASE_URL (the fixture-only host skips it). Run it against
 * the local Postgres with the seed in place:
 *   DATABASE_URL=postgresql://… DEMO_MODE=false npx vitest run tests/credit-ledger-prisma.test.ts
 */
const hasLiveDb = Boolean(process.env.DATABASE_URL);
const describeLive = hasLiveDb ? describe : describe.skip;

// The ledger's adapter selector reads DEMO_MODE per call.
process.env.DEMO_MODE = "false";

import { getPrisma } from "../src/lib/server/prisma";
import { grantCredits, getWorkerCreditBalance, listCreditLedger } from "../src/lib/data/credit-ledger";

describeLive("credit ledger — prisma adapter (live DB)", () => {
  it("appends one row per promotion, derives the balance and survives a retry", async () => {
    const prisma = getPrisma();
    const worker = await prisma.worker.findUnique({ where: { slug: "khaled-al-harbi-plumbing" } });
    if (!worker) return; // requires the seeded worker

    const promotionId = `test-credit-${Date.now()}`;
    try {
      const first = await grantCredits({
        workerId: worker.id,
        amount: 15,
        reason: "prisma ledger test",
        promotionId,
      });
      expect(first?.id).toBeTruthy();
      expect(first?.balanceAfter).toBeTypeOf("number");

      // The retry returns the SAME row — a re-confirmed payment can't double-grant.
      const second = await grantCredits({
        workerId: worker.id,
        amount: 15,
        reason: "prisma ledger test",
        promotionId,
      });
      expect(second?.id).toBe(first?.id);

      const mine = (await listCreditLedger(50, worker.id)).filter((r) => r.promotionId === promotionId);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ kind: "grant", amount: 15, reason: "prisma ledger test" });

      // The balance is derived from the rows: granted − spent, never a stored
      // number that could drift from them.
      const balance = await getWorkerCreditBalance(worker.id);
      expect(balance.granted).toBeGreaterThanOrEqual(15);
      expect(balance.balance).toBe(Math.max(0, balance.granted - balance.spent));
    } finally {
      await prisma.workerCreditEntry.deleteMany({ where: { promotionId } });
    }
  });
});
