"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/* ─── Types ─── */
interface SSEMessage {
  type: "message" | "typing" | "read" | "presence" | "ping" | "connected";
  data: unknown;
}

interface Message {
  id: string;
  bookingId: string;
  senderRole: string;
  senderId?: string;
  text: string;
  quote?: number;
  readAt?: string;
  time: string;
}

interface TypingState {
  role: "customer" | "worker" | null;
  active: boolean;
  time: string;
}

interface UseMessagingSSEOptions {
  bookingId: string;
  role: "customer" | "worker";
  userId: string;
  onMessage?: (message: Message) => void;
  onTyping?: (typing: TypingState) => void;
  onRead?: (data: { readerRole: string; messageIds: string[] }) => void;
  onPresence?: (data: { action: string; role: string; userId: string }) => void;
  enabled?: boolean;
}

interface UseMessagingSEReturn {
  isConnected: boolean;
  error: string | null;
  sendTyping: (active: boolean) => void;
  markRead: () => void;
  sendMessage: (text: string, quote?: number) => Promise<Message | null>;
  reconnect: () => void;
}

/**
 * Hook for consuming SSE real-time messaging events.
 *
 * Automatically connects to the SSE stream when the component mounts
 * and handles reconnection on failure.
 *
 * Usage:
 * ```tsx
 * const { isConnected, sendMessage, sendTyping } = useMessagingSSE({
 *   bookingId: "booking-123",
 *   role: "customer",
 *   userId: "user-456",
 *   onMessage: (msg) => setMessages(prev => [...prev, msg]),
 *   onTyping: (typing) => setTypingState(typing),
 * });
 * ```
 */
export function useMessagingSSE(options: UseMessagingSSEOptions): UseMessagingSEReturn {
  const {
    bookingId,
    role,
    userId,
    onMessage,
    onTyping,
    onRead,
    onPresence,
    enabled = true,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  // Stable callbacks
  const onMessageRef = useRef(onMessage);
  const onTypingRef = useRef(onTyping);
  const onReadRef = useRef(onRead);
  const onPresenceRef = useRef(onPresence);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onTypingRef.current = onTyping;
    onReadRef.current = onRead;
    onPresenceRef.current = onPresence;
  }, [onMessage, onTyping, onRead, onPresence]);

  // Connect to SSE
  const connect = useCallback(() => {
    if (!enabled || !bookingId || !role || !userId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/messaging/stream?bookingId=${encodeURIComponent(bookingId)}&role=${encodeURIComponent(role)}&userId=${encodeURIComponent(userId)}`;

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttempts.current = 0;
      console.log("[SSE] Connected to messaging stream");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSEMessage;

        switch (data.type) {
          case "message":
            onMessageRef.current?.(data.data as Message);
            break;
          case "typing":
            onTypingRef.current?.(data.data as TypingState);
            break;
          case "read":
            onReadRef.current?.(data.data as { readerRole: string; messageIds: string[] });
            break;
          case "presence":
            onPresenceRef.current?.(data.data as { action: string; role: string; userId: string });
            break;
          case "ping":
            // Keepalive — no action needed
            break;
          case "connected":
            console.log("[SSE] Stream established");
            break;
        }
      } catch (err) {
        console.error("[SSE] Failed to parse event:", err);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError("Connection lost");

      // Exponential backoff reconnect
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;

      console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };

    return () => {
      eventSource.close();
    };
  }, [bookingId, role, userId, enabled]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  // Send typing indicator
  const sendTyping = useCallback(
    (active: boolean) => {
      fetch("/api/messaging/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, active }),
      }).catch(console.error);
    },
    [bookingId]
  );

  // Mark messages as read
  const markRead = useCallback(() => {
    fetch("/api/messaging/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    }).catch(console.error);
  }, [bookingId]);

  // Send a message
  const sendMessage = useCallback(
    async (text: string, quote?: number): Promise<Message | null> => {
      try {
        const res = await fetch("/api/messaging/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, text, quote }),
        });

        if (!res.ok) {
          console.error("[SSE] Failed to send message:", res.statusText);
          return null;
        }

        const data = await res.json();
        return data.message || null;
      } catch (err) {
        console.error("[SSE] Send message error:", err);
        return null;
      }
    },
    [bookingId]
  );

  // Manual reconnect
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected,
    error,
    sendTyping,
    markRead,
    sendMessage,
    reconnect,
  };
}
