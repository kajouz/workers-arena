/**
 * PLATFORM CREDIT LEDGER — Prisma adapter (real mode). Append-only rows in
 * `WorkerCreditEntry`; the balance is always derived, never stored, so a
 * replicated/replayed write cannot desync a worker's credits.
 */

import { getPrisma } from "@/lib/server/prisma";
import { creditBalanceFrom, type CreditLedgerEntry, type CreditEntryKind, type GrantCreditsInput, type WorkerCreditBalance } from "./credit-ledger";

/** Structural row shape (tests need no generated client for fixtures). */
export interface CreditEntryRow {
  id: string;
  workerId: string;
  kind: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  promotionId: string | null;
  offerId: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export function toDomainCreditEntry(row: CreditEntryRow): CreditLedgerEntry {
  return {
    id: row.id,
    workerId: row.workerId,
    kind: row.kind as CreditEntryKind,
    amount: row.amount,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    ...(row.promotionId ? { promotionId: row.promotionId } : {}),
    ...(row.offerId ? { offerId: row.offerId } : {}),
    ...(row.createdBy ? { createdBy: row.createdBy } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

async function entriesFor(workerId: string): Promise<CreditLedgerEntry[]> {
  const rows = await getPrisma().workerCreditEntry.findMany({
    where: { workerId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => toDomainCreditEntry(r as CreditEntryRow));
}

/**
 * Append a credit entry. A `promotionId` makes it idempotent per worker: the
 * unique (workerId, promotionId) index rejects a second grant of the same
 * campaign, and the P2002 is swallowed into "already granted" (the same
 * compare-and-swap discipline the rest of the money paths use).
 */
export async function prismaGrantCredits(input: GrantCreditsInput): Promise<CreditLedgerEntry | null> {
  const amount = Math.trunc(input.amount);
  if (!amount) return null;
  const prisma = getPrisma();

  // Idempotency: one entry per reference (a promotion bonus, or a lead offer
  // that was paid for) — a retried confirm/purchase returns the original row.
  const referenceWhere = input.promotionId
    ? { workerId: input.workerId, promotionId: input.promotionId }
    : input.offerId
      ? { workerId: input.workerId, offerId: input.offerId }
      : null;
  if (referenceWhere) {
    const existing = await prisma.workerCreditEntry.findFirst({ where: referenceWhere });
    if (existing) return toDomainCreditEntry(existing as CreditEntryRow);
  }

  const balance = creditBalanceFrom(await entriesFor(input.workerId));
  try {
    const row = await prisma.workerCreditEntry.create({
      data: {
        workerId: input.workerId,
        kind: input.kind ?? "grant",
        amount,
        balanceAfter: balance.balance + amount,
        reason: input.reason,
        promotionId: input.promotionId ?? null,
        offerId: input.offerId ?? null,
        createdBy: input.createdBy ?? null,
        ...(input.at ? { createdAt: new Date(input.at) } : {}),
      },
    });
    return toDomainCreditEntry(row as CreditEntryRow);
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002" && referenceWhere) {
      const existing = await prisma.workerCreditEntry.findFirst({ where: referenceWhere });
      return existing ? toDomainCreditEntry(existing as CreditEntryRow) : null;
    }
    throw error;
  }
}

export async function prismaGetWorkerCreditBalance(workerId: string): Promise<WorkerCreditBalance> {
  return { ...creditBalanceFrom(await entriesFor(workerId)), workerId };
}

export async function prismaListCreditLedger(limit = 50, workerId?: string): Promise<CreditLedgerEntry[]> {
  const rows = await getPrisma().workerCreditEntry.findMany({
    where: workerId ? { workerId } : undefined,
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.trunc(limit)),
  });
  return rows.map((r) => toDomainCreditEntry(r as CreditEntryRow));
}
