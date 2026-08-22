"use client";

/**
 * §Lebanon — the /admin pending-payments card: every PENDING manual
 * (OMT/Whish) payment the customer paid offline (booking deposits, campaign
 * purchases, and the paid upgrades — subscription renewal / verification /
 * featured / emergency). The MANUAL methods have no webhook, so the admin's
 * "Confirm receipt" IS the provider callback: it runs the same confirm paths
 * a webhook would have run (confirmBookingPayment / confirmCampaignPayment /
 * confirmPurchase), which activates the booking / purchase. The reference the
 * customer was told to include is shown so the admin can match the transfer.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote } from "lucide-react";
import { OMTIconCompact } from "@/components/payments/icons/omt-icon";
import { WishIconCompact } from "@/components/payments/icons/wish-icon";
import { useLocale } from "@/components/providers/locale-provider";
import type { PendingManualPayment } from "@/lib/data/types";
import { confirmManualPaymentAction } from "@/app/actions/business";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { formatPrice } from "@/lib/utils";

const METHOD_STYLE: Record<"omt" | "whish", string> = {
  omt: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  whish: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

export function ManualPaymentsCard({ payments }: { payments: PendingManualPayment[] }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [confirming, setConfirming] = useState<PendingManualPayment | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!confirming || busy) return;
    setBusy(true);
    const res = await confirmManualPaymentAction(confirming.id);
    setBusy(false);
    if (res.ok) {
      toast("success", t("payments.adminPendingDone"));
      setConfirming(null);
      router.refresh();
    } else {
      toast("error", t("payments.adminPendingError"));
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <Banknote className="size-4 shrink-0 text-brand-500" />
        <CardTitle className="min-w-0 text-base">{t("payments.adminPendingTitle")}</CardTitle>
        {payments.length > 0 && <Badge variant="danger">{payments.length}</Badge>}
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <p className="py-3 text-center text-sm text-ink-400">{t("payments.adminPendingEmpty")}</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-4 py-2.5 dark:bg-ink-800">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? p.labelAr : p.labelEn}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400">
                    <Badge className={METHOD_STYLE[p.method]}>
                      <span className="mr-1 inline-flex">
                        {p.method === "omt" ? <OMTIconCompact className="size-3" /> : <WishIconCompact className="size-3" />}
                      </span>
                      {t(`payments.method${p.method[0].toUpperCase()}${p.method.slice(1)}`)}
                    </Badge>
                    <span className="font-mono">{p.reference}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-black text-ink-900 dark:text-ink-50">
                    {formatPrice(p.amount / 100, p.currency === "LBP" ? "LBP" : "USD", locale)}
                  </p>
                  <Button size="sm" onClick={() => setConfirming(p)}>
                    {t("payments.adminPendingConfirm")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && !busy && setConfirming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("payments.adminPendingConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {confirming &&
                t("payments.adminPendingConfirmBody")
                  .replace(
                    "{amount}",
                    formatPrice(confirming.amount / 100, confirming.currency === "LBP" ? "LBP" : "USD", locale)
                  )
                  .replace("{method}", t(`payments.method${confirming.method[0].toUpperCase()}${confirming.method.slice(1)}`))}
            </DialogDescription>
          </DialogHeader>
          {confirming && (
            <p className="rounded-xl bg-ink-50 px-4 py-3 text-center font-mono text-sm font-black text-brand-600 dark:bg-ink-800 dark:text-brand-400">
              {t("payments.adminPendingRef").replace("{ref}", confirming.reference)}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button onClick={confirm} disabled={busy}>
              {busy ? t("common.loading") : t("payments.adminPendingConfirmCommit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
