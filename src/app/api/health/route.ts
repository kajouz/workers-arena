import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/data/repo";

export async function GET() {
  // m12 fix: don't leak deployment mode to public internet in production — only
  // expose it in development/demo or to authenticated callers. Ops can still
  // infer health from ok:true + time; mode is audit-internal.
  const exposeMode = process.env.NODE_ENV !== "production" || process.env.DEMO_MODE === "true";
  return NextResponse.json({
    ok: true,
    ...(exposeMode ? { mode: isDemoMode ? "demo" : "production" } : {}),
    time: new Date().toISOString(),
  });
}
