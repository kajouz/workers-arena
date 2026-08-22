import { registerClient, removeClient, sendPing } from "@/lib/messaging/sse-emitter";
import { getSession } from "@/lib/auth-demo";

/**
 * GET /api/messaging/stream?bookingId=xxx&role=customer&userId=xxx
 *
 * Server-Sent Events endpoint for real-time messaging.
 * Keeps a persistent connection open for receiving:
 * - New messages in the booking thread
 * - Typing indicators
 * - Read receipts
 * - Presence updates
 *
 * The connection sends periodic pings to prevent timeout.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bookingId = searchParams.get("bookingId");
  const role = searchParams.get("role") as "customer" | "worker" | null;
  const userId = searchParams.get("userId");

  // Validate params
  if (!bookingId || !role || !userId) {
    return new Response("Missing required parameters: bookingId, role, userId", {
      status: 400,
    });
  }

  if (role !== "customer" && role !== "worker") {
    return new Response("Invalid role: must be 'customer' or 'worker'", {
      status: 400,
    });
  }

  // Create SSE stream
  const stream = new ReadableStream({
    start(controller) {
      // Register this client
      const clientId = registerClient(bookingId, role, userId, controller);

      // Send initial connection event
      const welcomePayload = `data: ${JSON.stringify({
        type: "connected",
        data: { clientId, bookingId, role, time: Date.now() },
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(welcomePayload));

      // Set up keepalive ping every 30 seconds
      const pingInterval = setInterval(() => {
        sendPing(bookingId);
      }, 30_000);

      // Clean up on connection close
      request.signal.addEventListener("abort", () => {
        clearInterval(pingInterval);
        removeClient(clientId);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
