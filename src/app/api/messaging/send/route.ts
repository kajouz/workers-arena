import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { broadcastMessage } from "@/lib/messaging/sse-emitter";
import { sendBookingMessage, getBookingById } from "@/lib/data/repo";

/**
 * POST /api/messaging/send
 *
 * Send a message in a booking's chat thread.
 * The message is persisted AND broadcast via SSE to all connected clients.
 *
 * Body: { bookingId: string, text: string, quote?: number }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { bookingId, text, quote } = body;

  if (!bookingId || !text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing required fields: bookingId, text" },
      { status: 400 }
    );
  }

  // Verify the booking exists and the user has access
  const booking = await getBookingById(bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Determine sender role from session
  const senderRole = session.role === "worker" ? "worker" : "customer";

  // Persist the message
  const message = await sendBookingMessage(bookingId, {
    senderRole,
    senderId: session.id,
    text: text.trim(),
    quote: quote ? Number(quote) : undefined,
  });

  if (!message) {
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }

  // Broadcast via SSE to all connected clients
  broadcastMessage(bookingId, message);

  return NextResponse.json({
    success: true,
    message,
  });
}
