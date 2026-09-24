"use client";

import { useState, useEffect } from "react";
import { usePromptSlot } from "@/components/providers/prompt-queue";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X, Download, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSWUpdate } from "@/hooks/use-sw-update";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface UpdateBannerProps {
  /** Custom class name */
  className?: string;
}

/**
 * PWA update notification with two stages:
 *
 * 1. **Badge** — a subtle pulsing dot in the bottom-right corner that
 *    indicates an update is available. Non-intrusive, doesn't block content.
 *
 * 2. **Expanded banner** — tapping the badge shows the full prompt with
 *    update/dismiss actions.
 *
 * After the update is applied, a brief "Updated!" confirmation is shown
 * for 3 seconds before fading out.
 */
export function UpdateBanner({ className }: UpdateBannerProps) {
  const { t } = useLocale();
  const { isUpdateAvailable, isUpdated, applyUpdate, dismiss } = useSWUpdate();
  const [expanded, setExpanded] = useState(false);
  const [showUpdated, setShowUpdated] = useState(false);

  // Expand banner when update becomes available
  useEffect(() => {
    if (isUpdateAvailable) {
      setExpanded(false); // Start with badge, not expanded
      setShowUpdated(false);
    }
  }, [isUpdateAvailable]);

  // Show brief confirmation after update is applied
  useEffect(() => {
    if (isUpdated) {
      setExpanded(false);
      setShowUpdated(true);
      const timer = setTimeout(() => setShowUpdated(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isUpdated]);

  const handleUpdate = () => {
    setExpanded(false);
    applyUpdate();
  };

  const handleDismiss = () => {
    setExpanded(false);
    dismiss();
  };

  const handleBadgeClick = () => {
    setExpanded(true);
  };

  // Highest priority in the queue: a reader on stale code is a correctness
  // problem, not an offer, so this one displaces the others rather than
  // stacking beside them.
  const hasSlot = usePromptSlot("update", isUpdateAvailable || showUpdated);
  if (!hasSlot) return null;

  return (
    <>
      {/* ── Pulsing badge (stage 1) ──────────────────────────────────── */}
      <AnimatePresence>
        {isUpdateAvailable && !expanded && !showUpdated && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            onClick={handleBadgeClick}
            className={cn(
              // end-6 (not right-6) flips in RTL; above --bottom-chrome clears the tab bar (findings 3, 14).
              "fixed bottom-[calc(var(--bottom-chrome)+1.5rem)] end-6 z-prompt flex size-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg transition-shadow hover:bg-brand-700 hover:shadow-xl dark:bg-brand-500 dark:hover:bg-brand-600",
              className
            )}
            aria-label={t("swUpdate.badge")}
          >
            {/* Pulse ring */}
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-30 dark:bg-brand-300" />
            {/* Icon */}
            <ArrowUp className="relative size-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Expanded banner (stage 2) ────────────────────────────────── */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop to dismiss on outside click */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-prompt"
              onClick={handleDismiss}
            />

            {/* Banner */}
            <motion.div
              initial={{ y: 80, opacity: 0, scale: 0.95 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 80, opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={cn(
                "fixed bottom-[calc(var(--bottom-chrome)+1.5rem)] end-6 z-prompt w-[calc(100%-3rem)] max-w-sm",
                className
              )}
            >
              <div className="relative overflow-hidden rounded-2xl border border-brand-200 bg-white shadow-2xl dark:border-brand-800 dark:bg-ink-900">
                {/* Close button */}
                <button
                  onClick={handleDismiss}
                  className="absolute right-2 top-2 rounded-full p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800 dark:hover:text-ink-300"
                  aria-label={t("common.close")}
                >
                  <X className="size-3.5" />
                </button>

                <div className="flex items-center gap-3 p-4 pe-8">
                  {/* Icon */}
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-900/30">
                    <RefreshCw className="size-5 text-brand-600 dark:text-brand-400" />
                  </div>

                  {/* Text + actions */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                      {t("swUpdate.title")}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                      {t("swUpdate.subtitle")}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button onClick={handleUpdate} size="sm" className="h-8 px-4 text-xs">
                        {t("swUpdate.update")}
                      </Button>
                      <Button onClick={handleDismiss} variant="ghost" size="sm" className="h-8 px-3 text-xs">
                        {t("swUpdate.later")}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Updated confirmation toast ────────────────────────────────── */}
      <AnimatePresence>
        {showUpdated && (
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={cn(
              "fixed bottom-[calc(var(--bottom-chrome)+1.5rem)] end-6 z-prompt w-[calc(100%-3rem)] max-w-xs",
              className
            )}
          >
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-xl dark:border-emerald-800 dark:bg-ink-900">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                <Download className="size-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                {t("swUpdate.updated")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
