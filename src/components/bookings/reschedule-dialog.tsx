"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CalendarX2, Loader2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { availableSlotsAction, rescheduleBookingAction } from "@/app/actions/bookings";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Booking } from "@/lib/data/types";

type SlotOption = { id: string; startAt: string; endAt: string };

function formatOption(s: SlotOption, locale: string): string {
  const d = new Date(s.startAt);
  const date = d.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", { weekday: "short", day: "numeric", month: "short" });
  const time = `${d.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" })} – ${new Date(s.endAt).toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return `${date} · ${time}`;
}

/**
 * M4 reschedule dialog (docs/booking-scheduling.md §7) — shared by the worker
 * dashboard (BookingsPanel) and the customer /bookings page. Fetches the
 * worker's future AVAILABLE slots, lets the user pick one, and submits the
 * atomic slot swap via rescheduleBookingAction. `by` decides who gets the
 * "rescheduled" notification (the other party).
 */
export function RescheduleDialog({ booking, by }: { booking: Booking; by: "worker" | "customer" }) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSlots(null);
    setSelected(null);
    setReason("");
    availableSlotsAction(booking.workerId).then((res) => {
      setSlots(res.ok && res.slots ? res.slots : []);
    });
  }, [open, booking.workerId]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    const f = new FormData();
    f.set("targetSlotId", selected);
    f.set("by", by);
    if (reason.trim()) f.set("reason", reason.trim());
    const res = await rescheduleBookingAction(booking.id, f);
    setBusy(false);
    if (res.ok) {
      toast("success", t("booking.rescheduleSuccess"));
      setOpen(false);
      router.refresh();
    } else {
      toast("error", t("booking.rescheduleError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full sm:w-auto">
          <CalendarClock className="size-4" />
          {t("booking.moveTime")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("booking.rescheduleTitle")}</DialogTitle>
          <DialogDescription>
            {t("booking.rescheduleSubtitle")} · {t("booking.bookingNumber")} {booking.number}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto pt-1">
          {slots === null ? (
            <div className="flex items-center justify-center py-10 text-ink-400">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : slots.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-4 py-10 text-center dark:border-ink-700 dark:bg-ink-800/40">
              <CalendarX2 className="size-8 text-ink-400" />
              <p className="mt-2 text-sm font-bold text-ink-900 dark:text-ink-50">{t("booking.rescheduleEmpty")}</p>
              <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t("booking.rescheduleEmptyBody")}</p>
            </div>
          ) : (
            slots.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={cn(
                  "w-full rounded-xl border px-4 py-3 text-start text-sm font-semibold transition-colors",
                  selected === s.id
                    ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300"
                    : "border-ink-200 text-ink-700 hover:border-brand-300 hover:bg-brand-500/5 dark:border-ink-700 dark:text-ink-200"
                )}
              >
                {formatOption(s, locale)}
              </button>
            ))
          )}
        </div>

        {slots && slots.length > 0 && (
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-semibold text-ink-500 dark:text-ink-400">
              {t("booking.rescheduleReason")}
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("booking.rescheduleReasonPlaceholder")}
              className="min-h-[70px]"
              disabled={busy}
            />
          </div>
        )}

        <Button onClick={submit} disabled={!selected || busy} size="lg" className="w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
          {t("booking.moveTime")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
