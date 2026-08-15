"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Hourglass, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/avatar";
import { Price } from "@/components/shared/price";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { formatSlotRange } from "@/lib/data/booking-ui";
import { availableSlotsAction, selectQuoteAction } from "@/app/actions/bookings";
import { cn } from "@/lib/utils";
import { QUOTE_SLA_MS } from "@/lib/data/types";
import { useSsrSafeNow } from "@/hooks/use-ssr-safe-now";
import { SlaUrgencyBar } from "./sla-urgency-bar";
import type { QuoteRequest, QuoteStatus, Worker } from "@/lib/data/types";

/** Per-worker display data resolved server-side (same shape as the booking rows). */
export interface QuoteWorker {
  nameEn: string;
  nameAr: string;
  slug: string;
  hue: number;
}

const OPEN_STATUSES: QuoteStatus[] = ["open", "quoting"];

const STATUS_KEY: Record<QuoteStatus, string> = {
  open: "booking.quotesStatus.open",
  quoting: "booking.quotesStatus.quoting",
  selected: "booking.quotesStatus.selected",
  expired: "booking.quotesStatus.expired",
  cancelled: "booking.quotesStatus.cancelled",
};

/**
 * Multi-candidate quotes (docs/multi-candidate-quotes.md §7) — one card per
 * quote job on the customer's /bookings: a row per invited worker with their
 * bid (or "no quote yet"), and — while the job is still open — an
 * "Accept this quote" action that fetches the winner's AVAILABLE slots and
 * submits the pick (selectQuoteAction). After the pick, the winner row shows
 * "You chose this quote" and the losers "Chose another quote".
 */
