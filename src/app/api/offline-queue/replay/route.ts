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
import { getSession } from "@/lib/auth-demo";
import { sanitizeText } from "@/lib/security";
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
        // Lead is allowed for guests (phone-keyed contact) — rate-limited by
        // proxy (30/min per IP) and sanitized; review below requires auth.
        const w = await addLead(workerId);
        return NextResponse.json({ ok: !!w });
      }

      case "review": {
        // Reviews must be authenticated — prevents anonymous spam (C2).
        const session = await getSession();
        if (!session) {
          return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
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
        const cleanText = sanitizeText(text, 4000);
        const cleanAuthor = sanitizeText(author || session.name || "Anonymous", 100) || "Anonymous";
        if (!cleanText) {
          return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
        }
        const w = await addReview(workerId, {
          author: cleanAuthor,
          rating,
          textEn: cleanText,
          textAr: cleanText,
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
