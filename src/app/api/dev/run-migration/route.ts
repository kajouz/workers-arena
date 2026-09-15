import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/server/prisma";

/**
 * TEMPORARY endpoint — checks if the LeadRating table exists and creates it
 * if not. Call once, then DELETE this file and redeploy.
 */
export async function POST() {
  try {
    const prisma = getPrisma();

    // Check if LeadRating table exists
    const tableCheck = await prisma.$queryRawUnsafe(
      `SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'LeadRating'
      ) as "exists"`
    ) as Array<{ exists: boolean }>;

    const exists = tableCheck[0]?.exists;

    if (exists) {
      return NextResponse.json({ ok: true, message: "LeadRating table already exists" });
    }

    // Create the table
    await prisma.$executeRawUnsafe(`
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
      )
    `);

    // Create indexes
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX "LeadRating_offerId_key" ON "LeadRating"("offerId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LeadRating_workerId_createdAt_idx" ON "LeadRating"("workerId", "createdAt")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LeadRating_grade_quality_idx" ON "LeadRating"("grade", "quality")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX "LeadRating_leadId_idx" ON "LeadRating"("leadId")`);

    return NextResponse.json({ ok: true, message: "LeadRating table created successfully" });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
