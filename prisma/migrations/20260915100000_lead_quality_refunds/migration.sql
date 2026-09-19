-- Phase 1: worker lead-quality protection. Decisions never mutate the original spend.
CREATE TABLE "LeadRefundRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "offerId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "requestedCredits" INTEGER NOT NULL,
  "approvedCredits" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "evidence" TEXT,
  "adminNote" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "decidedBy" TEXT,
  CONSTRAINT "LeadRefundRequest_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LeadOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadRefundRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeadRefundRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "LeadRefundRequest_offerId_key" ON "LeadRefundRequest"("offerId");
CREATE INDEX "LeadRefundRequest_status_submittedAt_idx" ON "LeadRefundRequest"("status", "submittedAt");
CREATE INDEX "LeadRefundRequest_workerId_submittedAt_idx" ON "LeadRefundRequest"("workerId", "submittedAt");
CREATE INDEX "LeadRefundRequest_leadId_idx" ON "LeadRefundRequest"("leadId");
