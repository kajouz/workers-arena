"use client";

import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import type { Notification } from "@/lib/data/types";

/**
 * Admin "Preview email" — renders the exact email the customer/company
 * received in the admin's UI locale. The page computes BOTH locale renderings
 * server-side from the shared notification builders (renderBookingEmail /
 * renderCampaignRefundEmail — the same never-drift pattern), and this dialog
 * picks the one matching the current locale. The full HTML document is shown
 * in a sandboxed iframe (sandbox="" — no scripts, no same-origin), which is
 * the faithful email-client render.
 */
export function EmailPreviewDialog({
  type,
  subjectEn,
  subjectAr,
  htmlEn,
  htmlAr,
  recipient,
}: {
  /** App notification type (bookingConfirmed, bookingPaid, …) — i18n label key. */
  type: Notification["type"];
  subjectEn: string;
  subjectAr: string;
  htmlEn: string;
  htmlAr: string;
  recipient?: { name: string; email?: string };
}) {
  const { locale, t } = useLocale();
  const subject = locale === "ar" ? subjectAr : subjectEn;
  const html = locale === "ar" ? htmlAr : htmlEn;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Mail className="size-4" />
          {t("admin.emailPreview")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="size-4 text-brand-500" />
            {t(`notifications.types.${type}`)}
          </DialogTitle>
          <DialogDescription>{t("admin.emailPreviewSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 rounded-xl border border-ink-100 bg-ink-50/70 p-3 text-xs dark:border-ink-800 dark:bg-ink-800/40">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold uppercase tracking-wider text-ink-400">{t("admin.emailPreviewSubject")}</span>
            <span className="font-medium text-ink-800 dark:text-ink-100" dir="ltr">{subject}</span>
          </p>
          {recipient?.email && (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-bold uppercase tracking-wider text-ink-400">{t("admin.emailPreviewRecipient")}</span>
              <span className="font-medium text-ink-800 dark:text-ink-100" dir="ltr">
                {recipient.name} &lt;{recipient.email}&gt;
              </span>
            </p>
          )}
        </div>

        <iframe
          title={subject}
          srcDoc={html}
          sandbox=""
          className="h-[70vh] w-full rounded-xl border border-ink-200 bg-white dark:border-ink-800"
        />
      </DialogContent>
    </Dialog>
  );
}
