import { NextResponse } from "next/server";
import { checkMeilisearchHealth } from "@/lib/search/meilisearch";

/**
 * GET /api/search/health — Check Meilisearch server status
 */
export async function GET() {
  const health = await checkMeilisearchHealth();
  return NextResponse.json(health);
}
