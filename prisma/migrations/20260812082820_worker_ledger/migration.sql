-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('EARNING', 'WITHDRAWAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerStatus" AS ENUM ('POSTED', 'PENDING', 'PROCESSED', 'REJECTED');

-- CreateTable
CREATE TABLE "WorkerLedgerEntry" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "bookingId" TEXT,
    "kind" "LedgerKind" NOT NULL,
    "status" "LedgerStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkerLedgerEntry_workerId_createdAt_idx" ON "WorkerLedgerEntry"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkerLedgerEntry_status_idx" ON "WorkerLedgerEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerLedgerEntry_bookingId_key" ON "WorkerLedgerEntry"("bookingId");

-- AddForeignKey
ALTER TABLE "WorkerLedgerEntry" ADD CONSTRAINT "WorkerLedgerEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerLedgerEntry" ADD CONSTRAINT "WorkerLedgerEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
