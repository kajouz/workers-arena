/**
 * TEMPORARY endpoint — applies all missing Prisma migrations to production.
 * Call once, then DELETE this file and redeploy.
 */

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** All pending migration SQL statements, one per migration, split into single statements. */
const MIGRATIONS: Array<{ name: string; statements: string[] }> = [
  {
    name: "20260914180000_quote_request_is_emergency",
    statements: [
      'ALTER TABLE "QuoteRequest" ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false',
    ],
  },
  {
    name: "20260914200000_lead_rebate",
    statements: [
      'ALTER TABLE "Booking" ADD COLUMN "leadRebateMinor" INTEGER NOT NULL DEFAULT 0',
      'CREATE TABLE "LeadRebate" ("id" TEXT NOT NULL, "offerId" TEXT NOT NULL, "bookingId" TEXT NOT NULL, "workerId" TEXT NOT NULL, "leadCostMinor" INTEGER NOT NULL, "feeMinor" INTEGER NOT NULL, "rebateMinor" INTEGER NOT NULL, "effectiveFeeMinor" INTEGER NOT NULL, "limitedBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LeadRebate_pkey" PRIMARY KEY ("id"))',
      'CREATE UNIQUE INDEX "LeadRebate_offerId_key" ON "LeadRebate"("offerId")',
      'CREATE UNIQUE INDEX "LeadRebate_bookingId_key" ON "LeadRebate"("bookingId")',
      'ALTER TABLE "LeadRebate" ADD CONSTRAINT "LeadRebate_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LeadOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      'ALTER TABLE "LeadRebate" ADD CONSTRAINT "LeadRebate_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      'ALTER TABLE "LeadRebate" ADD CONSTRAINT "LeadRebate_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    ],
  },
  {
    name: "20260914220000_lead_rating",
    statements: [
      'CREATE TABLE "LeadRating" ("id" TEXT NOT NULL, "offerId" TEXT NOT NULL, "workerId" TEXT NOT NULL, "quality" INTEGER NOT NULL, "reason" TEXT, "reasonAr" TEXT, "converted" BOOLEAN NOT NULL DEFAULT false, "reachable" BOOLEAN, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LeadRating_pkey" PRIMARY KEY ("id"))',
      'CREATE UNIQUE INDEX "LeadRating_offerId_key" ON "LeadRating"("offerId")',
      'ALTER TABLE "LeadRating" ADD CONSTRAINT "LeadRating_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "LeadOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      'ALTER TABLE "LeadRating" ADD CONSTRAINT "LeadRating_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE RESTRICT ON UPDATE CASCADE',
    ],
  },
];

export async function POST() {
  const log: string[] = [];

  try {
    for (const migration of MIGRATIONS) {
      log.push(`\n── Migration: ${migration.name} ──`);
      for (const stmt of migration.statements) {
        try {
          await prisma.$executeRawUnsafe(stmt);
          log.push(`  ✓ ${stmt.slice(0, 80)}...`);
        } catch (e: any) {
          // Column/table already exists is fine
          const msg = e?.message ?? String(e);
          if (msg.includes("already exists") || msg.includes("duplicate column") || msg.includes("already exists")) {
            log.push(`  ↷ Already applied: ${stmt.slice(0, 60)}...`);
          } else {
            log.push(`  ✗ ERROR: ${msg}`);
            return NextResponse.json({ ok: false, log, error: msg }, { status: 500 });
          }
        }
      }
    }

    return NextResponse.json({ ok: true, log, message: "All migrations applied." });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), log }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
