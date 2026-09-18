"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Share,
  ArrowDownToLine,
  Smartphone,
  WifiOff,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  const isIOS =
    /iphone|ipad|ipod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /android/.test(ua);
  if (isIOS) return "ios";
  if (isAndroid) return "android";
  return "desktop";
}

/**
 * Landing page section that shows platform-specific PWA install instructions.
 * Visible only on mobile/tablet (< 1024px) when the app isn't already installed.
 * On Android, triggers the native install prompt. On iOS, shows manual steps.
 */
export function MobileAppPromo() {
  const { t } = useLocale();
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // Don't show if already installed or on desktop
  if (isInstalled) return null;
  if (platform === "unknown" || platform === "desktop") return null;

  const handleInstall = async () => {
    if (platform === "android" && canInstall) {
      setIsInstalling(true);
      const success = await install();
      setIsInstalling(false);
      if (success) return;
    }
  };

  const benefits = [
    { icon: WifiOff, key: "benefit1" },
    { icon: Zap, key: "benefit2" },
    { icon: Smartphone, key: "benefit3" },
    { icon: CheckCircle2, key: "benefit4" },
  ];

  const iosSteps = ["iosStep1", "iosStep2", "iosStep3", "iosStep4"];
  const androidSteps = ["androidStep1", "androidStep2", "androidStep3"];

  return (
    <section className="relative overflow-hidden py-12 sm:py-16 lg:hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50/50 via-transparent to-transparent dark:from-brand-950/30" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 shadow-glow">
              <Download className="size-7 text-white" />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-3xl">
              {t("mobileAppPromo.title")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ink-500 dark:text-ink-400">
              {t("mobileAppPromo.subtitle")}
            </p>
          </div>

          {/* Platform-specific install card */}
          <div className="mx-auto mt-8 max-w-lg">
            {platform === "ios" && (
              <div className="rounded-2xl border border-ink-200/80 bg-white p-6 shadow-soft dark:border-ink-800 dark:bg-ink-900">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 dark:bg-sky-900/30">
                    <Share className="size-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-base font-bold text-ink-900 dark:text-ink-50">
                    {t("mobileAppPromo.iosTitle")}
                  </h3>
                </div>
                <ol className="space-y-3">
                  {iosSteps.map((step, i) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <span className="text-sm text-ink-600 dark:text-ink-300">
                        {t(`mobileAppPromo.${step}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {platform === "android" && (
              <div className="rounded-2xl border border-ink-200/80 bg-white p-6 shadow-soft dark:border-ink-800 dark:bg-ink-900">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <ArrowDownToLine className="size-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h3 className="text-base font-bold text-ink-900 dark:text-ink-50">
                    {t("mobileAppPromo.androidTitle")}
                  </h3>
                </div>
                <ol className="space-y-3">
                  {androidSteps.map((step, i) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                        {i + 1}
                      </span>
                      <span className="text-sm text-ink-600 dark:text-ink-300">
                        {t(`mobileAppPromo.${step}`)}
                      </span>
                    </li>
                  ))}
                </ol>
                {canInstall && (
                  <Button
                    onClick={handleInstall}
                    disabled={isInstalling}
                    className="mt-5 w-full"
                    size="lg"
                  >
                    {isInstalling ? (
                      <span className="flex items-center gap-2">
                        <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        {t("common.loading")}
                      </span>
                    ) : (
                      t("mobileAppPromo.installButton")
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Benefits row */}
          <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-3">
            {benefits.map(({ icon: Icon, key }) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded-xl border border-ink-200/60 bg-white/80 px-4 py-3 dark:border-ink-800 dark:bg-ink-900/80"
              >
                <Icon className="size-4 shrink-0 text-brand-500" />
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                  {t(`mobileAppPromo.${key}`)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
