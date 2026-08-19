"use client";

import { useState, useEffect, useCallback } from "react";
import {
  isCapacitorApp,
  getPlatform,
  requestNotificationPermission,
  getNotificationPermission,
  registerForPushNotifications,
  initializePushNotifications,
  cleanupPushNotifications,
  getStoredPushToken,
  isPushNotificationsEnabled,
  setBadgeCount,
  clearDeliveredNotifications,
} from "@/lib/mobile/push-notifications";

interface PushNotificationsState {
  isSupported: boolean;
  isNative: boolean;
  platform: "ios" | "android" | "web";
  permission: "granted" | "denied" | "prompt";
  isRegistered: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
}

interface UsePushNotificationsReturn extends PushNotificationsState {
  requestPermission: () => Promise<boolean>;
  register: () => Promise<string | null>;
  unregister: () => Promise<void>;
  setBadge: (count: number) => Promise<void>;
  clearNotifications: () => Promise<void>;
}

/**
 * Hook for managing push notifications with Capacitor native support
 *
 * Features:
 * - Automatic initialization when running in Capacitor
 * - Permission management
 * - Token registration and storage
 * - Badge count management
 * - Platform-aware (iOS vs Android vs Web)
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationsState>({
    isSupported: false,
    isNative: false,
    platform: "web",
    permission: "prompt",
    isRegistered: false,
    token: null,
    loading: true,
    error: null,
  });

  // Initialize on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const isNative = isCapacitorApp();
        const platform = getPlatform();
        const permission = await getNotificationPermission();
        const token = getStoredPushToken();
        const isRegistered = !!(await isPushNotificationsEnabled());

        if (mounted) {
          setState({
            isSupported: isNative || ("Notification" in window),
            isNative,
            platform,
            permission,
            isRegistered,
            token,
            loading: false,
            error: null,
          });
        }

        // Initialize native push notifications
        if (isNative) {
          await initializePushNotifications();
        }
      } catch (error) {
        if (mounted) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : "Unknown error",
          }));
        }
      }
    }

    init();

    return () => {
      mounted = false;
      cleanupPushNotifications();
    };
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const granted = await requestNotificationPermission();
      const permission = await getNotificationPermission();

      setState((prev) => ({
        ...prev,
        permission,
        loading: false,
      }));

      return granted;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to request permission",
      }));
      return false;
    }
  }, []);

  const register = useCallback(async (): Promise<string | null> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const token = await registerForPushNotifications();
      const storedToken = token || getStoredPushToken();
      const isRegistered = !!(await isPushNotificationsEnabled());

      setState((prev) => ({
        ...prev,
        token: storedToken,
        isRegistered,
        loading: false,
      }));

      return storedToken;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to register",
      }));
      return null;
    }
  }, []);

  const unregister = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { PushNotifications } = await import("@capacitor/push-notifications");
      await PushNotifications.unregister();

      localStorage.removeItem("wa-push-token");
      localStorage.removeItem("wa-push-platform");

      setState((prev) => ({
        ...prev,
        token: null,
        isRegistered: false,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : "Failed to unregister",
      }));
    }
  }, []);

  const setBadge = useCallback(async (count: number): Promise<void> => {
    try {
      await setBadgeCount(count);
    } catch (error) {
      console.error("Failed to set badge count:", error);
    }
  }, []);

  const clearNotifications = useCallback(async (): Promise<void> => {
    try {
      await clearDeliveredNotifications();
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    }
  }, []);

  return {
    ...state,
    requestPermission,
    register,
    unregister,
    setBadge,
    clearNotifications,
  };
}
