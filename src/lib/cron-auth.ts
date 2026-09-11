import { NextResponse } from "next/server";

/**
 * Unified cron auth guard (M1+M7).
 * Accepts either `x-cron-secret: $CRON_SECRET` or `Authorization: Bearer $CRON_SECRET`.
 * Rejects `?secret=` query param (leaks to Vercel access logs).
 * Requires CRON_SECRET to be set — if unset, every cron returns 401 (fail-closed).
 */
export function verifyCronAuth(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const headerSecret = request.headers.get("x-cron-secret");
  const authHeader = request.headers.get("authorization");
  let bearer: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    bearer = authHeader.slice(7);
  }

  const provided = headerSecret ?? bearer;
  // Explicitly do NOT read ?secret= — it leaks into server logs.
  if (!provided || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
