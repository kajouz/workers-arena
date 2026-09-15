-- §20 seed (docs/fee-rules.md → promotions) — the append-only platform credit
-- ledger. Additive only: one new table, no column changes, so existing worker
-- ledgers and payouts are untouched.

-- CreateTable
CREATE TABLE "WorkerCreditEntry" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "promotionId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerCreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCreditEntry_workerId_promotionId_key" ON "WorkerCreditEntry"("workerId", "promotionId");

-- CreateIndex
CREATE INDEX "WorkerCreditEntry_workerId_createdAt_idx" ON "WorkerCreditEntry"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerCreditEntry_promotionId_idx" ON "WorkerCreditEntry"("promotionId");

-- AddForeignKey
ALTER TABLE "WorkerCreditEntry" ADD CONSTRAINT "WorkerCreditEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
