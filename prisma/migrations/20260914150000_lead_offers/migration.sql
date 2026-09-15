-- §7–§10 — the qualified lead marketplace (docs/lead-marketplace.md).
-- Additive: one new table (LeadOffer) plus the credit ledger's offer reference,
-- so existing quote requests, bookings and credit rows are untouched.

-- CreateTable
CREATE TABLE "LeadOffer" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "leadNumber" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "priceCredits" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offered',
    "exclusive" BOOLEAN NOT NULL DEFAULT true,
    "contactReveal" TEXT,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "creditEntryId" TEXT,

    CONSTRAINT "LeadOffer_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "WorkerCreditEntry" ADD COLUMN "offerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "LeadOffer_leadId_workerId_key" ON "LeadOffer"("leadId", "workerId");

-- CreateIndex
CREATE INDEX "LeadOffer_workerId_status_expiresAt_idx" ON "LeadOffer"("workerId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "LeadOffer_leadId_status_idx" ON "LeadOffer"("leadId", "status");

-- CreateIndex
CREATE INDEX "LeadOffer_status_expiresAt_idx" ON "LeadOffer"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCreditEntry_workerId_offerId_key" ON "WorkerCreditEntry"("workerId", "offerId");

-- CreateIndex
CREATE INDEX "WorkerCreditEntry_offerId_idx" ON "WorkerCreditEntry"("offerId");

-- AddForeignKey
ALTER TABLE "LeadOffer" ADD CONSTRAINT "LeadOffer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadOffer" ADD CONSTRAINT "LeadOffer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
