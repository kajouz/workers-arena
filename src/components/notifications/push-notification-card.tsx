"use client";

import { BellRing, CheckCircle2, Info, XCircle } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { usePushSubscription } from "@/hooks/use-push-subscription";

/**
 * Push-notification management card (notifications page). Walks the browser
 * through permission → subscribe → register, with a graceful state for every
 * outcome (unsupported browser, server without VAPID keys, denied permission).
 */
export function PushNotificationCard() {
  const { t } = useLocale();
  const { status, error, busy, enable, disable } = usePushSubscription();

  if (status === "loading") return null;

  const isEnabled = status === "enabled";
  const isDenied = status === "denied";
  const isUnconfigured = status === "unconfigured";
  const isUnsupported = status === "unsupported";

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-500/[0.06] to-transparent p-5">
      <div className="flex min-w-0 items-start gap-3.5">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
          {isEnabled ? <CheckCircle2 className="size-5" /> : isDenied || isUnconfigured || isUnsupported ? <Info className="size-5" /> : <BellRing className="size-5" />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-ink-900 dark:text-ink-50">{t("notifications.pushTitle")}</p>
          <p className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            {isEnabled
              ? t("notifications.pushEnabled")
              : isDenied
                ? t("notifications.pushDenied")
                : isUnconfigured
                  ? t("notifications.pushUnconfigured")
                  : isUnsupported
                    ? t("notifications.pushUnsupported")
                    : status === "error"
                      ? t("notifications.pushError")
                      : t("notifications.pushBody")}
          </p>
        </div>
      </div>

      {status === "idle" && (
        <Button onClick={() => void enable()} disabled={busy} className="shrink-0">
          <BellRing className="size-4" /> {t("notifications.pushEnable")}
        </Button>
      )}
      {isEnabled && (
        <Button variant="outline" onClick={() => void disable()} disabled={busy} className="shrink-0">
          <XCircle className="size-4" /> {t("notifications.pushDisable")}
        </Button>
      )}
      {status === "error" && (
        <Button variant="outline" onClick={() => void enable()} disabled={busy} className="shrink-0">
          {t("notifications.pushRetry")}
        </Button>
      )}
      {error && <p className="sr-only">{error}</p>}
    </div>
  );
}
