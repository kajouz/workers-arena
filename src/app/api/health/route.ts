import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/data/repo";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: isDemoMode ? "demo" : "production",
    time: new Date().toISOString(),
  });
}
