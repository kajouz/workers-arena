import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "btn-icon inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-brand-700 text-white shadow-[0_8px_24px_-6px_rgb(194_65_12/0.5)] hover:bg-brand-800",
        secondary:
          "bg-ink-900 text-white hover:bg-ink-800 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-ink-100",
        outline:
          "border border-ink-200 bg-transparent text-ink-800 hover:bg-ink-100 hover:border-ink-300 dark:border-ink-700 dark:text-ink-100 dark:hover:bg-ink-800",
        ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-200 dark:hover:bg-ink-800",
        destructive: "bg-red-500 text-white hover:bg-red-600",
        link: "text-brand-700 underline-offset-4 hover:underline dark:text-brand-400",
        glass:
          "glass text-ink-900 hover:bg-white/90 dark:text-ink-50 dark:hover:bg-ink-800/80",
        success: "bg-emerald-600 text-white hover:bg-emerald-700",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