export function QuoteRequestCard({
  quoteRequest,
  workers,
  nowSeed,
}: {
  quoteRequest: QuoteRequest;
  workers: Record<string, QuoteWorker | undefined>;
  /** Date.now() at server render time — hydration-safe now (useSsrSafeNow). */
  nowSeed: number;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const open = OPEN_STATUSES.includes(quoteRequest.status);
  // Closes at the SLA deadline the cron enforces — the stored expiresAt (both
  // adapters stamp creation + QUOTE_SLA_MS), computed from createdAt as a
  // fallback. Only while the job is open does the closing window render.
  const createdMs = Date.parse(quoteRequest.createdAt);
  const closesAt = Number.isNaN(createdMs)
    ? null
    : (() => {
        const expiryMs = quoteRequest.expiresAt ? Date.parse(quoteRequest.expiresAt) : NaN;
        return Number.isNaN(expiryMs) ? createdMs + QUOTE_SLA_MS : expiryMs;
      })();

  // §2.2 quote SLA — hydration-safe now that TICKS while the job is open, so
  // the closing window drains live against the real deadline (the seed keeps
  // the SSR markup and the client's first render identical, then the clock
  // takes over after mount — the same pattern as the booking rows).
  const now = useSsrSafeNow(nowSeed, { tick: true, active: open && closesAt !== null });
  const [pickingFor, setPickingFor] = useState<string | null>(null); // winner booking id
  const [slots, setSlots] = useState<{ id: string; startAt: string; endAt: string }[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selecting, setSelecting] = useState<string | null>(null); // slot id in flight

  const loadSlots = async (bookingId: string) => {
    setLoadingSlots(true);
    setPickingFor(bookingId);
    setSlots(null);
    const res = await availableSlotsAction(quoteRequest.bookings.find((b) => b.id === bookingId)?.workerId ?? "");
    setLoadingSlots(false);
    setSlots(res.ok && res.slots ? res.slots : []);
  };

  const pick = async (bookingId: string, slotId: string) => {
    if (selecting) return;
    setSelecting(slotId);
    const fd = new FormData();
    fd.set("winnerBookingId", bookingId);
    fd.set("slotId", slotId);
    const res = await selectQuoteAction(quoteRequest.id, fd);
    setSelecting(null);
    if (res.ok) {
      toast("success", t("booking.quotesSelectSuccess"));
      router.refresh();
      return;
    }
    if (res.error === "slot-taken") {
      toast("error", t("booking.quotesSelectSlotTaken"));
      setSlots((prev) => prev?.filter((s) => s.id !== slotId) ?? []);
      return;
    }
    toast("error", t("booking.quotesClosed"));
  };

  return (
    <div className="rounded-xl border border-ink-100 p-4 dark:border-ink-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-black text-brand-600 dark:text-brand-400">
          {quoteRequest.number}
        </span>
        <Badge variant="secondary">{t(STATUS_KEY[quoteRequest.status])}</Badge>
      </div>

      <p className="mt-2 text-sm font-black text-ink-900 dark:text-ink-50">{quoteRequest.jobTitle}</p>
      {quoteRequest.note && <p className="mt-0.5 text-xs leading-relaxed text-ink-500 dark:text-ink-400">“{quoteRequest.note}”</p>}

      {/* §2.2 quote SLA — the closing window drains with the SAME urgency bar as
          the booking rows' request SLA (shared SlaUrgencyBar): a live ticking
          "Closes in Nh Nm" line + the green→amber→red bar against the real
          QUOTE_SLA_MS deadline, so the customer sees the quote expire the way
          they see the request auto-cancel. */}
      {open && closesAt !== null && (() => {
        const totalMin = Math.max(0, Math.ceil((closesAt - now) / 60_000));
        const hours = Math.floor(totalMin / 60);
        const minutes = totalMin % 60;
        const copy = t("booking.quotesExpires")
          .replace("{hours}", String(hours))
          .replace("{minutes}", String(minutes));
        return (
          <div className="mt-2.5 w-full">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
              <Hourglass className="mt-px size-3.5 shrink-0" />
              <span>{copy}</span>
            </p>
            <SlaUrgencyBar
              expiryAt={closesAt}
              windowMs={QUOTE_SLA_MS}
              now={now}
              label={copy}
              className="mt-1.5"
            />
          </div>
        );
      })()}

      <div className="mt-3 space-y-2">
        {quoteRequest.bookings.map((b) => {
          const w = workers[b.workerId];
          const isWinner = b.status === "requested" || b.status === "pendingPayment" || b.status === "confirmed" || b.status === "inProgress";
          const lost = b.status === "declined";
          const picking = pickingFor === b.id;
          return (
            <div key={b.id} className="rounded-xl border border-ink-100 p-3 dark:border-ink-800">
              <div className="flex flex-wrap items-center gap-3">
                <GradientAvatar name={w?.nameEn ?? b.workerId} className="size-9" />
                <div className="min-w-0 flex-1">
                  {w ? (
                    <Link
                      href={`/workers/${w.slug}`}
                      className="block truncate text-sm font-black text-ink-900 hover:underline dark:text-ink-50"
                    >
                      {locale === "ar" ? w.nameAr : w.nameEn}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-black text-ink-900 dark:text-ink-50">{b.workerId}</p>
                  )}
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {isWinner ? (
                      <span className="font-black text-emerald-600 dark:text-emerald-400">{t("booking.quotesAccepted")}</span>
                    ) : b.status === "quoted" && b.quote !== undefined ? (
                      <Price amount={b.quote / 100} currency={b.currency} locale={locale} className="font-black text-brand-600 dark:text-brand-400" />
                    ) : b.status === "declined" ? (
                      t("booking.quotesChoseAnother")
                    ) : (
                      t("booking.quotesNoBid")
                    )}
                  </p>
                </div>

                {open && b.status === "quoted" && (
                  <Button size="sm" variant="outline" onClick={() => (picking ? setPickingFor(null) : loadSlots(b.id))} disabled={loadingSlots && !picking}>
                    {loadingSlots && picking ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarClock className="size-3.5" />}
                    {t("booking.quotesAccept")}
                  </Button>
                )}
                {!open && isWinner && (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                {lost && !isWinner && <XCircle className="size-4 text-ink-300 dark:text-ink-600" />}
              </div>

              {picking && (
                <div className="mt-3 border-t border-ink-100 pt-3 dark:border-ink-800">
                  <p className="mb-2 text-[11px] font-bold text-ink-500 dark:text-ink-400">
                    {t("booking.quotesPickSlotTitle").replace("{name}", locale === "ar" ? (w?.nameAr ?? "") : (w?.nameEn ?? ""))}
                  </p>
                  {loadingSlots ? (
                    <p className="flex items-center gap-2 text-xs text-ink-400">
                      <Loader2 className="size-3.5 animate-spin" /> {t("common.loading")}
                    </p>
                  ) : slots && slots.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => pick(b.id, s.id)}
                          disabled={selecting !== null}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50",
                            selecting === s.id
                              ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                              : "border-ink-100 bg-white text-ink-600 hover:border-brand-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300"
                          )}
                        >
                          {formatSlotRange(s, locale)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-ink-400">{t("booking.quotesPickSlotEmpty")}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {open && quoteRequest.bookings.every((b) => b.status === "quoting") && (
        <p className="mt-3 text-[11px] text-ink-400">{t("booking.quotesNoBidsYet")}</p>
      )}
    </div>
  );
}
