/**
 * POST /api/analytics/page-view
 *
 * Accepts a single page-view event or a batch of events from the offline queue.
 *
 * Single event shape:  { workerId, path, timestamp }
 * Batch shape:         { batch: Array<{ workerId, path, timestamp }> }
 *
 * Response:
 *   200 { ok: true, recorded: <count> }
 *   400 { ok: false, error: "invalid" }
 */

import { NextResponse } from "next/server";

interface PageViewEvent {
  workerId?: string | null;
  path?: string;
  timestamp?: string;
}

function isValidEvent(e: unknown): e is PageViewEvent {
  if (!e || typeof e !== "object") return false;
  const obj = e as Record<string, unknown>;
  return typeof obj.path === "string" && obj.path.length > 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  // Single event
  if (body && typeof body === "object" && !Array.isArray(body) && !("batch" in body)) {
    if (!isValidEvent(body)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    // In demo mode this is a silent no-op; in real mode this would write
    // to an analytics table.  For now just acknowledge receipt.
    return NextResponse.json({ ok: true, recorded: 1 });
  }

  // Batch of events
  if (body && typeof body === "object" && "batch" in body) {
    const batch = (body as { batch: unknown }).batch;
    if (!Array.isArray(batch)) {
      return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const valid = batch.filter(isValidEvent);
    // Same as above — acknowledge receipt.  Real mode would bulk-insert.
    return NextResponse.json({ ok: true, recorded: valid.length });
  }

  return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
}
