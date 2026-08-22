"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface AriaLiveRegionProps {
  /** The message to announce */
  message: string;
  /** The politeness level: "polite" waits for idle, "assertive" interrupts */
  politeness?: "polite" | "assertive";
  /** Visual style — by default hidden but accessible to screen readers */
  className?: string;
  /** If true, shows the message visually (for toasts, alerts, etc.) */
  visible?: boolean;
}

/**
 * ARIA live region for announcing dynamic content updates to screen readers.
 * Use this for search results, form validation errors, loading states, etc.
 *
 * @example
 * // Announce search results count
 * <AriaLiveRegion message={`${results.length} results found`} />
 *
 * @example
 * // Show a visible alert
 * <AriaLiveRegion
 *   message="Form submitted successfully"
 *   visible
 *   className="bg-green-100 text-green-800 p-4 rounded"
 * />
 */
export function AriaLiveRegion({
  message,
  politeness = "polite",
  className,
  visible = false,
}: AriaLiveRegionProps) {
  const [announcement, setAnnouncement] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Clear any pending announcement
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (message) {
      // Small delay to ensure screen readers pick up the change
      timeoutRef.current = setTimeout(() => {
        setAnnouncement(message);
      }, 100);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [message]);

  // Clear announcement after a delay (for screen readers to finish reading)
  useEffect(() => {
    if (announcement) {
      const timer = setTimeout(() => {
        setAnnouncement("");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [announcement]);

  return (
    <div
      aria-live={politeness}
      aria-atomic="true"
      role={politeness === "assertive" ? "alert" : "status"}
      className={cn(
        // Hidden by default (screen reader only)
        !visible && "sr-only",
        visible && "transition-opacity",
        className
      )}
    >
      {announcement}
    </div>
  );
}

/**
 * Announce a state change (e.g., loading → loaded, error, success).
 * Use this in components that update state without user input.
 */
export function useStateAnnouncement({
  isLoading,
  loadingMessage = "Loading",
  successMessage,
  errorMessage,
}: {
  isLoading: boolean;
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
}) {
  const [message, setMessage] = useState("");
  const prevStateRef = useRef<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (isLoading) {
      setMessage(loadingMessage);
      prevStateRef.current = "loading";
    } else if (errorMessage) {
      setMessage(errorMessage);
      prevStateRef.current = "error";
    } else if (successMessage && prevStateRef.current === "loading") {
      setMessage(successMessage);
      prevStateRef.current = "success";
    } else {
      prevStateRef.current = "idle";
    }
  }, [isLoading, loadingMessage, successMessage, errorMessage]);

  return <AriaLiveRegion message={message} />;
}

/**
 * Announce search results to screen readers.
 */
export function SearchResultsAnnouncement({
  count,
  isLoading,
  locale = "en",
}: {
  count: number;
  isLoading: boolean;
  locale?: string;
}) {
  const isAr = locale === "ar";
  const message = isLoading
    ? isAr
      ? "جارٍ البحث..."
      : "Searching..."
    : count === 0
    ? isAr
      ? "لم يتم العثور على نتائج"
      : "No results found"
    : isAr
      ? `${count} ${count === 1 ? "نتيجة" : "نتائج"}`
      : `${count} ${count === 1 ? "result" : "results"} found`;

  return <AriaLiveRegion message={message} />;
}
