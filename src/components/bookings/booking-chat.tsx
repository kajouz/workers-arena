"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageCircle, Send } from "lucide-react";
import { cn, timeAgo } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/shared/price";
import { toast } from "@/components/ui/toast";
import { buildWhatsappChatLink } from "@/lib/data/booking-ui";
import {
  acceptChatQuoteAction,
  getChatPresenceAction,
  markChatReadAction,
  sendBookingMessageAction,
  setChatTypingAction,
} from "@/app/actions/bookings";
import type { ChatPresenceSnapshot } from "@/lib/data/repo";
import type { Booking, BookingMessage } from "@/lib/data/types";

/**
 * §2.3 customer ⇄ worker chat (docs/ENHANCEMENT-PLAN.md §2.3) — the shared
 * negotiation thread keyed on Booking.id, rendered identically on the
 * customer row, the worker dashboard row and the admin dispute view, so all
 * three sides (and the audit trail) see one conversation. Quote sharing: the
 * worker can attach a price to a message, rendered as an in-thread quote chip.
 * WhatsApp fallback: a deep link prefilled with the booking context, so the
 * negotiation can continue off-platform without losing the paper trail.
 *
 * The thread is actor-stamped (senderRole + optional real user id) exactly
 * like audit entries — the negotiation lives inside the booking's record, and
 * the admin dispute view reads the same messages the rows render.
 */
