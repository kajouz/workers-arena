import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { broadcastTyping } from "@/lib/messaging/sse-emitter";
import { setChatTyping } from "@/lib/data/repo";

/**
 * POST /api/messaging/typing
 *
 * Broadcast typing indicator to all connected clients.
 *
 * Body: { bookingId: string, active: boolean }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookingId, active } = body;

  if (!bookingId) {
    return NextResponse.json(
      { error: "Missing required field: bookingId" },
      { status: 400 }
    );
  }

  // Determine role from session
  const role = session.role === "worker" ? "worker" : "customer";

  // Update server-side typing state
  setChatTyping(bookingId, role, active);

  // Broadcast typing indicator via SSE
  broadcastTyping(bookingId, role, active);

  return NextResponse.json({ success: true });
}
