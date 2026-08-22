import { NextResponse } from "next/server";
import { syncWorkersToMeilisearch } from "@/lib/search/meilisearch";

/**
 * POST /api/search/sync — Sync all workers to Meilisearch index
 */
export async function POST() {
  try {
    const result = await syncWorkersToMeilisearch();
    return NextResponse.json({
      success: true,
      indexed: result.indexed,
      message: `Synced ${result.indexed} workers to search index`,
    });
  } catch (error) {
    console.error("Search sync failed:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 }
    );
  }
}
