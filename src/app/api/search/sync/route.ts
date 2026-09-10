import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { syncWorkersToMeilisearch } from "@/lib/search/meilisearch";

export const dynamic = "force-dynamic";

/**
 * POST /api/search/sync — Sync all workers to the Meilisearch index.
 *
 * Guarded like the other operational routes (admin emergency/revenue APIs,
 * the CRON_SECRET cron endpoints): either a signed-in **admin** session or
 * the `x-cron-secret: $CRON_SECRET` header (or `?secret=` for schedulers
 * that can't set headers). Unauthenticated callers get 401.
 *
 *   curl -X POST -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/search/sync
 *
 * Scheduled syncs should prefer the offline `scripts/search-sync.ts`
 * (direct library call, no HTTP); this HTTP route exists for ad-hoc admin
 * triggers and secrets-in-header schedulers.
 */
export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const provided =
    req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  const hasValidCronSecret = Boolean(cronSecret && provided && provided === cronSecret);

  if (!hasValidCronSecret) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await syncWorkersToMeilisearch();
    return NextResponse.json({
      ok: true,
      indexed: result.indexed,
      message: `Synced ${result.indexed} workers to search index`,
    });
  } catch (error) {
    // syncWorkersToMeilisearch already falls back to in-memory search when
    // Meilisearch is unreachable, so a throw here is an unexpected internal
    // failure — log it server-side but keep the response body free of the
    // raw error string (it can carry infra details like hostnames).
    console.error("Search sync failed:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
