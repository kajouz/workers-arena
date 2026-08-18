"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Wifi, WifiOff, Zap, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface InstallBannerProps {
  /** Custom class name */
  className?: string;
}

/**
 * In-app install banner that replaces the browser's default install prompt.
 *
 * Shows a non-intrusive banner at the bottom of the screen with clear
 * benefits explaining why the user should install the PWA:
 * - Browse workers offline
 * - Send requests without connection
 * - Faster loading from cache
 * - Add to home screen like a native app
 *
 * The banner respects user dismissal (stored in localStorage) and won't
 * show again for 7 days after dismissal.
 */
export function InstallBanner({ className }: InstallBannerProps) {
  const { t } = useLocale();
  const { canInstall, isInstalled, install, dismiss } = useInstallPrompt();
  const [showBanner, setShowBanner] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if already installed or can't install
    if (isInstalled || !canInstall) {
      setShowBanner(false);
      return;
    }

    // Check if user dismissed recently (7 days)
    const dismissedAt = localStorage.getItem("wa-pwa-install-dismissed");
    if (dismissedAt) {
      const daysSinceDismiss = (Date.now() - Number(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismiss < 7) {
        setShowBanner(false);
        return;
      }
    }

    // Show banner after a short delay for better UX
    const timer = setTimeout(() => setShowBanner(true), 2000);
    return () => clearTimeout(timer);
  }, [canInstall, isInstalled]);

  const handleInstall = async () => {
    setIsInstalling(true);
    const success = await install();
    setIsInstalling(false);
    if (success) {
      setShowBanner(false);
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    dismiss();
  };

  const benefits = [
    { icon: WifiOff, key: "benefit1" },
    { icon: Wifi, key: "benefit2" },
    { icon: Zap, key: "benefit3" },
    { icon: Smartphone, key: "benefit4" },
  ];

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 p-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm",
            className
          )}
        >
          <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900">
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute right-2 top-2 rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800 dark:hover:text-ink-300"
              aria-label={t("common.close")}
            >
              <X className="size-4" />
            </button>

            <div className="p-5">
              {/* Header */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-900/30">
                  <Download className="size-5 text-brand-600 dark:text-brand-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-ink-900 dark:text-ink-50">
                    {t("install.title")}
                  </h3>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    {t("install.subtitle")}
                  </p>
                </div>
              </div>

              {/* Benefits list */}
              <ul className="mb-5 space-y-2">
                {benefits.map(({ icon: Icon, key }) => (
                  <li key={key} className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
                    <Icon className="size-4 shrink-0 text-emerald-500" />
                    <span>{t(`install.${key}`)}</span>
                  </li>
                ))}
              </ul>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-1"
                  size="sm"
                >
                  {isInstalling ? (
                    <span className="flex items-center gap-2">
                      <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      {t("common.loading")}
                    </span>
                  ) : (
                    t("install.install")
                  )}
                </Button>
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                >
                  {t("install.dismiss")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
