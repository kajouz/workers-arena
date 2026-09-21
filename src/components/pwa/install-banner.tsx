"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Wifi, WifiOff, Zap, Smartphone, Share } from "lucide-react";
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

  // Detect iOS Safari for manual install instructions
  const [isIOS, setIsIOS] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setIsIOS(ios);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Don't show if already installed
    if (isInstalled) {
      setShowBanner(false);
      return;
    }

    // Android/Chrome: only show when beforeinstallprompt fires
    // iOS Safari: always show (no native prompt available)
    if (!canInstall && !isIOS) {
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
  }, [canInstall, isInstalled, isIOS]);

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
            // pb includes the safe-area inset so the buttons clear the
            // home-indicator on notched phones.
            "fixed inset-x-0 bottom-0 z-prompt p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm sm:pb-4",
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

              {/* iOS: show manual steps instead of install button */}
              {isIOS ? (
                <div className="mb-4 rounded-xl bg-sky-50 p-3 dark:bg-sky-950/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Share className="size-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                      {t("mobileAppPromo.iosTitle")}
                    </span>
                  </div>
                  <ol className="space-y-1.5">
                    {["iosStep1", "iosStep2", "iosStep3"].map((step, i) => (
                      <li key={step} className="flex items-start gap-2">
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sky-200 text-[9px] font-bold text-sky-700 dark:bg-sky-800 dark:text-sky-300">
                          {i + 1}
                        </span>
                        <span className="text-[11px] text-sky-700 dark:text-sky-300">
                          {t(`mobileInstall.${step}`)}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {/* Action buttons */}
              <div className="flex gap-2">
                {!isIOS && (
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
                )}
                <Button
                  onClick={handleDismiss}
                  variant="ghost"
                  size="sm"
                  className={isIOS ? "flex-1" : ""}
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
