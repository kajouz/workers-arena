"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Loader2, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import {
  persistOnboardingFlag,
  readOnboardingFlag,
  shouldShowOnboarding,
} from "@/lib/notifications/onboarding";

/**
 * One-time homepage prompt for signed-in users: "enable push notifications".
 * Shows only while push is actually possible (server configured + not yet
 * enabled / not denied), never nags twice (localStorage flag), and animates
 * out when dismissed, enabled, or once the browser says no.
 */
export function PushOnboarding({ signedIn }: { signedIn: boolean }) {
  const { t } = useLocale();
  const { status, busy, enable } = usePushSubscription();
  // Hydration-safe: the initializer is guarded (SSR renders "loading" with no
  // banner at all), and the real localStorage flag is read in the same client
  // pass before status ever resolves to "idle".
  const [dismissed, setDismissed] = useState(() => readOnboardingFlag());

  // The user enabled or the browser denied — don't ask on this device again.
  useEffect(() => {
    if (status === "enabled" || status === "denied") {
      persistOnboardingFlag(true);
      setDismissed(true);
    }
  }, [status]);

  const visible = shouldShowOnboarding(status, signedIn, dismissed);

  const onEnable = async () => {
    const ok = await enable();
    // enable() returns the outcome — don't trust the captured `status` (stale
    // closure by the time the await resolves).
    if (ok) {
      persistOnboardingFlag(true);
      setDismissed(true);
      toast("success", t("notifications.pushEnabled"));
    } else {
      toast("error", t("notifications.pushError"));
    }
  };

  const onDismiss = () => {
    persistOnboardingFlag(true);
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="push-onboarding"
          aria-live="polite"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-4 start-4 z-40 w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="glass-strong relative overflow-hidden rounded-2xl border border-brand-500/25 p-5 shadow-lift">
            {/* soft glow */}
            <div className="pointer-events-none absolute -top-16 -end-16 size-40 rounded-full bg-brand-500/20 blur-3xl" />

            <button
              onClick={onDismiss}
              aria-label={t("common.close")}
              className="absolute end-3 top-3 rounded-md p-1 text-ink-400 transition-colors hover:text-ink-700 dark:hover:text-ink-200"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-start gap-3.5">
              <span className="relative mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
                <span className="absolute inset-0 rounded-xl bg-brand-500/30 motion-safe:animate-ping [animation-duration:2.2s]" />
                <BellRing className="relative size-5" />
              </span>
              <div className="min-w-0 pe-6">
                <p className="text-sm font-black text-ink-900 dark:text-ink-50">{t("notifications.pushOnboardTitle")}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{t("notifications.pushOnboardBody")}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button onClick={() => void onEnable()} disabled={busy} size="sm" className="flex-1">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                {t("notifications.pushOnboardEnable")}
              </Button>
              <Button variant="ghost" size="sm" onClick={onDismiss} disabled={busy}>
                {t("notifications.pushOnboardLater")}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
