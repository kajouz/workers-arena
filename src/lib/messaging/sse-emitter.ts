/**
 * SSE Event Emitter for real-time messaging.
 *
 * Manages Server-Sent Events connections per booking thread. When a new
 * message is sent, the emitter broadcasts it to all connected clients
 * subscribed to that booking.
 *
 * Architecture:
 * - Each SSE connection registers with a bookingId
 * - When a message arrives, all clients on that booking get notified
 * - Typing indicators are broadcast as ephemeral events
 * - Read receipts update in real-time
 *
 * This is process-local (single Next.js server instance). For multi-server
 * deployments, use Redis pub/sub or a message broker.
 */

/* ─── Types ─── */
export interface SSEClient {
  id: string;
  bookingId: string;
  role: "customer" | "worker";
  userId: string;
  controller: ReadableStreamDefaultController;
  connectedAt: number;
}

export interface SSEEvent {
  type: "message" | "typing" | "read" | "presence" | "ping";
  data: unknown;
}

/* ─── Store ─── */
const clients = new Map<string, SSEClient>();
let clientCounter = 0;

/* ─── Connection Management ─── */

/**
 * Register a new SSE client connection
 */
export function registerClient(
  bookingId: string,
  role: "customer" | "worker",
  userId: string,
  controller: ReadableStreamDefaultController
): string {
  const id = `sse-${++clientCounter}-${Date.now()}`;
  const client: SSEClient = {
    id,
    bookingId,
    role,
    userId,
    controller,
    connectedAt: Date.now(),
  };

  clients.set(id, client);
  console.log(`[SSE] Client ${id} connected to booking ${bookingId} (${role})`);

  // Notify other clients about new connection
  broadcast(bookingId, {
    type: "presence",
    data: { action: "joined", role, userId, clientId: id },
  }, id);

  return id;
}

/**
 * Remove an SSE client connection
 */
export function removeClient(id: string): void {
  const client = clients.get(id);
  if (!client) return;

  clients.delete(id);
  console.log(`[SSE] Client ${id} disconnected from booking ${client.bookingId}`);

  // Notify remaining clients
  broadcast(client.bookingId, {
    type: "presence",
    data: { action: "left", role: client.role, userId: client.userId, clientId: id },
  }, id);
}

/**
 * Get all clients connected to a specific booking
 */
export function getBookingClients(bookingId: string): SSEClient[] {
  return Array.from(clients.values()).filter((c) => c.bookingId === bookingId);
}

/**
 * Get connection stats
 */
export function getConnectionStats(): {
  total: number;
  byBooking: Record<string, number>;
} {
  const byBooking: Record<string, number> = {};
  for (const client of clients.values()) {
    byBooking[client.bookingId] = (byBooking[client.bookingId] || 0) + 1;
  }
  return { total: clients.size, byBooking };
}

/* ─── Broadcasting ─── */

/**
 * Broadcast an event to all clients on a booking (optionally excluding one)
 */
export function broadcast(
  bookingId: string,
  event: SSEEvent,
  excludeClientId?: string
): void {
  const targets = getBookingClients(bookingId).filter(
    (c) => c.id !== excludeClientId
  );

  const payload = `data: ${JSON.stringify(event)}\n\n`;

  for (const client of targets) {
    try {
      client.controller.enqueue(new TextEncoder().encode(payload));
    } catch {
      // Client disconnected — clean up
      removeClient(client.id);
    }
  }
}

/**
 * Broadcast a new message to all clients on a booking
 */
export function broadcastMessage(
  bookingId: string,
  message: {
    id: string;
    bookingId: string;
    senderRole: string;
    senderId?: string;
    text: string;
    quote?: number;
    time: string;
  }
): void {
  broadcast(bookingId, { type: "message", data: message });
}

/**
 * Broadcast typing indicator
 */
export function broadcastTyping(
  bookingId: string,
  role: "customer" | "worker",
  active: boolean
): void {
  broadcast(bookingId, {
    type: "typing",
    data: { role, active, time: new Date().toISOString() },
  });
}

/**
 * Broadcast read receipt
 */
export function broadcastReadReceipt(
  bookingId: string,
  readerRole: "customer" | "worker",
  messageIds: string[]
): void {
  broadcast(bookingId, {
    type: "read",
    data: { readerRole, messageIds, time: new Date().toISOString() },
  });
}

/**
 * Send keepalive ping to prevent connection timeout
 */
export function sendPing(bookingId: string): void {
  broadcast(bookingId, { type: "ping", data: { time: Date.now() } });
}

/* ─── Cleanup ─── */

/**
 * Clean up stale connections (older than timeout)
 */
export function cleanupStaleConnections(timeoutMs = 300_000): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [id, client] of clients.entries()) {
    if (now - client.connectedAt > timeoutMs) {
      removeClient(id);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Reset all connections (for testing)
 */
export function resetSSEStore(): void {
  clients.clear();
  clientCounter = 0;
}
