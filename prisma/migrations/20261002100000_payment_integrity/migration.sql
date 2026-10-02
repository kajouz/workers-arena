-- D1: the settlement top-up (ADJUSTMENT) shares the booking with its EARNING
-- row, so a unique index on bookingId blocked it. Idempotency moves to an
-- explicit credit key.
ALTER TABLE "WorkerLedgerEntry" ADD COLUMN "creditKey" TEXT;
UPDATE "WorkerLedgerEntry" SET "creditKey" = 'earning:' || "bookingId"
  WHERE "bookingId" IS NOT NULL AND "kind" = 'EARNING';
DROP INDEX "WorkerLedgerEntry_bookingId_key";
CREATE UNIQUE INDEX "WorkerLedgerEntry_creditKey_key" ON "WorkerLedgerEntry"("creditKey");
CREATE INDEX "WorkerLedgerEntry_bookingId_idx" ON "WorkerLedgerEntry"("bookingId");

-- Evidence is frozen once a payment is confirmed.
ALTER TABLE "PaymentReceipt" ADD COLUMN "lockedAt" TIMESTAMP(3);

-- D4: race-free invoice numbering.
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,
    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- Never-pruned money audit trail.
CREATE TABLE "PaymentAuditEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "reference" TEXT,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "amountMinor" INTEGER,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAuditEvent_paymentId_createdAt_idx" ON "PaymentAuditEvent"("paymentId", "createdAt");
CREATE INDEX "PaymentAuditEvent_createdAt_idx" ON "PaymentAuditEvent"("createdAt");
