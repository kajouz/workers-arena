-- Monetization §5/§6 — configurable platform fee rules + immutable snapshots
-- (docs/fee-rules.md). Additive only: two new tables, no existing column
-- changes, so the shipped 7% / min $5 / max $300 take rate keeps working and
-- historical bookings simply have no snapshot row yet.

-- CreateTable
CREATE TABLE "FeeRuleSet" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "config" JSONB NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeRuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeeSnapshot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "customerId" TEXT,
    "plan" TEXT,
    "planTier" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "minMinor" INTEGER NOT NULL,
    "maxMinor" INTEGER,
    "fixedMinor" INTEGER NOT NULL DEFAULT 0,
    "subtotalMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "minApplied" BOOLEAN NOT NULL DEFAULT false,
    "maxApplied" BOOLEAN NOT NULL DEFAULT false,
    "exempt" BOOLEAN NOT NULL DEFAULT false,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promotionId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeeRuleSet_version_key" ON "FeeRuleSet"("version");

-- CreateIndex
CREATE INDEX "FeeRuleSet_isActive_version_idx" ON "FeeRuleSet"("isActive", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeeSnapshot_bookingId_key" ON "PlatformFeeSnapshot"("bookingId");

-- CreateIndex
CREATE INDEX "PlatformFeeSnapshot_workerId_computedAt_idx" ON "PlatformFeeSnapshot"("workerId", "computedAt");

-- CreateIndex
CREATE INDEX "PlatformFeeSnapshot_ruleVersion_idx" ON "PlatformFeeSnapshot"("ruleVersion");

-- CreateIndex
CREATE INDEX "PlatformFeeSnapshot_computedAt_idx" ON "PlatformFeeSnapshot"("computedAt");

-- AddForeignKey
ALTER TABLE "PlatformFeeSnapshot" ADD CONSTRAINT "PlatformFeeSnapshot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
