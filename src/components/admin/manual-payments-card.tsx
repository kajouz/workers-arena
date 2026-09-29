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
 *
 * Step 3 (faster confirmation): oldest first, each row shows how long it has
 * waited against the 2-hour target, and the payer's receipt photo (uploaded on
 * the instructions page) is shown in the confirm dialog.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Clock, ImageIcon } from "lucide-react";
import { useSsrSafeNow } from "@/hooks/use-ssr-safe-now";
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

/** The confirmation target (revenue plan Step 3). */
const TARGET_MS = 2 * 60 * 60 * 1000;

/** "45m", "3h 12m", "2d 4h". */
function waited(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function ManualPaymentsCard({ payments: unsorted, nowSeed }: { payments: PendingManualPayment[]; nowSeed: number }) {
  const { locale, t } = useLocale();
  // Oldest first: the longest wait is the next one to clear.
  const payments = [...unsorted].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const now = useSsrSafeNow(nowSeed, { tick: true, intervalMs: 60_000 });
  const waitOf = (p: PendingManualPayment) => now - Date.parse(p.createdAt);
  const overTarget = payments.filter((p) => waitOf(p) > TARGET_MS).length;
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
        {payments.length > 0 && (
          <span className="ms-auto flex shrink-0 items-center gap-1.5">
            <Badge variant="outline">{t("payments.adminPendingWaiting").replace("{count}", String(payments.length))}</Badge>
            {overTarget > 0 && (
              <Badge variant="danger">{t("payments.adminPendingOverTarget").replace("{count}", String(overTarget))}</Badge>
            )}
          </span>
        )}
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
                      <span className="me-1 inline-flex">
                        {p.method === "omt" ? <OMTIconCompact className="size-3" /> : <WishIconCompact className="size-3" />}
                      </span>
                      {t(`payments.method${p.method[0].toUpperCase()}${p.method.slice(1)}`)}
                    </Badge>
                    <span className="font-mono">{p.reference}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span
                      className={
                        waitOf(p) > TARGET_MS
                          ? "flex items-center gap-1 font-bold text-red-600 dark:text-red-400"
                          : waitOf(p) > TARGET_MS / 2
                            ? "flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400"
                            : "flex items-center gap-1 text-ink-400"
                      }
                    >
                      <Clock className="size-3" />
                      {t("payments.adminPendingWaited").replace("{time}", waited(waitOf(p)))}
                    </span>
                    {p.receiptUploadedAt && (
                      <Badge variant="success" className="gap-1">
                        <ImageIcon className="size-3" /> {t("payments.adminPendingReceipt")}
                      </Badge>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <p className="text-sm font-black text-ink-900 dark:text-ink-50">
                    {formatPrice(p.amount / 100, "USD", locale)}
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
                    formatPrice(confirming.amount / 100, "USD", locale)
                  )
                  .replace("{method}", t(`payments.method${confirming.method[0].toUpperCase()}${confirming.method.slice(1)}`))}
            </DialogDescription>
          </DialogHeader>
          {confirming && (
            <p className="rounded-xl bg-ink-50 px-4 py-3 text-center font-mono text-sm font-black text-brand-600 dark:bg-ink-800 dark:text-brand-400">
              {t("payments.adminPendingRef").replace("{ref}", confirming.reference)}
            </p>
          )}
          {confirming &&
            (confirming.receiptUploadedAt ? (
              <a
                href={`/api/admin/payments/receipt?ref=${encodeURIComponent(confirming.reference)}`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- an admin-only, uncached image route */}
                <img
                  src={`/api/admin/payments/receipt?ref=${encodeURIComponent(confirming.reference)}`}
                  alt={t("payments.adminPendingReceiptAlt")}
                  className="max-h-72 w-full rounded-xl border border-ink-200 object-contain dark:border-ink-700"
                />
              </a>
            ) : (
              <p className="text-center text-[11px] text-ink-400">{t("payments.adminPendingNoReceipt")}</p>
            ))}
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
