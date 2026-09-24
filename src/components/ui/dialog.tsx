"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-dialog bg-ink-950/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /**
   * Where the panel hangs.
   *
   * `center` (default) is the modal this primitive was designed for.
   * `anchored` pins it under the sticky header instead — for menus and other
   * chrome that must leave the header visible.
   *
   * The two branches never overlap on a property, and that is the whole point.
   * The mobile menu used to re-anchor itself by passing `top-6 translate-y-0`
   * INTO `className`, where they had to out-rank the base `top-1/2` /
   * `-translate-y-1/2` — decided by Tailwind's EMITTED STYLESHEET ORDER (as
   * measured on the built CSS, `.top-6` sits 5 rules after `.top-1\/2` and
   * `.translate-y-0` 2 rules after `.-translate-y-1\/2`), not by the order in
   * the class attribute. One Tailwind bump away from a panel centred at the
   * top of the screen, or worse a `top-1/2` + `translate-y-0` mix that runs off
   * the bottom because `max-h` is measured from its own top edge.
   */
  placement?: "center" | "anchored";
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, placement = "center", ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // `overflow-y-auto`: the dialog was taller than a small phone (751px
        // content in a ~748px iPhone SE) with `overflow: visible`, so its
        // footer/Next button was cut off and unreachable once the keyboard
        // opened. Now the body scrolls (finding 9).
        "fixed z-dialog grid w-[calc(100%-2rem)] gap-4 overflow-y-auto rounded-2xl border border-ink-200 bg-white p-6 shadow-lift duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 dark:border-ink-800 dark:bg-ink-900",
        // `100dvh` (not `vh`) tracks the mobile URL bar so it doesn't overshoot.
        placement === "center" &&
          "left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
        // Under the sticky header, and stopping short of the bottom chrome:
        // the panel can never fill the viewport, cover the header, or hide the
        // tab bar (nor, on a notched phone, start under the status bar).
        placement === "anchored" &&
          "left-1/2 max-w-sm -translate-x-1/2 top-[var(--top-chrome)] max-h-[calc(100dvh-var(--top-chrome)-var(--bottom-chrome)-1.25rem)]",
        className
      )}
      {...props}
    >
      {children}
      {/* 44px hit target (was a 24px `p-1` box — below the touch minimum and
          fiddly to hit on a phone). The icon stays visually small. */}
      <DialogPrimitive.Close className="absolute end-2 top-2 flex size-11 items-center justify-center rounded-lg opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-brand-500">
        <X className="size-4 text-ink-500 dark:text-ink-300" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-start", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-ink-500 dark:text-ink-400", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
export type { DialogContentProps };
