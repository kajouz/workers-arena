import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // `text-base` (16px) on phones: iOS Safari zooms the page when a
          // field under 16px is focused and never zooms back out (finding 4).
          // Desktop keeps the tighter `text-sm`.
          "flex h-10 w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2 text-base sm:text-sm text-ink-900 shadow-soft transition-colors placeholder:text-ink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50 dark:placeholder:text-ink-500",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
