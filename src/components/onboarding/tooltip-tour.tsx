"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TooltipStep {
  id: string;
  target: string; // CSS selector
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

interface TooltipTourProps {
  steps: TooltipStep[];
  storageKey?: string;
  onComplete?: () => void;
}

export function TooltipTour({
  steps,
  storageKey = "wa-tooltip-tour",
  onComplete,
}: TooltipTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Check if tour was completed
  useEffect(() => {
    try {
      const completed = localStorage.getItem(storageKey);
      if (!completed) {
        // Small delay so the page renders first
        const timer = setTimeout(() => setVisible(true), 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // SSR or storage error — show tour
      const timer = setTimeout(() => setVisible(true), 1200);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  // Position the tooltip
  useEffect(() => {
    if (!visible || !steps[currentStep]) return;

    const updatePosition = () => {
      const el = document.querySelector(steps[currentStep].target);
      if (el) {
        setTargetRect(el.getBoundingClientRect());
      }
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [visible, currentStep, steps]);

  const position = steps[currentStep]?.position ?? "bottom";

  const tooltipPosition = targetRect
    ? (() => {
        const gap = 12;
        switch (position) {
          case "top":
            return {
              top: targetRect.top - gap,
              left: targetRect.left + targetRect.width / 2,
              transform: "translate(-50%, -100%)",
            };
          case "bottom":
            return {
              top: targetRect.bottom + gap,
              left: targetRect.left + targetRect.width / 2,
              transform: "translate(-50%, 0)",
            };
          case "left":
            return {
              top: targetRect.top + targetRect.height / 2,
              left: targetRect.left - gap,
              transform: "translate(-100%, -50%)",
            };
          case "right":
            return {
              top: targetRect.top + targetRect.height / 2,
              left: targetRect.right + gap,
              transform: "translate(0, -50%)",
            };
        }
      })()
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  const next = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      complete();
    }
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  const complete = () => {
    setVisible(false);
    try {
      localStorage.setItem(storageKey, "done");
    } catch {}
    onComplete?.();
  };

  if (!visible || !steps[currentStep]) return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Spotlight overlay */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={complete}
          >
            {/* Cutout around target */}
            {targetRect && (
              <div
                className="absolute rounded-xl ring-4 ring-brand-500/40"
                style={{
                  top: targetRect.top - 4,
                  left: targetRect.left - 4,
                  width: targetRect.width + 8,
                  height: targetRect.height + 8,
                }}
              />
            )}
          </motion.div>

          {/* Tooltip card */}
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "fixed z-[201] w-72 rounded-2xl border border-ink-200 bg-white p-5 shadow-lift dark:border-ink-700 dark:bg-ink-900",
              "sm:w-80"
            )}
            style={tooltipPosition as React.CSSProperties}
          >
            {/* Close */}
            <button
              onClick={complete}
              className="absolute right-3 top-3 rounded-md p-1 text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
              aria-label="Dismiss tour"
            >
              <X className="size-4" />
            </button>

            {/* Content */}
            <div className="mb-4">
              <h4 className="text-sm font-bold text-ink-900 dark:text-ink-50">
                {steps[currentStep].title}
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                {steps[currentStep].description}
              </p>
            </div>

            {/* Progress */}
            <div className="mb-4 flex gap-1">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i <= currentStep
                      ? "bg-brand-500"
                      : "bg-ink-200 dark:bg-ink-700"
                  )}
                />
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-400">
                {currentStep + 1} of {steps.length}
              </span>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button variant="ghost" size="sm" onClick={prev}>
                    <ChevronLeft className="size-4" />
                    Back
                  </Button>
                )}
                <Button size="sm" onClick={next}>
                  {currentStep === steps.length - 1 ? "Got it!" : "Next"}
                  {currentStep < steps.length - 1 && (
                    <ChevronRight className="size-4" />
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─── Default Steps for WorkersArena ─── */
export const DEFAULT_ONBOARDING_STEPS: TooltipStep[] = [
  {
    id: "search",
    target: "[data-tour='search']",
    title: "Search for workers",
    description:
      "Type a trade or skill to find verified professionals in your area. Try voice search too!",
    position: "bottom",
  },
  {
    id: "categories",
    target: "[data-tour='categories']",
    title: "Browse by trade",
    description:
      "Tap any category to see all workers in that trade, filtered by your city.",
    position: "bottom",
  },
  {
    id: "favorites",
    target: "[data-tour='favorites']",
    title: "Save favorites",
    description:
      "Tap the heart icon on any worker card to save them for quick access later.",
    position: "bottom",
  },
  {
    id: "profile",
    target: "[data-tour='profile']",
    title: "Your profile",
    description:
      "Access your dashboard, bookings, and account settings from here.",
    position: "bottom",
  },
];
