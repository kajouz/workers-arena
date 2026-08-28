import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "badge-icon inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-500/10 text-brand-700 dark:text-brand-400",
        solid: "border-transparent bg-brand-700 text-white",
        secondary: "border-transparent bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
        outline: "border-ink-200 text-ink-700 dark:border-ink-700 dark:text-ink-300",
        success: "border-transparent bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        danger: "border-transparent bg-red-500/10 text-red-700 dark:text-red-400",
        premium:
          "border-transparent bg-gradient-to-r from-violet-500/15 to-fuchsia-500/15 text-violet-700 dark:text-violet-300",
        glass: "glass text-ink-800 dark:text-ink-100",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  // span (not div): Badges routinely sit inside <p>/phrasing content, where a
  // div is invalid HTML and would cause React hydration mismatches. The
  // badgeVariants are inline-flex, so a span behaves identically in layouts.
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
