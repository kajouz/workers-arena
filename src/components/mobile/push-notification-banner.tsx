"use client";

import { useState, useEffect } from "react";
import { Bell, X, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

export function PushNotificationBanner() {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    // Check if we're in a native app or browser with notification support
    async function checkPermission() {
      if (typeof window === "undefined") return;

      // Check if running in Capacitor
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (Capacitor.isNativePlatform()) {
          // In native app, check push notification permission
          const { PushNotifications } = await import("@capacitor/push-notifications");
          const perm = await PushNotifications.checkPermissions();
          setPermission(perm.receive as NotificationPermission);
          if (perm.receive === "prompt") {
            setVisible(true);
          }
          return;
        }
      } catch {
        // Not in Capacitor
      }

      // Browser push notifications
      if ("Notification" in window) {
        setPermission(Notification.permission);
        if (Notification.permission === "default") {
          setVisible(true);
        }
      }
    }

    checkPermission();
  }, []);

  const handleAllow = async () => {
    try {
      // Try Capacitor push notifications first
      const { Capacitor } = await import("@capacitor/core");
      if (Capacitor.isNativePlatform()) {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const perm = await PushNotifications.requestPermissions();
        setPermission(perm.receive as NotificationPermission);
        if (perm.receive === "granted") {
          await PushNotifications.register();
        }
      } else {
        // Browser notifications
        const result = await Notification.requestPermission();
        setPermission(result);
      }
    } catch {
      // Fallback to browser notifications
      if ("Notification" in window) {
        const result = await Notification.requestPermission();
        setPermission(result);
      }
    }
    setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    // Remember dismissal for 7 days
    localStorage.setItem("push-dismissed", Date.now().toString());
  };

  // Don't show if already granted or recently dismissed
  if (!visible || permission === "granted" || permission === "denied") {
    return null;
  }

  // Check if recently dismissed (within 7 days)
  const dismissedAt = localStorage.getItem("push-dismissed");
  if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) {
    return null;
  }

  return (
    <div className="fixed bottom-20 inset-x-4 z-40 lg:hidden">
      <div className="bg-gradient-to-r from-brand-500 to-brand-600 rounded-2xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <BellRing className="size-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {t("mobile.pushBannerTitle") || "Stay updated on your jobs"}
            </p>
            <p className="text-xs text-white/80 mt-0.5">
              {t("mobile.pushBannerBody") || "Get instant notifications for new bookings and messages"}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleAllow}
                className="bg-white text-brand-600 hover:bg-white/90 text-xs font-bold"
              >
                {t("mobile.pushBannerAllow") || "Enable Notifications"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-white/80 hover:text-white hover:bg-white/10 text-xs"
              >
                {t("mobile.pushBannerDismiss") || "Not now"}
              </Button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 text-white/60 hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
