import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { broadcastReadReceipt } from "@/lib/messaging/sse-emitter";
import { markChatRead, getBookingMessages } from "@/lib/data/repo";

/**
 * POST /api/messaging/read
 *
 * Mark messages as read and broadcast read receipts via SSE.
 *
 * Body: { bookingId: string }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookingId } = body;

  if (!bookingId) {
    return NextResponse.json(
      { error: "Missing required field: bookingId" },
      { status: 400 }
    );
  }

  // Determine reader role from session
  const readerRole = session.role === "worker" ? "worker" : "customer";

  // Mark messages as read
  const markedCount = await markChatRead(bookingId, readerRole);

  // Get the updated messages to find which ones were just read
  if (markedCount > 0) {
    const messages = await getBookingMessages(bookingId);
    const readMessageIds = messages
      .filter((m) => m.senderRole !== readerRole && m.readAt)
      .map((m) => m.id);

    // Broadcast read receipts via SSE
    broadcastReadReceipt(bookingId, readerRole, readMessageIds);
  }

  return NextResponse.json({
    success: true,
    markedCount,
  });
}
