-- ────────────────────────────────────────────────────────────────────────────
-- WorkersArena Guarantee claims (revenue plan Step 5 — more customers)
-- ────────────────────────────────────────────────────────────────────────────
-- Jobs booked and fully paid through WorkersArena are covered: if the work is
-- faulty and reported within 7 days of completion, the platform sends a worker
-- back to fix it or refunds up to $100. One claim per booking; an admin
-- resolves it as redo / refunded / rejected. Terms: src/lib/data/guarantee.ts.
-- ────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "GuaranteeClaim" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'open',
    "refundMinor" INTEGER,
    "resolutionNote" TEXT,
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "GuaranteeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuaranteeClaim_bookingId_key" ON "GuaranteeClaim"("bookingId");

-- CreateIndex
CREATE INDEX "GuaranteeClaim_status_createdAt_idx" ON "GuaranteeClaim"("status", "createdAt");
