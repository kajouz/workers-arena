"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, X, Share, ArrowDownToLine, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);

  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "desktop";
}

interface MobileInstallIconProps {
  className?: string;
}

/**
 * Floating mobile install icon that detects the user's platform and shows
 * platform-specific install instructions. Appears on the landing page
 * to encourage PWA installation.
 *
 * - iOS: Shows "Share → Add to Home Screen" instructions
 * - Android: Triggers the browser's native install prompt
 * - Desktop: Shows install instructions for Chrome/Edge
 */
export function MobileInstallIcon({ className }: MobileInstallIconProps) {
  const { t } = useLocale();
  const { canInstall, isInstalled, install, dismiss } = useInstallPrompt();
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [showDialog, setShowDialog] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // Don't show if already installed
  if (isInstalled) return null;

  // Don't show on unknown platform
  if (platform === "unknown") return null;

  const handleInstall = async () => {
    if (platform === "android" && canInstall) {
      setIsInstalling(true);
      const success = await install();
      setIsInstalling(false);
      if (success) setShowDialog(false);
    } else {
      setShowDialog(true);
    }
  };

  const handleDismiss = () => {
    setShowDialog(false);
    dismiss();
  };

  const getPlatformIcon = () => {
    switch (platform) {
      case "ios":
        return <Share className="size-5" />;
      case "android":
        return <ArrowDownToLine className="size-5" />;
      case "desktop":
        return <Monitor className="size-5" />;
      default:
        return <Download className="size-5" />;
    }
  };

  const getPlatformLabel = () => {
    switch (platform) {
      case "ios":
        return t("mobileInstall.iosLabel");
      case "android":
        return t("mobileInstall.androidLabel");
      case "desktop":
        return t("mobileInstall.desktopLabel");
      default:
        return t("mobileInstall.install");
    }
  };

  return (
    <>
      {/* Floating install icon */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 20 }}
        onClick={handleInstall}
        className={cn(
          "fixed bottom-24 end-4 z-40 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-lg transition-all hover:scale-110 hover:shadow-xl sm:bottom-28 sm:end-6",
          className
        )}
        aria-label={getPlatformLabel()}
      >
        {getPlatformIcon()}
        <span className="absolute -top-1 -end-1 size-3 rounded-full bg-emerald-400 animate-pulse" />
      </motion.button>

      {/* Platform-specific install dialog */}
      <AnimatePresence>
        {showDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={handleDismiss}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900"
            >
              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="absolute right-3 top-3 rounded-full p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800 dark:hover:text-ink-300"
                aria-label={t("common.close")}
              >
                <X className="size-5" />
              </button>

              <div className="p-6">
                {/* Header */}
                <div className="mb-5 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-900/30">
                    {getPlatformIcon()}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                      {t("mobileInstall.title")}
                    </h3>
                    <p className="text-sm text-ink-500 dark:text-ink-400">
                      {t("mobileInstall.subtitle")}
                    </p>
                  </div>
                </div>

                {/* Platform-specific instructions */}
                {platform === "ios" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        1
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.iosStep1")}
                      </p>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        2
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.iosStep2")}
                      </p>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        3
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.iosStep3")}
                      </p>
                    </div>
                  </div>
                )}

                {platform === "android" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        1
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.androidStep1")}
                      </p>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        2
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.androidStep2")}
                      </p>
                    </div>
                  </div>
                )}

                {platform === "desktop" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        1
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.desktopStep1")}
                      </p>
                    </div>
                    <div className="flex items-start gap-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">
                        2
                      </span>
                      <p className="text-sm text-ink-700 dark:text-ink-300">
                        {t("mobileInstall.desktopStep2")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="mt-6 flex gap-3">
                  {platform === "android" && canInstall ? (
                    <Button
                      onClick={async () => {
                        setIsInstalling(true);
                        const success = await install();
                        setIsInstalling(false);
                        if (success) setShowDialog(false);
                      }}
                      disabled={isInstalling}
                      className="flex-1"
                    >
                      {isInstalling ? (
                        <span className="flex items-center gap-2">
                          <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          {t("common.loading")}
                        </span>
                      ) : (
                        t("mobileInstall.install")
                      )}
                    </Button>
                  ) : (
                    <Button onClick={handleDismiss} className="flex-1">
                      {t("mobileInstall.gotIt")}
                    </Button>
                  )}
                  <Button onClick={handleDismiss} variant="ghost">
                    {t("mobileInstall.dismiss")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
