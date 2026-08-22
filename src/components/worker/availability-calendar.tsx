"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface TimeSlot {
  id: string;
  startAt: string;
  endAt: string;
  status: "available" | "reserved" | "booked" | "blocked";
}

interface AvailabilityCalendarProps {
  slots: TimeSlot[];
  selectedSlotId?: string;
  onSlotSelect?: (slot: TimeSlot) => void;
  workerName: string;
}

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer",
  reserved: "bg-amber-500/20 text-amber-700 dark:text-amber-400 cursor-not-allowed",
  booked: "bg-brand-500/20 text-brand-700 dark:text-brand-400 cursor-not-allowed",
  blocked: "bg-ink-200 text-ink-500 dark:bg-ink-700 dark:text-ink-400 cursor-not-allowed",
};

/**
 * Visual calendar for worker availability
 */
export function AvailabilityCalendar({
  slots,
  selectedSlotId,
  onSlotSelect,
  workerName,
}: AvailabilityCalendarProps) {
  const { locale } = useLocale();
  const [currentWeekStart, setCurrentWeekStart] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    return new Date(now.setDate(diff));
  });

  const isArabic = locale === "ar";
  const days = isArabic ? DAYS_AR : DAYS_EN;

  // Generate 7 days starting from currentWeekStart
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(currentWeekStart);
      date.setDate(date.getDate() + i);
      return date;
    });
  }, [currentWeekStart]);

  // Group slots by day
  const slotsByDay = useMemo(() => {
    const grouped: Record<string, TimeSlot[]> = {};
    weekDays.forEach((day) => {
      const key = day.toISOString().split("T")[0];
      grouped[key] = slots.filter((slot) => {
        const slotDate = new Date(slot.startAt).toISOString().split("T")[0];
        return slotDate === key;
      });
    });
    return grouped;
  }, [slots, weekDays]);

  const prevWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentWeekStart(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentWeekStart(newDate);
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString(locale === "ar" ? "ar-LB" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const isPast = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  return (
    <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-soft dark:border-ink-800 dark:bg-ink-900">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900 dark:text-ink-50">
          <Calendar className="size-4 text-brand-500" />
          {isArabic ? "المواعيد المتاحة" : "Available Times"}
        </h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={prevWeek}>
            <ChevronLeft className={cn("size-4", isArabic && "rotate-180")} />
          </Button>
          <span className="min-w-[120px] text-center text-xs font-bold text-ink-600 dark:text-ink-300">
            {formatDate(weekDays[0])} - {formatDate(weekDays[6])}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={nextWeek}>
            <ChevronRight className={cn("size-4", isArabic && "rotate-180")} />
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day headers */}
        {weekDays.map((day, i) => (
          <div
            key={i}
            className={cn(
              "pb-2 text-center text-xs font-bold",
              isToday(day)
                ? "text-brand-600 dark:text-brand-400"
                : "text-ink-500 dark:text-ink-400"
            )}
          >
            <div>{days[i]}</div>
            <div className={cn(
              "mt-1 text-[10px]",
              isToday(day) && "flex size-6 mx-auto items-center justify-center rounded-full bg-brand-500 text-white"
            )}>
              {day.getDate()}
            </div>
          </div>
        ))}

        {/* Time slots */}
        {weekDays.map((day, dayIndex) => {
          const dateKey = day.toISOString().split("T")[0];
          const daySlots = slotsByDay[dateKey] ?? [];
          const past = isPast(day);

          return (
            <div
              key={dayIndex}
              className={cn(
                "min-h-[100px] rounded-lg border p-1",
                isToday(day)
                  ? "border-brand-500/30 bg-brand-500/5"
                  : "border-ink-100 dark:border-ink-800",
                past && "opacity-50"
              )}
            >
              {daySlots.length === 0 ? (
                <p className="mt-2 text-center text-[10px] text-ink-400">
                  {past ? "" : isArabic ? "متاح" : "Open"}
                </p>
              ) : (
                <div className="space-y-1">
                  {daySlots.map((slot) => (
                    <motion.button
                      key={slot.id}
                      whileHover={!past && slot.status === "available" ? { scale: 1.05 } : {}}
                      whileTap={!past && slot.status === "available" ? { scale: 0.95 } : {}}
                      disabled={past || slot.status !== "available"}
                      onClick={() => onSlotSelect?.(slot)}
                      className={cn(
                        "w-full rounded px-1 py-0.5 text-[10px] font-bold transition-colors",
                        STATUS_COLORS[slot.status],
                        selectedSlotId === slot.id && "ring-2 ring-brand-500 ring-offset-1"
                      )}
                    >
                      {formatTime(slot.startAt)}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 border-t border-ink-100 pt-3 dark:border-ink-800">
        {Object.entries(STATUS_COLORS).map(([status, colors]) => (
          <div key={status} className="flex items-center gap-1.5">
            <div className={cn("size-3 rounded", colors.split(" ")[0])} />
            <span className="text-[10px] text-ink-500 dark:text-ink-400 capitalize">
              {isArabic
                ? { available: "متاح", reserved: "محجوز", booked: "محجوز", blocked: "محظور" }[status]
                : status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
