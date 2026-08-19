"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "./onboarding-provider";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

/**
 * Onboarding overlay that shows a guided tour for new users.
 * Highlights target elements and shows step-by-step instructions.
 */
export function OnboardingOverlay() {
  const { isActive, currentStep, steps, nextStep, prevStep, skipOnboarding } =
    useOnboarding();
  const { locale } = useLocale();
  const overlayRef = useRef<HTMLDivElement>(null);
  const isArabic = locale === "ar";

  const step = steps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === steps.length - 1;

  // Handle keyboard navigation
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        skipOnboarding();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        nextStep();
      } else if (e.key === "ArrowLeft") {
        prevStep();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, nextStep, prevStep, skipOnboarding]);

  // Scroll target element into view
  useEffect(() => {
    if (!isActive || !step?.target) return;

    const targetElement = document.querySelector(step.target);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive, step]);

  if (!isActive) return null;

  return (
    <AnimatePresence>
      {isActive && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-sm"
            onClick={skipOnboarding}
          />

          {/* Spotlight ring around target element */}
          {step.target && (
            <Spotlight target={step.target} position={step.position} />
          )}

          {/* Tooltip */}
          <motion.div
            ref={overlayRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed z-[9999] w-[min(90vw,400px)] rounded-2xl bg-white p-6 shadow-2xl dark:bg-ink-900",
              step.target ? getTooltipPosition(step.position) : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            )}
          >
            {/* Step indicator */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentStep
                        ? "w-6 bg-brand-500"
                        : i < currentStep
                        ? "w-1.5 bg-brand-300"
                        : "w-1.5 bg-ink-200 dark:bg-ink-700"
                    )}
                  />
                ))}
              </div>
              <button
                onClick={skipOnboarding}
                className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800"
                aria-label="Skip onboarding"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Content */}
            <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
              {isArabic ? step.titleAr : step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
              {isArabic ? step.descriptionAr : step.description}
            </p>

            {/* Navigation */}
            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                disabled={isFirstStep}
                className={cn(isArabic && "order-2")}
              >
                <ChevronLeft className={cn("size-4", isArabic && "rotate-180")} />
                {isArabic ? "التالي" : "Back"}
              </Button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-400">
                  {currentStep + 1} / {steps.length}
                </span>
              </div>

              {isLastStep ? (
                <Button size="sm" onClick={skipOnboarding}>
                  <Check className="size-4" />
                  {isArabic ? "إنهاء" : "Done"}
                </Button>
              ) : (
                <Button size="sm" onClick={nextStep} className={cn(isArabic && "order-1")}>
                  {isArabic ? "السابق" : "Next"}
                  <ChevronRight className={cn("size-4", isArabic && "rotate-180")} />
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Spotlight component that highlights the target element
 */
function Spotlight({
  target,
  position = "bottom",
}: {
  target: string;
  position?: "top" | "bottom" | "left" | "right";
}) {
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateSpotlight = () => {
      const targetElement = document.querySelector(target);
      const spotlight = spotlightRef.current;
      if (!targetElement || !spotlight) return;

      const rect = targetElement.getBoundingClientRect();
      const padding = 8;

      spotlight.style.top = `${rect.top - padding}px`;
      spotlight.style.left = `${rect.left - padding}px`;
      spotlight.style.width = `${rect.width + padding * 2}px`;
      spotlight.style.height = `${rect.height + padding * 2}px`;
    };

    updateSpotlight();
    window.addEventListener("resize", updateSpotlight);
    return () => window.removeEventListener("resize", updateSpotlight);
  }, [target]);

  return (
    <motion.div
      ref={spotlightRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed z-[9998] rounded-xl ring-4 ring-brand-500/50 ring-offset-2 ring-offset-transparent"
      style={{ pointerEvents: "none" }}
    />
  );
}

function getTooltipPosition(position?: "top" | "bottom" | "left" | "right") {
  switch (position) {
    case "top":
      return "left-1/2 top-24 -translate-x-1/2";
    case "bottom":
      return "left-1/2 bottom-24 -translate-x-1/2";
    case "left":
      return "left-8 top-1/2 -translate-y-1/2";
    case "right":
      return "right-8 top-1/2 -translate-y-1/2";
    default:
      return "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
  }
}
