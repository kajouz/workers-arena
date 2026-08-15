"use client";

import { useState } from "react";
import { Phone, MessageCircle, Mail, Globe, Send, ShieldAlert, BadgeCheck, CalendarClock, ShieldCheck, Users } from "lucide-react";
import type { BookingSlot, Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VerifiedBadge, EmergencyBadge } from "@/components/shared/badges";
import { requestServiceAction } from "@/app/actions/auth";
import { toast } from "@/components/ui/toast";
import { Price } from "@/components/shared/price";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";
import { BookingDialog } from "./booking-dialog";
import { QuoteRequestDialog } from "./quote-request-dialog";

export function ContactCard({
  worker,
  slots,
  candidates,
}: {
  worker: Worker;
  slots: BookingSlot[];
  /** The pickable worker pool for multi-candidate quotes (profile + related). */
  candidates?: Worker[];
}) {
  const { locale, t } = useLocale();
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;

  const sendRequest = async () => {
    setSending(true);
    const res = await requestServiceAction(worker.id);
    setSending(false);
    // Only claim success when the lead actually persisted (false in real mode
    // until W2) — never toast success for a request that wasn't recorded.
    if (!res.ok) return;
    setMessage("");
    toast("success", t("worker.requestSuccess").replace("{name}", name));
  };

  return (
    <Card className="sticky top-24 overflow-hidden border-0 shadow-lift">
      <CardHeader className="bg-gradient-to-br from-brand-500 to-brand-600 text-white">
        <CardTitle className="text-white">
          {t("worker.requestService")}
        </CardTitle>
        <CardDescription className="text-white/80">
          {t("worker.requestBody").replace("{name}", name)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-3 dark:bg-ink-800">
          <span className="text-xs font-medium text-ink-500 dark:text-ink-400">{t("worker.priceRange")}</span>
          <Price amount={worker.priceMin} currency={worker.currency} locale={locale} className="text-sm font-black text-brand-600 dark:text-brand-400" />
          <span className="text-xs text-ink-400">–</span>
          <Price amount={worker.priceMax} currency={worker.currency} locale={locale} className="text-sm font-black text-brand-600 dark:text-brand-400" />
        </div>

        <BookingDialog worker={worker} slots={slots}>
          <Button className="w-full" disabled={!worker.available}>
            <CalendarClock className="size-4" />
            {t("booking.dialogTitle")}
          </Button>
        </BookingDialog>

        {/* Multi-candidate quotes (docs/multi-candidate-quotes.md) — the
            structural fix to the selection workflow: instead of committing to
            ONE worker, invite up to 3 to bid on the same job and pick a winner.
            Candidates = this worker + related (same trade). */}
        {candidates && candidates.length > 0 && (
          <QuoteRequestDialog candidates={candidates}>
            <Button className="w-full" variant="outline" disabled={!worker.available}>
              <Users className="size-4" />
              {t("booking.quotesCta")}
            </Button>
          </QuoteRequestDialog>
        )}
        {candidates && candidates.length > 0 && (
          <p className="-mt-2 text-center text-[11px] text-ink-400">{t("booking.quotesCtaHint")}</p>
        )}

        {/* M5 — fee-waiver awareness at the point of checkout (docs/booking-take-rate.md).
            Customers who found the worker via the fee-waived search filter see the perk
            persist right here, before they open the dialog. Same exemption source as the
            card badge and the search filter. */}
        {isPlanFeeExempt(worker.subscription.plan) && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="size-4 shrink-0" />
            {t("worker.feeWaivedHint")}
          </div>
        )}

        <div>
          <Input placeholder={t("auth.phone")} className="mb-2" aria-label={t("auth.phone")} />
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("worker.requestBody").replace("{name}", name)}
            rows={3}
          />
          <Button variant="outline" className="mt-3 w-full" onClick={sendRequest} disabled={sending || !message.trim()}>
            <Send className="size-4" />
            {t("worker.requestService")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button asChild variant="success">
            <a href={`tel:${worker.phone}`}>
              <Phone className="size-4" /> {t("common.call")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`https://wa.me/${worker.whatsapp}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" /> {t("common.whatsapp")}
            </a>
          </Button>
          <Button asChild variant="outline" className="col-span-2">
            <a href={`mailto:${worker.email}`}>
              <Mail className="size-4" /> {worker.email}
            </a>
          </Button>
          {worker.website && (
            <Button asChild variant="outline" className="col-span-2">
              <a href={`https://${worker.website}`} target="_blank" rel="noopener noreferrer">
                <Globe className="size-4" /> {worker.website}
              </a>
            </Button>
          )}
        </div>

        {/* badges */}
        <div className="flex flex-wrap gap-2 pt-1">
          {worker.verified && <VerifiedBadge />}
          {worker.emergency && <EmergencyBadge />}
        </div>

        {/* safety */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
            <ShieldAlert className="size-4" />
            {t("worker.safetyTitle")}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {[t("worker.safety1"), t("worker.safety2"), t("worker.safety3"), t("worker.safety4")].map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-xs text-ink-600 dark:text-ink-300">
                <BadgeCheck className="mt-0.5 size-3 shrink-0 text-amber-500" />
                {tip}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
