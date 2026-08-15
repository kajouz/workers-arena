"use client";

/**
 * §2.4 admin dispute view — the two platform actions an admin can take on a
 * booking:
 *   • Cancel booking — frees the slot, CANCELLED audit event with the admin
 *     actor + reason, notifies BOTH the customer and the worker, and always
 *     refunds a paid deposit.
 *   • Refund deposit — returns the PAID deposit to the customer WITHOUT
 *     cancelling the booking (money-only correction; REFUNDED audit event).
 * Both are destructive money actions, so each follows the campaign-refund
 * dialog's stage-then-commit pattern: step 1 collects the required reason
 * (both server actions refuse without one), step 2 shows a deliberate-commit
 * summary before the destructive confirm fires. Hidden entirely when the
 * booking's state makes them impossible (terminal booking → no cancel;
 * no PAID deposit → no refund).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { adminCancelBookingAction, refundBookingDepositAction } from "@/app/actions/bookings";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { Booking } from "@/lib/data/types";
import { formatPrice } from "@/lib/utils";

type ActionKind = "cancel" | "refund";

const TERMINAL: ReadonlyArray<Booking["status"]> = ["completed", "cancelled", "declined", "noShow"];

export function AdminBookingActions({ booking }: { booking: Booking }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [kind, setKind] = useState<ActionKind | null>(null);
  const [step, setStep] = useState<"reason" | "confirm">("reason");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const open = kind !== null;
  const canCancel = !TERMINAL.includes(booking.status);
  const canRefund = booking.paymentStatus === "paid";

  const close = () => {
    if (busy) return;
    setKind(null);
    setStep("reason");
    setReason("");
  };

  const confirm = async () => {
    if (!reason.trim() || busy || !kind) return;
    setBusy(true);
    const form = new FormData();
    form.set("reason", reason.trim());
    const res =
      kind === "cancel"
        ? await adminCancelBookingAction(booking.id, form)
        : await refundBookingDepositAction(booking.id, form);
    setBusy(false);
    if (res.ok) {
      toast("success", t("booking.adminActionDone"));
      close();
    } else {
      toast("error", kind === "cancel" ? t("booking.adminCancelError") : t("booking.adminRefundError"));
    }
    router.refresh();
  };

  if (!canCancel && !canRefund) return null;

  const titleKey = kind === "cancel" ? "booking.adminCancelTitle" : "booking.adminRefundTitle";
  const summaryKey = kind === "cancel" ? "booking.adminCancelSummary" : "booking.adminRefundSummary";
  const confirmLabel = kind === "cancel" ? t("booking.adminCancelConfirm") : t("booking.adminRefundConfirm");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canCancel && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setKind("cancel");
              setStep("reason");
              setReason("");
            }}
          >
            {t("booking.adminCancel")}
          </Button>
        )}
        {canRefund && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setKind("refund");
              setStep("reason");
              setReason("");
            }}
          >
            {t("booking.adminRefundDeposit")}
          </Button>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (!next) close();
          else {
            setStep("reason");
            setReason("");
          }
        }}
      >
        <DialogContent>
          {step === "reason" ? (
            <>
              <DialogHeader>
                <DialogTitle>{t(titleKey)}</DialogTitle>
                <DialogDescription>{t(summaryKey)}</DialogDescription>
              </DialogHeader>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t(
                  kind === "cancel" ? "booking.adminCancelReasonPlaceholder" : "booking.adminCancelReasonPlaceholder"
                )}
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
                <DialogTitle>{t("booking.adminCancelTitle")}</DialogTitle>
                <DialogDescription>{t("booking.adminRefundTitle")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2 rounded-xl bg-ink-50 p-4 text-sm dark:bg-ink-800/50">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink-500 dark:text-ink-400">{t("booking.bookingNumber")}</span>
                  <span className="font-mono text-sm font-bold text-ink-900 dark:text-ink-50" dir="ltr">
                    {booking.number}
                  </span>
                </div>
                {booking.deposit != null && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-ink-500 dark:text-ink-400">{t("booking.deposit")}</span>
                    <span className="font-black text-ink-900 dark:text-ink-50">
                      {formatPrice(booking.deposit / 100, booking.currency, locale)}
                    </span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <span className="shrink-0 text-ink-500 dark:text-ink-400">{t("booking.adminCancelReason")}</span>
                  <span className="text-end font-medium text-ink-900 dark:text-ink-50">{reason}</span>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep("reason")} disabled={busy}>
                  {t("common.back")}
                </Button>
                <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : confirmLabel}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
