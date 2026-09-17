"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSWUpdate } from "@/hooks/use-sw-update";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface UpdateBannerProps {
  /** Custom class name */
  className?: string;
}

/**
 * Non-intrusive PWA update banner.
 *
 * Shows at the top of the screen when a new service worker version is
 * available. The user can:
 * - Tap "Update" to reload with the new version
 * - Tap "Later" to dismiss (won't show again for 24 hours)
 *
 * After the update is applied, a brief "Updated!" confirmation is shown
 * for 3 seconds before fading out.
 */
export function UpdateBanner({ className }: UpdateBannerProps) {
  const { t } = useLocale();
  const { isUpdateAvailable, isUpdated, applyUpdate, dismiss } = useSWUpdate();
  const [showBanner, setShowBanner] = useState(false);
  const [showUpdated, setShowUpdated] = useState(false);

  // Show update banner when a new version is available
  useEffect(() => {
    if (isUpdateAvailable) {
      setShowBanner(true);
      setShowUpdated(false);
    }
  }, [isUpdateAvailable]);

  // Show brief confirmation after update is applied
  useEffect(() => {
    if (isUpdated) {
      setShowBanner(false);
      setShowUpdated(true);
      const timer = setTimeout(() => setShowUpdated(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isUpdated]);

  const handleUpdate = () => {
    setShowBanner(false);
    applyUpdate();
  };

  const handleDismiss = () => {
    setShowBanner(false);
    dismiss();
  };

  return (
    <>
      {/* Update available banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed inset-x-0 top-0 z-[100] p-3 sm:inset-x-auto sm:top-4 sm:right-4 sm:max-w-sm",
              className
            )}
          >
            <div className="relative overflow-hidden rounded-xl border border-brand-200 bg-white shadow-xl dark:border-brand-800 dark:bg-ink-900">
              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="absolute right-2 top-2 rounded-full p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800 dark:hover:text-ink-300"
                aria-label={t("common.close")}
              >
                <X className="size-3.5" />
              </button>

              <div className="flex items-center gap-3 p-4 pr-8">
                {/* Icon */}
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 dark:bg-brand-900/30">
                  <RefreshCw className="size-4 text-brand-600 dark:text-brand-400" />
                </div>

                {/* Text + actions */}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                    {t("swUpdate.title")}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {t("swUpdate.subtitle")}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button onClick={handleUpdate} size="sm" className="h-7 px-3 text-xs">
                      {t("swUpdate.update")}
                    </Button>
                    <Button onClick={handleDismiss} variant="ghost" size="sm" className="h-7 px-3 text-xs">
                      {t("swUpdate.later")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Updated confirmation toast */}
      <AnimatePresence>
        {showUpdated && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={cn(
              "fixed inset-x-0 top-0 z-[100] p-3 sm:inset-x-auto sm:top-4 sm:right-4 sm:max-w-xs",
              className
            )}
          >
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-xl dark:border-emerald-800 dark:bg-emerald-950/50">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
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
