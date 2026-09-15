/**
 * TEMPORARY endpoint — applies the worker referral migration to production.
 * Call once, then DELETE this file and redeploy.
 */

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST() {
  const log: string[] = [];

  try {
    // Add referredByWorkerId column
    try {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Worker" ADD COLUMN "referredByWorkerId" TEXT'
      );
      log.push("✓ Added referredByWorkerId column");
    } catch (e: any) {
      if (e?.message?.includes("already exists")) {
        log.push("↳ referredByWorkerId already exists");
      } else {
        log.push("✗ ERROR: " + e?.message);
        return NextResponse.json({ ok: false, log }, { status: 500 });
      }
    }

    // Add foreign key
    try {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "Worker" ADD CONSTRAINT "Worker_referredByWorkerId_fkey" FOREIGN KEY ("referredByWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE'
      );
      log.push("✓ Added foreign key constraint");
    } catch (e: any) {
      if (e?.message?.includes("already exists")) {
        log.push("↳ Foreign key already exists");
      } else {
        log.push("✗ ERROR: " + e?.message);
        return NextResponse.json({ ok: false, log }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, log });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), log }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
