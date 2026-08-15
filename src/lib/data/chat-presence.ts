/**
 * §2.3 chat presence — typing indicators are EPHEMERAL by nature, so they live
 * in process-local memory on BOTH adapters (the demo store and Postgres both
 * feed one Next server; typing state must never persist — a refresh or server
 * restart clears it, exactly like WhatsApp). Read receipts (readAt on the
 * BookingMessage rows) go through the adapters; this module only tracks WHO is
 * typing and WHEN, so the other party's client can render "…typing" while they
 * compose. A TTL keeps stale flags from sticking if a client disappears
 * (navigates away, crashes) without sending the "stopped typing" clear.
 */

export interface ChatTypingState {
  /** Who is typing right now, or null when nobody is. */
  typingRole: "customer" | "worker" | null;
  /** ISO timestamp of the last keystroke — the client renders a live feel. */
  typingAt: string | null;
}

/** How long a typing flag stays live without a new keystroke. */
export const CHAT_TYPING_TTL_MS = 4_000;

const typing = new Map<string, { role: "customer" | "worker"; at: number }>();

/** Set (active) or clear (inactive) the typing flag for a booking + party. */
export function setChatTyping(
  bookingId: string,
  role: "customer" | "worker",
  active: boolean
): void {
  if (active) typing.set(bookingId, { role, at: Date.now() });
  else typing.delete(bookingId);
}

/** The current typing state for a booking — nulls out past the TTL. */
export function getChatTyping(bookingId: string, now = Date.now()): ChatTypingState {
  const t = typing.get(bookingId);
  if (!t || now - t.at > CHAT_TYPING_TTL_MS) return { typingRole: null, typingAt: null };
  return { typingRole: t.role, typingAt: new Date(t.at).toISOString() };
}

/** Wipe presence — called by the demo store's reset (tests, seeds). */
export function resetChatPresence(): void {
  typing.clear();
}
