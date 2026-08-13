"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2, Lock, Plus, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { generateSlotsAction, setSlotBlockedAction } from "@/app/actions/bookings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn, DAYS_EN, DAYS_AR } from "@/lib/utils";
import { dayLabel, formatDayDate, formatSlotRange, groupSlotsByDay, nextDayKeys } from "@/lib/data/booking-ui";
import type { BookingSlot, Worker } from "@/lib/data/types";

const SLOT_STYLE: Record<BookingSlot["status"], string> = {
  available: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
  reserved: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  booked: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  blocked: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

/**
 * Availability editor (docs/booking-scheduling.md §6 — M2): the next 7 days
 * from the worker's `WorkingHour` template. Free slots can be blocked with a
 * click (and unblocked); RESERVED/BOOKED slots are locked to their booking.
 * \"Generate slots\" materializes the weekly template as concrete AVAILABLE
 * slots (idempotent — never double-books an existing hour).
 */
export function AvailabilityPanel({ slots, worker }: { slots: BookingSlot[]; worker: Worker }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const busy = generating || busySlot !== null;

  const days = nextDayKeys(7);
  const byDay = new Map(groupSlotsByDay(slots).map((g) => [g.dayKey, g.slots]));

  const generate = async () => {
    setGenerating(true);
    const res = await generateSlotsAction(worker.slug, new FormData());
    setGenerating(false);
    if (res.ok) {
      toast("success", t("booking.slotsGenerated").replace("{count}", String(res.created ?? 0)));
      router.refresh();
    } else {
      toast("error", t("booking.availabilityError"));
    }
  };

  const toggle = async (slot: BookingSlot) => {
    if (slot.status === "reserved" || slot.status === "booked") return;
    const blocking = slot.status !== "blocked";
    setBusySlot(slot.id);
    const f = new FormData();
    f.set("slotId", slot.id);
    f.set("blocked", String(blocking));
    const res = await setSlotBlockedAction(worker.slug, f);
    setBusySlot(null);
    if (res.ok) {
      toast("success", blocking ? t("booking.slotBlocked") : t("booking.slotUnblocked"));
      router.refresh();
    } else {
      toast("error", t("booking.availabilityError"));
    }
  };

  const dayName = (startAt: string): string => {
    const label = dayLabel(startAt);
    if (label.kind === "today") return t("booking.today");
    if (label.kind === "tomorrow") return t("booking.tomorrow");
    return locale === "ar" ? DAYS_AR[label.weekday] : DAYS_EN[label.weekday];
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="size-4 text-brand-500" />
          {t("booking.availabilityTitle")}
        </CardTitle>
        <Button size="sm" variant="outline" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          {generating ? t("booking.generatingSlots") : t("booking.generateSlots")}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-ink-400">{t("booking.availabilitySubtitle")}</p>

        <div className="max-h-80 space-y-4 overflow-y-auto pe-1">
          {days.map((dayKey) => {
            const daySlots = byDay.get(dayKey) ?? [];
            return (
              <div key={dayKey}>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-xs font-black text-ink-700 dark:text-ink-200">
                    {dayName(daySlots[0]?.startAt ?? `${dayKey}T12:00:00.000Z`)}
                  </p>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                    {daySlots.length > 0 ? formatDayDate(daySlots[0]!.startAt, locale) : t("booking.availabilityClosed")}
                  </span>
                </div>

                {daySlots.length === 0 ? (
                  <p className="rounded-lg bg-ink-50 px-3 py-1.5 text-[11px] text-ink-400 dark:bg-ink-800">
                    {t("booking.availabilityClosed")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((s) => {
                      const locked = s.status === "reserved" || s.status === "booked";
                      const clickable = !locked && !busy;
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggle(s)}
                          disabled={!clickable}
                          title={locked ? t(`booking.slotStatus.${s.status}`) : s.status === "blocked" ? t("booking.unblockSlot") : t("booking.blockSlot")}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-all",
                            SLOT_STYLE[s.status],
                            clickable && "cursor-pointer active:scale-95",
                            locked && "cursor-not-allowed opacity-80"
                          )}
                        >
                          {busySlot === s.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : locked ? (
                            <Lock className="size-3" />
                          ) : s.status === "blocked" ? (
                            <X className="size-3" />
                          ) : (
                            <Plus className="size-3" />
                          )}
                          {formatSlotRange(s, locale)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* legend */}
        <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ink-100 pt-3 dark:border-ink-800">
          {(["available", "reserved", "booked", "blocked"] as const).map((st) => (
            <Badge key={st} className={cn("border px-2 py-0.5 text-[10px]", SLOT_STYLE[st])}>
              {t(`booking.slotStatus.${st}`)}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
