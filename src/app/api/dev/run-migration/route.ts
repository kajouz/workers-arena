import { NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * TEMPORARY endpoint — runs `prisma migrate deploy` against the production
 * database. Call once, then DELETE this file and redeploy.
 */
export async function POST() {
  try {
    const output = execSync("npx prisma migrate deploy", {
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env },
    });
    return NextResponse.json({ ok: true, output });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
