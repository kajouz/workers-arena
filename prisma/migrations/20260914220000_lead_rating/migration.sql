-- CreateTable
CREATE TABLE "LeadRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offerId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "quality" INTEGER NOT NULL,
    "reason" TEXT,
    "reasonAr" TEXT,
    "converted" BOOLEAN NOT NULL DEFAULT false,
    "reachable" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadRating_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LeadOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadRating_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadRating_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadRating_offerId_key" ON "LeadRating"("offerId");

-- CreateIndex
CREATE INDEX "LeadRating_workerId_createdAt_idx" ON "LeadRating"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadRating_grade_quality_idx" ON "LeadRating"("grade", "quality");

-- CreateIndex
CREATE INDEX "LeadRating_leadId_idx" ON "LeadRating"("leadId");
