"use client";

import { useState } from "react";
import { Play, CheckCircle2, UserX, XCircle, Loader2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { cancelBookingAction, transitionBookingAction } from "@/app/actions/bookings";
import { RescheduleDialog } from "@/components/bookings/reschedule-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import type { Booking, BookingTransitionTarget } from "@/lib/data/types";

/**
 * Worker-side lifecycle actions (docs/booking-scheduling.md §6 — M4):
 * Start job / Mark complete / Mark no-show transition the booking forward,
 * and Cancel opens a dialog for the reason (the slot is freed). Rendered for
 * scheduled bookings (confirmed/pendingPayment/inProgress); the state machine
 * in BOOKING_TRANSITION_FROM rejects illegal moves server-side.
 */
export function BookingActions({ booking }: { booking: Booking }) {
  const { t } = useLocale();
  const router = useRouter();

  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const runTransition = async (to: BookingTransitionTarget, okKey: string) => {
    setBusy(to);
    const res = await transitionBookingAction(booking.id, to);
    setBusy(null);
    if (res.ok) {
      toast("success", t(okKey));
      router.refresh();
    } else {
      toast("error", t("booking.bookingActionError"));
    }
  };

  const submitCancel = async () => {
    setBusy("cancel");
    const f = new FormData();
    f.set("by", "worker");
    if (cancelReason.trim()) f.set("reason", cancelReason.trim());
    const res = await cancelBookingAction(booking.id, f);
    setBusy(null);
    if (res.ok) {
      toast("success", t("booking.cancelSuccess"));
      setCancelOpen(false);
      router.refresh();
    } else {
      toast("error", t("booking.bookingActionError"));
    }
  };

  const canStart = booking.status === "confirmed" || booking.status === "pendingPayment";
  const canComplete = booking.status === "inProgress";
  const canNoShow = canStart || canComplete;

  return (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-col">
      {canStart && (
        <Button
          size="sm"
          onClick={() => runTransition("inProgress", "booking.jobStarted")}
          disabled={busy !== null}
          className="w-full sm:w-auto"
        >
          {busy === "inProgress" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {t("booking.startJob")}
        </Button>
      )}
      {canComplete && (
        <Button
          size="sm"
          onClick={() => runTransition("completed", "booking.jobCompleted")}
          disabled={busy !== null}
          className="w-full sm:w-auto"
        >
          {busy === "completed" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {t("booking.markComplete")}
        </Button>
      )}
      {canNoShow && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => runTransition("noShow", "booking.markedNoShow")}
          disabled={busy !== null}
          className="w-full sm:w-auto"
        >
          {busy === "noShow" ? <Loader2 className="size-4 animate-spin" /> : <UserX className="size-4" />}
          {t("booking.markNoShow")}
        </Button>
      )}

      {(booking.status === "confirmed" || booking.status === "inProgress") && (
        <RescheduleDialog booking={booking} by="worker" />
      )}

      <Dialog
        open={cancelOpen}
        onOpenChange={(v) => {
          setCancelOpen(v);
          if (v) setCancelReason("");
        }}
      >
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto dark:border-red-900/60 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <XCircle className="size-4" />
            {t("booking.cancelBooking")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("booking.cancelTitle")}</DialogTitle>
            <DialogDescription>{t("booking.cancelSubtitle")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-ink-500 dark:text-ink-400">
              {t("booking.cancelReason")}
            </label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t("booking.cancelReasonPlaceholder")}
              className="min-h-[90px]"
              disabled={busy === "cancel"}
            />
          </div>
          <Button
            onClick={submitCancel}
            disabled={busy === "cancel"}
            size="lg"
            variant="destructive"
            className="w-full"
          >
            {busy === "cancel" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
            {t("booking.cancelConfirm")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
