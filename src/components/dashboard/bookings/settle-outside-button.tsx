"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * §SETTLEMENT — "we settled this directly" (the worker's honest exit)
 * ────────────────────────────────────────────────────────────────────────────
 * The second payment leg (docs/booking-take-rate.md §6) assumes the customer
 * pays the balance through the platform. Plenty of jobs end in cash on the
 * doorstep instead, and before this control existed the worker had no way to
 * say so — the platform went on billing the customer for a job that was already
 * paid, and the worker's statement showed a payout that could never land.
 *
 * Declaring it here is deliberately consequence-forward: the dialog states, in
 * the worker's own words, that the platform holds nothing, credits no earnings,
 * and turns its fee into a claim recoverable from the credit balance. A worker
 * who reads it can still do it — that is the point; they just cannot do it by
 * accident, and the record is honest either way.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { markBookingSettledOutsideAction } from "@/app/actions/bookings";

export function SettleOutsideButton({ bookingId, className }: { bookingId: string; className?: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    const res = await markBookingSettledOutsideAction(bookingId, reason.trim() || undefined);
    setBusy(false);
    if (res.ok) {
      toast("success", t("booking.settlementOutsideDone"));
      setOpen(false);
      router.refresh();
    } else {
      toast("error", t("booking.settlementOutsideFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className={className}>
          <HandCoins className="me-1.5 size-4" />
          {t("booking.settlementOutsideAction")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("booking.settlementOutsideTitle")}</DialogTitle>
          <DialogDescription>{t("booking.settlementOutsideBody")}</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("booking.settlementOutsideReason")}
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={confirm} disabled={busy}>
              {busy ? <Loader2 className="me-1.5 size-4 animate-spin" /> : null}
              {t("booking.settlementOutsideConfirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
