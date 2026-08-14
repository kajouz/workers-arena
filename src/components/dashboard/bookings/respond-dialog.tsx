"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Hourglass, XCircle, Loader2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { useCountdownTick } from "@/hooks/use-countdown-tick";
import { PLATFORM_FEE_MIN_MINOR, PLATFORM_FEE_RATE_BPS, computePlatformFee, isPlanFeeExempt } from "@/lib/data/booking-ui";
import { Price } from "@/components/shared/price";
import { respondBookingAction } from "@/app/actions/bookings";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { BOOKING_SLA_EXPIRE_HOURS, requestSlaExpiryMs } from "@/lib/data/types";
import type { Booking, Worker } from "@/lib/data/types";

/**
 * Worker decision dialog (docs/booking-scheduling.md §6): accept a REQUESTED
 * booking with an optional quote (prefilled from the worker's priceMin) and
 * an optional deposit — or decline it with a reason. Submits via
 * respondBookingAction; toasts the outcome and refreshes the dashboard.
 */
export function RespondDialog({ booking, worker }: { booking: Booking; worker: Worker }) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"accept" | "decline">("accept");
  const [quote, setQuote] = useState(String(worker.priceMin));
  const [deposit, setDeposit] = useState("");
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);

  // §2.2 — live SLA countdown while the dialog is open: the request auto-
  // cancels at requestSlaExpiryMs (creation + the expire window — the REAL
  // deadline, unlike the customer dialog's pre-submit estimate), ticking every
  // 30s against that fixed timestamp. Visibility-aware: pauses while the tab
  // is hidden, resyncs on visibilitychange, so it never drifts.
  const now = useCountdownTick(open && booking.status === "requested");

  const submit = async () => {
    setBusy(true);
    const f = new FormData();
    if (mode === "accept") {
      f.set("accept", "true");
      if (quote.trim()) f.set("quote", quote.trim());
      if (requireDeposit && deposit.trim()) f.set("deposit", deposit.trim());
    } else {
      f.set("accept", "false");
      if (declineReason.trim()) f.set("declineReason", declineReason.trim());
    }
    const res = await respondBookingAction(booking.id, f);
    setBusy(false);
    if (res.ok) {
      toast("success", mode === "accept" ? t("booking.accepted") : t("booking.declined"));
      setOpen(false);
      router.refresh();
    } else {
      toast("error", t("booking.respondError"));
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setMode("accept");
          setQuote(String(worker.priceMin));
          setDeposit("");
          setRequireDeposit(false);
          setDeclineReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="w-full sm:w-auto">
          {t("booking.respondTitle")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("booking.respondTitle")}</DialogTitle>
          <DialogDescription>{t("booking.respondSubtitle")}</DialogDescription>
        </DialogHeader>

        {/* §2.2 request SLA — the worker's live deadline. Mirrors the customer
            dialog's ticking clock, but from the REAL requestSlaExpiryMs (the
            booking exists here), so the worker sees exactly how long before the
            request auto-cancels and the slot frees. The nudge note rides
            alongside (booking.slaNudgeSent, stamped by both adapters). */}
        {booking.status === "requested" &&
          (() => {
            const expiryMs = requestSlaExpiryMs(booking);
            const totalMin = Math.max(0, Math.ceil((expiryMs - now) / 60_000));
            const hours = Math.floor(totalMin / 60);
            const minutes = totalMin % 60;
            const copy = hours >= 1
              ? t("booking.slaWorkerDialogCountdown")
              : t("booking.slaWorkerDialogSoon");
            // Urgency bar — fraction of the 48h window remaining, scannable at
            // a glance: >50% green, 20–50% amber, <20% red as the deadline
            // nears. Drains with the countdown (right-to-left in Arabic via
            // the RTL layout); the text line keeps the exact time.
            const pct = Math.max(
              0,
              Math.min(100, ((expiryMs - now) / (BOOKING_SLA_EXPIRE_HOURS * 3_600_000)) * 100)
            );
            const barColor = pct > 50 ? "bg-emerald-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
            // Below 20% the bar pulses softly (animate-pulse-soft, opacity
            // 1→0.55) so the red urgency state draws the eye without a modal.
            const urgent = pct <= 20;
            return (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                  <Hourglass className="mt-px size-3.5 shrink-0" />
                  <span>
                    {copy.replace("{hours}", String(hours)).replace("{minutes}", String(minutes))}
                    {booking.slaNudgeSent && <span className="ms-1 font-semibold">· {t("booking.slaNudgeTag")}</span>}
                  </span>
                </p>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-label={t("booking.slaDialogTitle")}
                  className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-900/10 dark:bg-ink-100/10"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700 ease-out",
                      barColor,
                      urgent && "animate-pulse-soft"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

        {/* Accept / decline toggle */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
          <button
            onClick={() => setMode("accept")}
            disabled={busy}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-all disabled:opacity-50",
              mode === "accept" ? "bg-white text-emerald-700 shadow-soft dark:bg-ink-950 dark:text-emerald-400" : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
            )}
          >
            <CheckCircle2 className="size-4" /> {t("booking.accept")}
          </button>
          <button
            onClick={() => setMode("decline")}
            disabled={busy}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-all disabled:opacity-50",
              mode === "decline" ? "bg-white text-red-600 shadow-soft dark:bg-ink-950 dark:text-red-400" : "text-ink-500 hover:text-ink-700 dark:text-ink-400"
            )}
          >
            <XCircle className="size-4" /> {t("booking.decline")}
          </button>
        </div>

        {mode === "accept" ? (
          <div className="space-y-4 pt-1">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500 dark:text-ink-400">
                {t("booking.quote")}
              </label>
              <Input
                inputMode="decimal"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                placeholder={t("booking.quotePlaceholder")}
                disabled={busy}
              />
              <p className="mt-1 text-[11px] text-ink-400">{t("booking.quoteHint")}</p>

              {/* M5 take rate (docs/booking-take-rate.md §5) — the "you receive
                  X · platform fee Y" split, recomputed on every keystroke with
                  the SAME computePlatformFee the adapters store, so the worker
                  sees exactly what the accept commits to. Exempt plans show
                  the waiver instead of a number. */}
              {(() => {
                const q = Number(quote);
                if (!(q > 0)) return null;
                const qMinor = Math.round(q * 100);
                const exempt = isPlanFeeExempt(worker.subscription.plan);
                // Exempt plans (Enterprise) replace the fee/net split entirely
                // with a waiver banner — there is no fee to split, so the
                // worker receives the full quote and the card says so.
                if (exempt) {
                  return (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">{t("booking.feeWaived")}</span>
                      </div>
                      <p className="mt-1 text-emerald-700/80 dark:text-emerald-400/80">
                        {t("booking.feeWaivedBody").replace("{plan}", t("plans.enterprise"))}
                      </p>
                    </div>
                  );
                }
                const feeMinor = computePlatformFee(qMinor);
                return (
                  <div className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2.5 text-xs dark:border-ink-800 dark:bg-ink-800/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-500 dark:text-ink-400">{t("booking.platformFee")}</span>
                      <span className="font-bold text-ink-900 dark:text-ink-50">
                        <Price amount={feeMinor / 100} currency={worker.currency} locale={locale} />
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-ink-400">
                      {t("booking.platformFeeHint")
                        .replace("{rate}", String(PLATFORM_FEE_RATE_BPS / 100))
                        .replace("{min}", `${PLATFORM_FEE_MIN_MINOR / 100} ${worker.currency}`)}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-ink-100 pt-1.5 dark:border-ink-800">
                      <span className="font-bold text-ink-900 dark:text-ink-50">{t("booking.youReceive")}</span>
                      <Price
                        amount={(qMinor - feeMinor) / 100}
                        currency={worker.currency}
                        locale={locale}
                        className="font-black text-brand-600 dark:text-brand-400"
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-ink-200 px-4 py-3 dark:border-ink-700">
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{t("booking.deposit")}</p>
                <p className="text-[11px] text-ink-400">{t("booking.depositHint")}</p>
              </div>
              <Switch checked={requireDeposit} onCheckedChange={setRequireDeposit} disabled={busy} />
            </div>

            {requireDeposit && (
              <Input
                inputMode="decimal"
                value={deposit}
                onChange={(e) => setDeposit(e.target.value)}
                placeholder={t("booking.depositPlaceholder")}
                disabled={busy}
              />
            )}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-ink-500 dark:text-ink-400">
              {t("booking.declineReason")}
            </label>
            <Textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder={t("booking.declineReasonPlaceholder")}
              className="min-h-[90px]"
              disabled={busy}
            />
          </div>
        )}

        <Button
          onClick={submit}
          disabled={busy || (mode === "accept" && requireDeposit && !deposit.trim())}
          size="lg"
          variant={mode === "decline" ? "destructive" : "default"}
          className="w-full"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "accept" ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {busy ? t("common.loading") : mode === "accept" ? t("booking.accept") : t("booking.decline")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