export function BookingChat({
  booking,
  messages,
  viewerRole,
  workerName,
  workerWhatsapp,
  bare = false,
}: {
  booking: Booking;
  messages: BookingMessage[];
  /** Who is looking: "customer" | "worker" | "admin" (admin = read-only). */
  viewerRole: "customer" | "worker" | "admin";
  /** Localized worker display name (bubble label for the worker's messages). */
  workerName?: string;
  /** Worker's WhatsApp digits — the customer-side deep-link target. */
  workerWhatsapp?: string;
  /** Inside an owning Card (admin dispute view) — drop the border + toggle. */
  bare?: boolean;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [quote, setQuote] = useState("");
  const [sending, setSending] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  // Live presence — who is typing (other party) + the readAt map that turns
  // the viewer's own bubbles into "Seen" without a page refresh.
  const [presence, setPresence] = useState<Pick<ChatPresenceSnapshot, "typingRole" | "readAt">>({
    typingRole: null,
    readAt: {},
  });
  const typingIdle = useRef<number | null>(null);

  // Who wrote this message — the bubble alignment flips by sender.
  const ownRole = viewerRole;

  // §2.3 presence — while the thread is open (customer/worker only; the admin
  // dispute view is read-only), mark the counterpart's messages read and poll
  // the presence snapshot every 3s: typing indicators + the readAt map. The
  // mark-read is idempotent, so polling it repeatedly is harmless.
  useEffect(() => {
    if (!expanded || bare || viewerRole === "admin") return;
    let stopped = false;
    const tick = async () => {
      const res = await getChatPresenceAction(booking.id);
      if (!stopped && res.ok && "presence" in res && res.presence) {
        setPresence({ typingRole: res.presence.typingRole, readAt: res.presence.readAt });
      }
    };
    void markChatReadAction(booking.id);
    void tick();
    const iv = window.setInterval(() => void tick(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [expanded, bare, booking.id, viewerRole]);

  // §2.3 typing indicator — set the flag on the first keystroke of a burst,
  // clear it after 2.5s of inactivity (or when the message is sent). The flag
  // is ephemeral and TTL-guarded server-side, so a missed clear can't stick.
  const flagTyping = (active: boolean) => {
    void setChatTypingAction(booking.id, active);
  };
  const onCompose = () => {
    if (viewerRole === "admin") return;
    flagTyping(true);
    if (typingIdle.current !== null) window.clearTimeout(typingIdle.current);
    typingIdle.current = window.setTimeout(() => flagTyping(false), 2500);
  };

  // Unmount — best-effort clear of the typing flag (a burst interrupted by
  // navigation shouldn't linger past the server TTL).
  useEffect(() => {
    return () => {
      if (typingIdle.current !== null) window.clearTimeout(typingIdle.current);
      if (viewerRole !== "admin") void setChatTypingAction(booking.id, false);
    };
  }, [booking.id, viewerRole]);

  // §2.3 — the customer accepts the worker's quoted price in-thread: the
  // booking converts to CONFIRMED with the agreed amount (the action gates
  // ownership; the row re-renders on refresh once it's confirmed).
  const acceptQuote = async (messageId: string) => {
    if (acceptingId) return;
    setAcceptingId(messageId);
    const res = await acceptChatQuoteAction(booking.id, messageId);
    setAcceptingId(null);
    if (res.ok) {
      toast("success", t("booking.chatQuoteAccepted"));
      router.refresh();
    } else {
      toast("error", t("booking.chatAcceptError"));
    }
  };
  const sendMessage = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const fd = new FormData();
    fd.set("text", body);
    if (quote.trim()) fd.set("quote", quote.trim());
    const res = await sendBookingMessageAction(booking.id, fd);
    setSending(false);
    if (res.ok) {
      setText("");
      setQuote("");
      // Sending ends the burst — clear the typing flag and its idle timer.
      if (typingIdle.current !== null) window.clearTimeout(typingIdle.current);
      flagTyping(false);
      toast("success", t("booking.chatSent"));
      router.refresh();
    } else {
      toast("error", t("booking.chatError"));
    }
  };

  // WhatsApp fallback — the other party's number: the worker for the customer,
  // the customer's phone for the worker (admins don't jump off-platform).
  const fallbackDigits =
    viewerRole === "customer"
      ? workerWhatsapp ?? ""
      : viewerRole === "worker"
        ? booking.customerPhone
        : "";
  const fallbackText =
    viewerRole === "customer" || viewerRole === "worker"
      ? t("booking.chatWhatsappText")
          .replace("{number}", booking.number)
          .replace("{job}", booking.jobTitle)
      : "";
  const whatsappHref = fallbackDigits ? buildWhatsappChatLink(fallbackDigits, fallbackText) : "";

  return (
    <div className={cn(bare ? "" : "mt-3 border-t border-ink-100 pt-3 dark:border-ink-800")}>
      {!bare && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex items-center gap-1.5 text-xs font-bold text-ink-400 transition-colors hover:text-ink-600 dark:hover:text-ink-200"
          >
            <MessageCircle className="size-3.5" />
            {t("booking.chatTitle")}
            <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-bold text-ink-500 dark:bg-ink-800 dark:text-ink-300">
              {messages.length}
            </span>
          </button>
          {whatsappHref && expanded && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
            >
              <MessageCircle className="size-3" />
              {t("booking.chatWhatsapp")}
            </a>
          )}
        </div>
      )}

      {expanded || bare ? (
        <div className="mt-2 space-y-2">
          {messages.length === 0 && (
            <p className="rounded-xl border border-dashed border-ink-200 px-3 py-4 text-center text-xs text-ink-400 dark:border-ink-700">
              {t("booking.chatEmpty")}
            </p>
          )}

          <ol className="space-y-1.5">
            {messages.map((m) => {
              const mine = m.senderRole === ownRole || (viewerRole === "admin" && m.senderRole === "admin");
              // §2.3 read receipt — the message's own readAt wins; the polled
              // presence map covers receipts stamped AFTER the last refresh.
              const seenAt = m.readAt ?? presence.readAt[m.id];
              return (
                <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed",
                      mine
                        ? "rounded-br-md bg-brand-600 text-white dark:bg-brand-500"
                        : "rounded-bl-md bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-100"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    {m.quote !== undefined && (
                      <p
                        className={cn(
                          "mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-black",
                          mine ? "bg-white/20 text-white" : "bg-brand-600/10 text-brand-700 dark:text-brand-300"
                        )}
                      >
                        {t("booking.chatQuote")}{" "}
                        <Price amount={m.quote / 100} currency={booking.currency} locale={locale} />
                      </p>
                    )}
                    {/* §2.3 — the customer accepts the worker's quoted price
                        straight from the thread (only while the booking is
                        still negotiable). Workers/admins don't get the
                        button — the worker proposed it, the admin stays
                        read-only. */}
                    {m.quote !== undefined && viewerRole === "customer" && booking.status === "requested" && (
                      <button
                        onClick={() => void acceptQuote(m.id)}
                        disabled={acceptingId !== null}
                        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                      >
                        {acceptingId === m.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Check className="size-3" />
                        )}
                        {t("booking.chatAcceptQuote")}
                      </button>
                    )}
                    <p
                      className={cn(
                        "mt-1 flex items-center gap-1 text-[10px]",
                        mine ? "text-white/70" : "text-ink-400 dark:text-ink-500"
                      )}
                    >
                      <span>{m.senderRole === "worker" ? workerName ?? t("booking.disputeActorWorker") : t("booking.disputeActorCustomer")}</span>
                      <span>·</span>
                      <time dateTime={m.time}>{timeAgo(m.time, locale)}</time>
                      {mine && seenAt && (
                        <span className="inline-flex items-center gap-0.5">
                          <Check className="size-3" />
                          {t("booking.chatSeen")}
                        </span>
                      )}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* §2.3 typing indicator — the OTHER party composing. Shown only to
              live viewers (the admin dispute view stays static). */}
          {viewerRole !== "admin" && presence.typingRole && presence.typingRole !== ownRole && (
            <p className="flex items-center gap-1.5 ps-1 text-[11px] font-semibold text-ink-400">
              <span className="flex gap-0.5" aria-hidden="true">
                <span className="size-1 animate-bounce rounded-full bg-current" />
                <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
                <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
              </span>
              {t("booking.chatTyping").replace(
                "{name}",
                presence.typingRole === "worker"
                  ? workerName ?? t("booking.disputeActorWorker")
                  : t("booking.disputeActorCustomer")
              )}
            </p>
          )}

          {/* Composer — the customer and the worker can write; the admin view
              is read-only (the trail stays authoritative). */}
          {viewerRole !== "admin" && (
            <div className="flex items-end gap-2 pt-1">
              <div className="min-w-0 flex-1 space-y-1.5">
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    onCompose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={2}
                  placeholder={t("booking.chatPlaceholder")}
                  className="w-full resize-none rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-800 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100"
                />
                {/* Quote sharing — the worker attaches a price to the message
                    (major units in the field; ×100 to minor on send). */}
                {viewerRole === "worker" && (
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-400">
                    {t("booking.chatQuoteLabel")}
                    <Input
                      value={quote}
                      onChange={(e) => setQuote(e.target.value)}
                      className="h-7 w-24"
                      dir="ltr"
                      inputMode="decimal"
                      placeholder={booking.quote !== undefined ? String(booking.quote / 100) : "0"}
                    />
                  </label>
                )}
              </div>
              <Button size="sm" onClick={() => void sendMessage()} disabled={sending || !text.trim()}>
                {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                {t("booking.chatSend")}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
