"use client";

import { cn } from "@/lib/utils";

/**
 * Skip navigation link — invisible by default, becomes visible on focus.
 * Allows keyboard users to bypass the header and jump directly to main content.
 *
 * Usage: Add <SkipNav /> as the first child inside <body> in layout.tsx.
 */
export function SkipNav({ className }: { className?: string }) {
  return (
    <a
      href="#main-content"
      className={cn(
        "fixed start-0 top-0 z-[9999] px-6 py-3 text-sm font-bold text-white",
        "bg-brand-600 shadow-lg transition-transform duration-200",
        "-translate-y-full focus:translate-y-0",
        "focus:outline-none focus:ring-4 focus:ring-brand-300",
        className
      )}
    >
      Skip to main content
    </a>
  );
}

/**
 * Main content landmark with id for skip navigation.
 * Wraps the main content area with proper ARIA landmark.
 */
export function MainContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={cn("focus:outline-none", className)}
    >
      {children}
    </main>
  );
}
