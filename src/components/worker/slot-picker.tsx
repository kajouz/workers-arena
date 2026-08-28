"use client";

import { Check, Clock, Lock } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { cn, DAYS_AR, DAYS_EN } from "@/lib/utils";
import { dayLabel, formatDayDate, formatSlotRange, groupSlotsByDay } from "@/lib/data/booking-ui";
import type { BookingSlot } from "@/lib/data/types";

/**
 * Customer slot picker: AVAILABLE slots grouped by day as selectable chips.
 * RESERVED/BOOKED show as locked; BLOCKED shows its worker note as a tooltip.
 * Only `status === "available"` chips are selectable.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  workerName,
}: {
  slots: BookingSlot[];
  value: string | null;
  onChange: (slotId: string) => void;
  workerName: string;
}) {
  const { locale, t } = useLocale();
  const days = groupSlotsByDay(slots);
  const daysArr = locale === "ar" ? DAYS_AR : DAYS_EN;
  const availableCount = slots.filter((s) => s.status === "available").length;

  if (availableCount === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-ink-300 bg-ink-50/60 px-4 py-10 text-center dark:border-ink-700 dark:bg-ink-800/40">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-ink-500/10 text-ink-500">
          <Clock className="size-6" />
        </span>
        <p className="mt-3 text-sm font-bold text-ink-900 dark:text-ink-50">{t("booking.slotEmpty")}</p>
        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t("booking.slotEmptyBody").replace("{name}", workerName)}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{t("booking.slot")}</p>
      {days.map(({ dayKey, slots: daySlots }) => {
        const first = daySlots[0]!;
        const label = dayLabel(first.startAt);
        const heading =
          label.kind === "today"
            ? t("booking.today")
            : label.kind === "tomorrow"
              ? t("booking.tomorrow")
              : `${daysArr[label.weekday]} · ${formatDayDate(first.startAt, locale)}`;
        return (
          <div key={dayKey}>
            <p className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-200">{heading}</p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const selectable = slot.status === "available";
                const selected = value === slot.id;
                return (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!selectable}
                    onClick={() => onChange(slot.id)}
                    title={slot.status === "blocked" && slot.note ? slot.note : undefined}
                    className={cn(
                      "group flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-all",
                      selectable &&
                        !selected &&
                        "border-ink-200 bg-white text-ink-800 hover:border-brand-500 hover:text-brand-600 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:border-brand-400",
                      selected && "border-brand-700 bg-brand-700 text-white shadow-[0_4px_14px_-4px_rgb(194_65_12/0.5)]",
                      !selectable && "cursor-not-allowed border-ink-100 bg-ink-50 text-ink-300 dark:border-ink-800 dark:bg-ink-800/40 dark:text-ink-600"
                    )}
                    aria-pressed={selected}
                    aria-disabled={!selectable}
                  >
                    {selected ? (
                      <Check className="size-3.5" />
                    ) : !selectable ? (
                      <Lock className="size-3.5" />
                    ) : null}
                    {formatSlotRange(slot, locale)}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
