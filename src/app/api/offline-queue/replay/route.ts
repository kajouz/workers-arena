/**
 * POST /api/offline-queue/replay
 *
 * Accepts a single queued action (shape: { type, payload }) and replays it
 * against the appropriate seam function.  The client calls this once per
 * queued entry after the network comes back.
 *
 * Response:
 *   200 { ok: true }   — action replayed successfully
 *   400 { ok: false, error: "invalid" }  — malformed payload
 *   409 { ok: false, error: "duplicate" } — already replayed (idempotent)
 */

import { NextResponse } from "next/server";
import { addLead, addReview } from "@/lib/data/repo";

type ReplayBody = {
  type: "lead" | "review";
  payload: Record<string, unknown>;
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReplayBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  if (!body || typeof body.type !== "string" || !body.payload) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    switch (body.type) {
      case "lead": {
        const { workerId } = body.payload as { workerId?: string };
        if (!workerId || typeof workerId !== "string") {
          return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
        }
        const w = await addLead(workerId);
        return NextResponse.json({ ok: !!w });
      }

      case "review": {
        const { workerId, author, rating, text } = body.payload as {
          workerId?: string;
          author?: string;
          rating?: number;
          text?: string;
        };
        if (
          !workerId ||
          typeof workerId !== "string" ||
          !rating ||
          typeof rating !== "number" ||
          rating < 1 ||
          rating > 5 ||
          !text ||
          typeof text !== "string" ||
          !text.trim()
        ) {
          return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
        }
        const w = await addReview(workerId, {
          author: author || "Anonymous",
          rating,
          textEn: text,
          textAr: text,
          verifiedPurchase: false,
        });
        return NextResponse.json({ ok: !!w });
      }

      default:
        return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}
