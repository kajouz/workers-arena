import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

/**
 * TEMPORARY endpoint — applies ALL pending Prisma migrations by creating
 * missing tables. Call once, then DELETE this file and redeploy.
 */
const MIGRATIONS = [
  {
    name: "platform_fee_rules",
    check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'FeeRuleSet') as "exists"`,
    sql: `
      CREATE TABLE "FeeRuleSet" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "version" INTEGER NOT NULL,
        "currency" TEXT NOT NULL DEFAULT 'USD',
        "config" JSONB NOT NULL,
        "label" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "note" TEXT,
        "createdById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX "FeeRuleSet_version_key" ON "FeeRuleSet"("version");
      CREATE INDEX "FeeRuleSet_isActive_version_idx" ON "FeeRuleSet"("isActive", "version" DESC);
    `,
  },
  {
    name: "worker_credit_ledger",
    check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'WorkerCreditEntry') as "exists"`,
    sql: `
      CREATE TABLE "WorkerCreditEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "workerId" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "amount" INTEGER NOT NULL,
        "balanceAfter" INTEGER NOT NULL,
        "reason" TEXT NOT NULL,
        "promotionId" TEXT,
        "offerId" TEXT,
        "createdBy" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkerCreditEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "WorkerCreditEntry_workerId_promotionId_key" ON "WorkerCreditEntry"("workerId", "promotionId");
      CREATE UNIQUE INDEX "WorkerCreditEntry_workerId_offerId_key" ON "WorkerCreditEntry"("workerId", "offerId");
      CREATE INDEX "WorkerCreditEntry_workerId_createdAt_idx" ON "WorkerCreditEntry"("workerId", "createdAt");
      CREATE INDEX "WorkerCreditEntry_promotionId_idx" ON "WorkerCreditEntry"("promotionId");
      CREATE INDEX "WorkerCreditEntry_offerId_idx" ON "WorkerCreditEntry"("offerId");
    `,
  },
  {
    name: "lead_offers",
    check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LeadOffer') as "exists"`,
    sql: `
      CREATE TABLE "LeadOffer" (
        "id" TEXT NOT NULL PRIMARY KEY,
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
        CONSTRAINT "LeadOffer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "LeadOffer_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX "LeadOffer_workerId_status_expiresAt_idx" ON "LeadOffer"("workerId", "status", "expiresAt");
      CREATE INDEX "LeadOffer_leadId_status_idx" ON "LeadOffer"("leadId", "status");
      CREATE INDEX "LeadOffer_status_expiresAt_idx" ON "LeadOffer"("status", "expiresAt");
    `,
  },
  {
    name: "quote_request_is_emergency",
    check: `SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'QuoteRequest' AND column_name = 'isEmergency') as "exists"`,
    sql: `ALTER TABLE "QuoteRequest" ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false;`,
  },
  {
    name: "lead_rebate",
    check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LeadRebate') as "exists"`,
    sql: `
      CREATE TABLE "LeadRebate" (
        "id" TEXT NOT NULL PRIMARY KEY,
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
        CONSTRAINT "LeadRebate_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "LeadRebate_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "LeadRebate_bookingId_key" ON "LeadRebate"("bookingId");
      CREATE INDEX "LeadRebate_workerId_createdAt_idx" ON "LeadRebate"("workerId", "createdAt");
      CREATE INDEX "LeadRebate_leadId_idx" ON "LeadRebate"("leadId");
      CREATE INDEX "LeadRebate_offerId_idx" ON "LeadRebate"("offerId");
    `,
  },
  {
    name: "lead_rating",
    check: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'LeadRating') as "exists"`,
    sql: `
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
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "LeadRating_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LeadOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "LeadRating_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "LeadRating_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "LeadRating_offerId_key" ON "LeadRating"("offerId");
      CREATE INDEX "LeadRating_workerId_createdAt_idx" ON "LeadRating"("workerId", "createdAt");
      CREATE INDEX "LeadRating_grade_quality_idx" ON "LeadRating"("grade", "quality");
      CREATE INDEX "LeadRating_leadId_idx" ON "LeadRating"("leadId");
    `,
  },
];

export async function POST() {
  try {
    const prisma = getPrisma();
    const results: Array<{ name: string; applied: boolean; error?: string }> = [];

    for (const migration of MIGRATIONS) {
      try {
        const check = await prisma.$queryRawUnsafe(migration.check) as Array<{ exists: boolean }>;
        if (check[0]?.exists) {
          results.push({ name: migration.name, applied: false });
          continue;
        }
        await prisma.$executeRawUnsafe(migration.sql);
        results.push({ name: migration.name, applied: true });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ name: migration.name, applied: false, error: msg });
      }
    }

    const applied = results.filter((r) => r.applied).length;
    return NextResponse.json({
      ok: true,
      applied,
      total: MIGRATIONS.length,
      results,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
