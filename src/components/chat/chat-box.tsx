"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import type { BookingMessage } from "@/lib/data/types";

interface ChatBoxProps {
  bookingId: string;
  currentRole: "customer" | "worker";
  currentUserId: string;
  otherPartyName?: string;
  /** If true, allow sending a quote with a message. */
  allowQuote?: boolean;
  /** If true, show "Accept Quote" button on worker quotes. */
  allowQuoteAccept?: boolean;
  /** Called when a quote is accepted. */
  onQuoteAccept?: (bookingId: string, messageId: string) => void;
  /** Compact mode for embedded views. */
  compact?: boolean;
}

interface TypingIndicator {
  role: "customer" | "worker" | null;
  active: boolean;
}

export default function ChatBox({
  bookingId,
  currentRole,
  currentUserId,
  otherPartyName = "",
  allowQuote = false,
  allowQuoteAccept = false,
  onQuoteAccept,
  compact = false,
}: ChatBoxProps) {
  const { t } = useLocale();
  const [messages, setMessages] = useState<BookingMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherTyping, setOtherTyping] = useState<TypingIndicator>({
    role: null,
    active: false,
  });
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingActiveRef = useRef(false);

  // Fetch initial messages
  useEffect(() => {
    async function fetchMessages() {
      try {
        const res = await fetch(
          `/api/messaging/stream?bookingId=${bookingId}&role=${currentRole}&userId=${currentUserId}`
        );
        // We don't use the response directly — the SSE connection handles it
      } catch {
        // Initial messages will come via SSE or we can fetch them separately
      }
    }

    // Fetch existing messages via a simple GET
    async function fetchExistingMessages() {
      try {
        const res = await fetch(`/api/messaging/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, text: "__fetch__" }),
        });
        // This won't work — let's use a different approach
      } catch {
        // ignore
      }
    }

    fetchMessages();
  }, [bookingId, currentRole, currentUserId]);

  // SSE connection
  useEffect(() => {
    const params = new URLSearchParams({
      bookingId,
      role: currentRole,
      userId: currentUserId,
    });

    const eventSource = new EventSource(
      `/api/messaging/stream?${params.toString()}`
    );
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "connected":
            // Initial connection confirmed
            break;

          case "message":
            setMessages((prev) => {
              // Avoid duplicates
              if (prev.some((m) => m.id === data.data.id)) return prev;
              return [...prev, data.data as BookingMessage];
            });
            break;

          case "typing":
            if (data.data.role !== currentRole) {
              setOtherTyping({
                role: data.data.role,
                active: data.data.active,
              });
              if (!data.data.active) {
                // Clear typing after a brief delay
                setTimeout(() => setOtherTyping({ role: null, active: false }), 500);
              }
            }
            break;

          case "read":
            if (data.data.readerRole !== currentRole) {
              setMessages((prev) =>
                prev.map((m) => {
                  if (data.data.messageIds.includes(m.id)) {
                    return { ...m, readAt: data.data.time };
                  }
                  return m;
                })
              );
            }
            break;

          case "presence":
            // Could track online/offline status
            break;

          case "ping":
            // Keep-alive acknowledged
            break;
        }
      } catch {
        // Malformed event — ignore
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      // Auto-reconnect is handled by EventSource
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [bookingId, currentRole, currentUserId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send typing indicator
  const emitTyping = useCallback(
    async (active: boolean) => {
      try {
        await fetch("/api/messaging/typing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookingId, active }),
        });
      } catch {
        // Typing is best-effort
      }
    },
    [bookingId]
  );

  // Handle typing with debounce
  const handleInputChange = (value: string) => {
    setNewMessage(value);

    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      emitTyping(true);
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set new timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      emitTyping(false);
    }, 2000);
  };

  // Send a message
  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text || sending) return;

    setSending(true);
    setNewMessage("");
    setQuoteAmount("");

    // Stop typing indicator
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      emitTyping(false);
    }

    try {
      const body: Record<string, unknown> = { bookingId, text };
      if (allowQuote && quoteAmount) {
        body.quote = Math.round(parseFloat(quoteAmount) * 100); // Convert to minor units
      }

      const res = await fetch("/api/messaging/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Failed to send message:", err);
        setNewMessage(text); // Restore message on failure
      }
    } catch (err) {
      console.error("Failed to send message:", err);
      setNewMessage(text); // Restore message on failure
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Mark messages as read
  useEffect(() => {
    if (messages.length > 0 && isConnected) {
      fetch("/api/messaging/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      }).catch(() => {});
    }
  }, [messages, bookingId, isConnected]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const formatQuote = (minorUnits: number) => {
    return `$${(minorUnits / 100).toFixed(2)}`;
  };

  return (
    <div
      className={`flex flex-col ${compact ? "h-80" : "h-96"} rounded-2xl border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-900`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3 dark:border-ink-700">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-red-400"}`}
          />
          <span className="text-sm font-semibold text-ink-800 dark:text-ink-200">
            {otherPartyName || t("chat.thread")}
          </span>
        </div>
        {isConnected && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {t("chat.connected")}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-ink-400">{t("chat.noMessages")}</p>
          </div>
        )}

        {messages.map((msg) => {
          const isMine = msg.senderRole === currentRole;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isMine
                    ? "bg-brand-500 text-white"
                    : "bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-200"
                }`}
              >
                {/* Quote badge */}
                {msg.quote && (
                  <div
                    className={`mb-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                      isMine
                        ? "bg-white/20 text-white"
                        : "bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"
                    }`}
                  >
                    💰 {formatQuote(msg.quote)}
                    {allowQuoteAccept && !isMine && (
                      <button
                        onClick={() =>
                          onQuoteAccept?.(bookingId, msg.id)
                        }
                        className="ml-2 rounded bg-emerald-500 px-2 py-0.5 text-xs text-white hover:bg-emerald-600"
                      >
                        {t("chat.acceptQuote")}
                      </button>
                    )}
                  </div>
                )}

                <p className="text-sm leading-relaxed">{msg.text}</p>

                <div
                  className={`mt-1 flex items-center gap-1.5 ${
                    isMine ? "justify-end" : "justify-start"
                  }`}
                >
                  <span
                    className={`text-[10px] ${
                      isMine ? "text-white/70" : "text-ink-400"
                    }`}
                  >
                    {formatTime(msg.time)}
                  </span>
                  {isMine && msg.readAt && (
                    <span className="text-[10px] text-white/70">✓✓</span>
                  )}
                  {isMine && !msg.readAt && (
                    <span className="text-[10px] text-white/50">✓</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {otherTyping.active && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-ink-100 px-4 py-2.5 dark:bg-ink-800">
              <div className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-ink-200 px-4 py-3 dark:border-ink-700">
        {/* Quote input */}
        {allowQuote && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-ink-500">{t("chat.quote")}:</span>
            <input
              type="number"
              value={quoteAmount}
              onChange={(e) => setQuoteAmount(e.target.value)}
              placeholder="0.00"
              className="w-24 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs text-ink-800 focus:border-brand-400 focus:outline-none dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200"
              min="0"
              step="0.01"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("chat.placeholder")}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-400 focus:outline-none dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200 dark:placeholder:text-ink-500"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sending}
            className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "..." : t("chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
