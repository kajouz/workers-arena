-- §11 — the lead rebate (docs/lead-marketplace.md): when a job whose lead was
-- BOUGHT completes, the platform fee on it is reduced by the lead's own price.
-- Additive: a new append-only table plus a display column on Booking (default 0,
-- so every existing booking reads back as "no rebate applied").

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "leadRebateMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "LeadRebate" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "leadCostCredits" INTEGER NOT NULL,
    "leadCostMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "rebateMinor" INTEGER NOT NULL,
    "effectiveFeeMinor" INTEGER NOT NULL,
    "pctBps" INTEGER NOT NULL,
    "maxMinor" INTEGER,
    "limitedBy" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRebate_pkey" PRIMARY KEY ("id")
);

-- One rebate per completed job — the same idempotency the EARNING ledger row
-- gets from its @@unique([bookingId]).
CREATE UNIQUE INDEX "LeadRebate_bookingId_key" ON "LeadRebate"("bookingId");
CREATE INDEX "LeadRebate_workerId_createdAt_idx" ON "LeadRebate"("workerId", "createdAt");
CREATE INDEX "LeadRebate_leadId_idx" ON "LeadRebate"("leadId");
CREATE INDEX "LeadRebate_offerId_idx" ON "LeadRebate"("offerId");

-- AddForeignKey
ALTER TABLE "LeadRebate" ADD CONSTRAINT "LeadRebate_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadRebate" ADD CONSTRAINT "LeadRebate_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
