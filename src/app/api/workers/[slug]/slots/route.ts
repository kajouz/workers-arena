import { NextRequest, NextResponse } from "next/server";
import { getWorkerBySlug, getWorkerSlots } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * LIVE booking availability for one worker.
 *
 * The worker profile page is prerendered (locale-routing: the public surface
 * must stay static to be edge-cacheable), so the `slots` prop the booking
 * dialog receives there is a build-time snapshot. Availability is real-time
 * data — serving it stale lets a customer select a slot that is already
 * RESERVED and only discover the conflict after submitting. This endpoint
 * returns the current 14-day window so the dialog can refresh availability
 * when it OPENS (and again after a slot-taken conflict, where the static
 * page's router.refresh() cannot help either).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const worker = await getWorkerBySlug(slug);
  if (!worker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Same 14-day window the profile page renders with.
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
  const slots = await getWorkerSlots(worker.id, { from: from.toISOString(), to: to.toISOString() });

  return NextResponse.json(
    { slots },
    // Never cached anywhere: the entire point of this endpoint is freshness.
    { headers: { "Cache-Control": "no-store" } }
  );
}
