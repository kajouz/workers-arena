"use client";

import { useRef, useState } from "react";
import { Printer, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { clearAuditDocLocale, readAuditDocLocale, renderBookingAuditPrint, writeAuditDocLocale } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";
import type { Locale } from "@/lib/i18n/config";

/**
 * Printable audit-trail export (docs/ENHANCEMENT-PLAN.md §2.4) — the PDF/print
 * view of one booking's event trail, shared by the customer booking row and
 * the admin dispute page. Opens a dialog rendering the standalone print
 * document (renderBookingAuditPrint) in a sandboxed iframe (sandbox="allow-same-origin"
 * only — no scripts; the content is fully escaped generated HTML, and the
 * same-origin flag is required so the parent can target the frame's print
 * dialog); the dialog's Print button calls iframe.contentWindow.print(), so
 * the browser saves exactly the audit document as PDF.
 */
export function BookingPrintButton({
  booking,
  workerName,
  compact = false,
}: {
  booking: Booking;
  workerName?: string;
  /** Render the trigger as a compact text link (the expanded-timeline header)
   * instead of the full outline button. Same dialog either way. */
  compact?: boolean;
}) {
  const { locale, t } = useLocale();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // The DOCUMENT's language: the last language chosen (persisted in
  // localStorage, shared with the email dialog), falling back to the current
  // page locale. Reading it in the initializer is safe — the value only feeds
  // the dialog's iframe content, which mounts client-side when the dialog
  // opens, so there is no server/client hydration mismatch.
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

  return (
    <Dialog>
      <DialogTrigger asChild>
        {compact ? (
          <button
            type="button"
            aria-label={`${t("booking.print")} ${booking.number}`}
            className="inline-flex items-center gap-1 rounded text-[11px] font-bold text-brand-600 transition-colors hover:text-brand-700 hover:underline dark:text-brand-400 dark:hover:text-brand-300"
          >
            <Printer className="size-3" />
            {t("booking.print")}
          </button>
        ) : (
          <Button variant="outline" size="sm" className="h-8">
            <Printer className="size-4" />
            {t("booking.print")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-4 text-brand-500" />
            {t("booking.printTitle")}
            <span className="font-mono text-sm font-bold text-ink-500 dark:text-ink-400" dir="ltr">
              {booking.number}
            </span>
          </DialogTitle>
          <DialogDescription>{t("booking.printSubtitle")}</DialogDescription>
        </DialogHeader>

        <iframe
          ref={iframeRef}
          title={`${booking.number} — ${t("booking.printTitle")}`}
          srcDoc={renderBookingAuditPrint(booking, { locale: docLocale, workerName })}
          sandbox="allow-same-origin"
          className="h-[70vh] w-full rounded-xl border border-ink-200 bg-white dark:border-ink-800"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* The document's language — the last choice is remembered, so the
              print/PDF output doesn't always follow the current page locale. */}
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
          <Button size="sm" onClick={() => iframeRef.current?.contentWindow?.print()}>
            <Printer className="size-4" />
            {t("booking.print")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
