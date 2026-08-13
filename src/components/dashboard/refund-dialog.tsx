"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { Campaign, CampaignPayment } from "@/lib/data/types";
import { formatPrice } from "@/lib/utils";
import { refundCampaignAction } from "@/app/actions/business";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";

/**
 * Two-step admin refund (docs/PAYMENTS.md): a refund is irreversible money, so
 * it needs a deliberate commit — step 1 collects the required reason (a refund
 * without one is refused by the action), step 2 shows an Apply-style summary
 * (campaign, amount, reason + what happens) before the destructive confirm
 * fires. Mirrors the plan-change confirm dialog's stage-then-commit pattern.
 */
export function RefundDialog({
  campaign,
  payment,
}: {
  campaign: Campaign;
  payment: CampaignPayment;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"reason" | "confirm">("reason");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = formatPrice(payment.amount / 100, "USD", locale);
  const campaignName = locale === "ar" ? campaign.nameAr : campaign.nameEn;

  const confirm = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    const res = await refundCampaignAction(campaign.id, reason.trim());
    setBusy(false);
    if (res.ok) {
      toast("success", t("admin.refunded"));
      setOpen(false);
      setStep("reason");
      setReason("");
    } else {
      toast("error", t("common.noResults"));
    }
    router.refresh();
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    // Reset for next open (the reason and step must not linger).
    setStep("reason");
    setReason("");
  };

  return (
    // While the refund is in flight the dialog is locked — the built-in X,
    // overlay click and Esc all funnel through onOpenChange, so ignoring the
    // change while busy keeps the dialog and the running request consistent.
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (!next) close();
        else {
          setOpen(true);
          setStep("reason");
          setReason("");
        }
      }}
    >
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {t("admin.refund")}
      </Button>
      <DialogContent>
        {step === "reason" ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("admin.refund")}</DialogTitle>
              <DialogDescription>{t("admin.refundReason")}</DialogDescription>
            </DialogHeader>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("admin.refundReasonPlaceholder")}
              className="min-h-[80px]"
              autoFocus
            />
            <DialogFooter>
              <Button variant="ghost" onClick={close} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => setStep("confirm")} disabled={!reason.trim()}>
                {t("common.continue")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("admin.refundConfirm")}</DialogTitle>
              <DialogDescription>{t("admin.refundSummary")}</DialogDescription>
            </DialogHeader>
            {/* Summary — the deliberate-commit view: what is being refunded,
                for how much, and why, before the destructive button. */}
            <div className="space-y-2 rounded-xl bg-ink-50 p-4 text-sm dark:bg-ink-800/50">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">{t("admin.campaignName")}</span>
                <span className="text-end font-bold text-ink-900 dark:text-ink-50">{campaignName}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink-500 dark:text-ink-400">{t("admin.refundAmount")}</span>
                <span className="font-black text-ink-900 dark:text-ink-50">{amount}</span>
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-ink-500 dark:text-ink-400">{t("admin.refundReason")}</span>
                <span className="text-end font-medium text-ink-900 dark:text-ink-50">{reason}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("reason")} disabled={busy}>
                {t("common.back")}
              </Button>
              <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : `${t("admin.refundConfirm")} · ${amount}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
