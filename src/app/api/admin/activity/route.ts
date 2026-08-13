import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { listActivityEntries } from "@/lib/data/activity";

export const dynamic = "force-dynamic";

/**
 * Admin activity history.
 *
 *   GET /api/admin/activity?page=1&pageSize=20&actor=Admin&type=verification&code=WORKER_VERIFIED
 *     → { items: ActivityEntry[], total, page, pageSize }
 *
 * Pages through the FULL activity log (the admin overview feed caps at 200;
 * this route does not). `actor` matches the actor name/id case-insensitively,
 * `type` is one of worker | company | review | payment | system | verification
 * (matched against the app-level type in meta); `code` is an exact
 * ACTION_CODES match against the machine-readable action column.
 * Guarded by the admin session role.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);
  const actor = url.searchParams.get("actor") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  const code = url.searchParams.get("code") ?? undefined;

  const result = await listActivityEntries({ page, pageSize, actor, type, code });
  return NextResponse.json(result);
}
