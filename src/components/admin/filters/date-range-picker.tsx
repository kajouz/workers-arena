"use client";

import { useState, useRef, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  className?: string;
  showPresets?: boolean;
}

/**
 * Date Range Picker component for admin dashboard
 */
export function DateRangePicker({
  value,
  onChange,
  className,
  showPresets = true,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [range, setRange] = useState<DateRange>(
    value || { start: null, end: null }
  );
  const [viewDate, setViewDate] = useState(new Date());
  const [selecting, setSelecting] = useState<"start" | "end">("start");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setRange(value);
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const presetOptions = [
    { label: "Today", start: new Date(), end: new Date() },
    {
      label: "Last 7 days",
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      end: new Date(),
    },
    {
      label: "Last 30 days",
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date(),
    },
    {
      label: "This month",
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(),
    },
    {
      label: "Last month",
      start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1),
      end: new Date(new Date().getFullYear(), new Date().getMonth(), 0),
    },
  ];

  const daysInMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth() + 1,
    0
  ).getDate();

  const firstDayOfMonth = new Date(
    viewDate.getFullYear(),
    viewDate.getMonth(),
    1
  ).getDay();

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isInRange = (day: number) => {
    if (!range.start || !range.end) return false;
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return date >= range.start && date <= range.end;
  };

  const isStart = (day: number) => {
    if (!range.start) return false;
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return date.toDateString() === range.start.toDateString();
  };

  const isEnd = (day: number) => {
    if (!range.end) return false;
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return date.toDateString() === range.end.toDateString();
  };

  const handleDayClick = (day: number) => {
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);

    if (selecting === "start") {
      setRange({ start: date, end: null });
      setSelecting("end");
    } else {
      if (range.start && date < range.start) {
        setRange({ start: date, end: range.start });
      } else {
        setRange({ ...range, end: date });
      }
      setSelecting("start");
      onChange?.({ start: range.start, end: date });
    }
  };

  const handlePresetClick = (preset: { start: Date; end: Date }) => {
    setRange(preset);
    onChange?.(preset);
    setIsOpen(false);
  };

  const handleClear = () => {
    setRange({ start: null, end: null });
    onChange?.({ start: null, end: null });
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Select date";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1));
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm border border-ink-200 dark:border-ink-800 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-950"
      >
        <Calendar className="w-4 h-4 text-ink-500 dark:text-ink-400" />
        <span className="text-ink-700 dark:text-ink-200">
          {range.start ? (
            range.end ? (
              <>
                {formatDate(range.start)} - {formatDate(range.end)}
              </>
            ) : (
              formatDate(range.start)
            )
          ) : (
            "Select date range"
          )}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-ink-900 rounded-xl shadow-xl border border-ink-200 dark:border-ink-800 z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
                {formatDate(range.start)}
              </span>
              <span className="text-ink-400 dark:text-ink-500">→</span>
              <span className="text-sm font-medium text-ink-700 dark:text-ink-200">
                {formatDate(range.end)}
              </span>
            </div>
            <button
              onClick={handleClear}
              className="p-1 hover:bg-ink-100 dark:hover:bg-ink-800 rounded"
            >
              <X className="w-4 h-4 text-ink-400 dark:text-ink-500" />
            </button>
          </div>

          {/* Presets */}
          {showPresets && (
            <div className="px-4 py-3 border-b">
              <div className="flex flex-wrap gap-2">
                {presetOptions.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset)}
                    className="px-3 py-1.5 text-xs font-medium text-ink-700 dark:text-ink-200 bg-ink-100 dark:bg-ink-800 rounded-full hover:bg-ink-200 dark:hover:bg-ink-800"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Calendar */}
          <div className="px-4 py-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-1 hover:bg-ink-100 dark:hover:bg-ink-800 rounded"
              >
                <ChevronLeft className="w-4 h-4 text-ink-600 dark:text-ink-300" />
              </button>
              <span className="font-medium text-ink-900 dark:text-ink-50">
                {viewDate.toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <button
                onClick={nextMonth}
                className="p-1 hover:bg-ink-100 dark:hover:bg-ink-800 rounded"
              >
                <ChevronRight className="w-4 h-4 text-ink-600 dark:text-ink-300" />
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-ink-500 dark:text-ink-400 py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7">
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {days.map((day) => (
                <button
                  key={day}
                  onClick={() => handleDayClick(day)}
                  className={cn(
                    "h-8 w-8 text-sm rounded-full flex items-center justify-center",
                    isStart(day) && "bg-blue-600 text-white rounded-r-none",
                    isEnd(day) && "bg-blue-600 text-white rounded-l-none",
                    isInRange(day) && !isStart(day) && !isEnd(day) && "bg-blue-100",
                    !isInRange(day) && !isStart(day) && !isEnd(day) && "hover:bg-ink-100 dark:hover:bg-ink-800"
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
