"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Mail, RotateCcw, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { emailBookingAuditAction, type AuditRecipientKind } from "@/app/actions/bookings";
import { clearAuditDocLocale, readAuditDocLocale, writeAuditDocLocale } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";
import type { Locale } from "@/lib/i18n/config";

/**
 * §2.4 on-demand audit email (docs/ENHANCEMENT-PLAN.md §2.4) — the sibling of
 * BookingPrintButton: pick who gets the trail (customer / worker), and the
 * server action renders the same standalone audit document into a real PDF
 * (system Chrome) and dispatches it through the email channel as an
 * attachment. Recipients without an email address on file are disabled with a
 * hint. Errors map to localized copy (no-email / render-failed / generic).
 */
export function BookingEmailButton({
  booking,
  workerName,
  workerEmail,
}: {
  booking: Booking;
  workerName?: string;
  workerEmail?: string;
}) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState<AuditRecipientKind[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<null | "ok" | string>(null);
  // The DOCUMENT's language: the last language chosen (persisted in
  // localStorage, shared with the print dialog), falling back to the current
  // page locale — so the PDF attachment doesn't always follow the page locale.
  const [docLocale, setDocLocale] = useState<Locale>(() => readAuditDocLocale(locale));

  function chooseDocLocale(next: Locale) {
    setDocLocale(next);
    writeAuditDocLocale(next);
  }

  // Forget the remembered language and go back to following the page locale.
  function resetDocLocale() {
    clearAuditDocLocale();
    setDocLocale(locale);
  }

  const recipients: { kind: AuditRecipientKind; name: string; email?: string }[] = [
    { kind: "customer", name: booking.customerName, email: booking.customerEmail },
    { kind: "worker", name: workerName ?? booking.workerId, email: workerEmail },
  ];

  const toggle = (kind: AuditRecipientKind) =>
    setSelected((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));

  const send = async () => {
    if (sending || !selected.length) return;
    setSending(true);
    setDone(null);
    const res = await emailBookingAuditAction(booking.number, selected, docLocale);
    setSending(false);
    setDone(res.ok ? "ok" : (res.error ?? "send-failed"));
  };

  const errorLabel = (code: string) =>
    code === "no-email"
      ? t("booking.emailAuditNoEmail")
      : code === "render-failed"
        ? t("booking.emailAuditNoChrome")
        : t("booking.emailAuditFailed");

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) {
          setSelected([]);
          setDone(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Mail className="size-4" />
          {t("booking.emailAudit")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-brand-500" />
            {t("booking.emailAuditTitle")}
            <span className="font-mono text-sm font-bold text-ink-500 dark:text-ink-400" dir="ltr">
              {booking.number}
            </span>
          </DialogTitle>
          <DialogDescription>{t("booking.emailAuditHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-400 dark:text-ink-500">
            {t("booking.emailAuditRecipients")}
          </p>
          {recipients.map((r) => {
            const disabled = !r.email;
            return (
              <label
                key={r.kind}
                className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                  disabled
                    ? "opacity-50"
                    : "cursor-pointer hover:border-brand-300 dark:hover:border-brand-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(r.kind)}
                  disabled={disabled}
                  onChange={() => toggle(r.kind)}
                  className="mt-0.5 size-4 accent-brand-500"
                  aria-label={r.name}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-900 dark:text-ink-50">{r.name}</span>
                  <span className="block truncate text-xs text-ink-400 dark:text-ink-500" dir="ltr">
                    {r.email ?? t("booking.emailAuditNoEmail")}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {done === "ok" && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            {t("booking.emailAuditSent")} · {t("booking.emailAuditSentDetail")}
          </p>
        )}
        {done && done !== "ok" && (
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">{errorLabel(done)}</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The document's language — the last choice is remembered (shared
              with the print dialog), so the PDF attachment doesn't always
              follow the current page locale. */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label={t("common.language")}
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 p-1 dark:border-ink-800"
            >
              {(["en", "ar"] as const).map((l) => {
                const active = docLocale === l;
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={active}
                    onClick={() => chooseDocLocale(l)}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                      active
                        ? "bg-brand-600 text-white"
                        : "text-ink-500 hover:text-ink-800 dark:text-ink-400 dark:hover:text-ink-200"
                    }`}
                  >
                    {l === "en" ? t("misc.languageEnglish") : t("misc.languageArabic")}
                  </button>
                );
              })}
            </div>
            {/* Forget the remembered language and follow the page locale again.
                Disabled when the document already follows the page locale. */}
            <button
              type="button"
              onClick={resetDocLocale}
              disabled={docLocale === locale}
              title={t("booking.printReset")}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-bold text-ink-400 transition-colors hover:text-ink-700 disabled:pointer-events-none disabled:opacity-40 dark:text-ink-500 dark:hover:text-ink-200"
            >
              <RotateCcw className="size-3" />
              {t("booking.printReset")}
            </button>
          </div>
          <Button size="sm" onClick={send} disabled={sending || selected.length === 0}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? t("booking.emailAuditSending") : t("booking.emailAuditSend")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
