import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/data/repo";

/**
 * POST /api/ads/:id/click — records an ad click (used by sponsored slots).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const updated = await recordClick(id);
  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, ctr: updated.ctr, clicks: updated.clicks });
}
