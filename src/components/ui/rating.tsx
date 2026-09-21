"use client";

import { Star, StarHalf } from "lucide-react";
import { cn } from "@/lib/utils";

function starStates(value: number): ("full" | "half" | "empty")[] {
  const states: ("full" | "half" | "empty")[] = [];
  for (let i = 0; i < 5; i++) {
    const diff = value - i;
    states.push(diff >= 0.75 ? "full" : diff >= 0.25 ? "half" : "empty");
  }
  return states;
}

export function Rating({
  value,
  size = 14,
  showValue = false,
  className,
}: {
  value: number;
  size?: number;
  showValue?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} dir="ltr">
      {/* role="img" + aria-label: a plain span carrying aria-label violates
          aria-prohibited-attr — the role makes the label meaningful (the
          accessible name for the star graphic). */}
      <span className="inline-flex items-center" role="img" aria-label={`${value} out of 5`}>
        {starStates(value).map((state, i) =>
          state === "half" ? (
            <span key={i} className="relative inline-flex" style={{ width: size, height: size }}>
              <Star className="absolute inset-0 fill-ink-200 text-ink-200 dark:fill-ink-700 dark:text-ink-700" style={{ width: size, height: size }} />
              <StarHalf className="absolute inset-0 fill-brand-500 text-brand-500" style={{ width: size, height: size }} />
            </span>
          ) : (
            <Star
              key={i}
              className={cn(
                state === "full" ? "fill-brand-500 text-brand-500" : "fill-ink-200 text-ink-200 dark:fill-ink-700 dark:text-ink-700"
              )}
              style={{ width: size, height: size }}
            />
          )
        )}
      </span>
      {showValue && <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{value.toFixed(1)}</span>}
    </span>
  );
}

/** Interactive star input for review forms. */
export function StarInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1", className)} dir="ltr" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          onClick={() => onChange(n)}
          // -mx-1: 28px stars gain a ~36px tap box; the gap keeps the hit
          // areas from overlapping between adjacent stars.
          className="-mx-1 p-1.5 transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-sm"
        >
          <Star
            className={cn(
              "transition-colors",
              n <= value ? "fill-brand-500 text-brand-500" : "fill-ink-200 text-ink-200 dark:fill-ink-700 dark:text-ink-700"
            )}
            style={{ width: 28, height: 28 }}
          />
        </button>
      ))}
    </div>
  );
}
