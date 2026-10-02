-- Payment workflow v2 (docs/PAYMENT-COMMS-ACCOUNTING-PLAN.md §3).

-- Refund cash-out tracking for the manual rails.
ALTER TABLE "Payment" ADD COLUMN "refundState" TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "refundTxnId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "refundSentAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "refundSentBy" TEXT;
CREATE UNIQUE INDEX "Payment_refundTxnId_key" ON "Payment"("refundTxnId");

-- Guest invoices: the bill-to snapshot carries the identity.
ALTER TABLE "Invoice" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "billToName" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billToPhone" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billToEmail" TEXT;

-- Cash-settlement confirmation and balance dunning.
ALTER TABLE "Booking" ADD COLUMN "settledOutsideConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "settledOutsideDisputedAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "settlementDueAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "dunningStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "dunningAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "settlementWrittenOffAt" TIMESTAMP(3);

-- Amounts actually received against a manual payment (maker–checker).
CREATE TABLE "PaymentTranche" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "externalTxnId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "hadReceipt" BOOLEAN NOT NULL DEFAULT false,
    "enteredById" TEXT,
    "enteredBy" TEXT,
    "approvedById" TEXT,
    "approvedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentTranche_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentTranche_externalTxnId_key" ON "PaymentTranche"("externalTxnId");
CREATE INDEX "PaymentTranche_paymentId_idx" ON "PaymentTranche"("paymentId");
CREATE INDEX "PaymentTranche_status_createdAt_idx" ON "PaymentTranche"("status", "createdAt");
ALTER TABLE "PaymentTranche" ADD CONSTRAINT "PaymentTranche_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_userId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
