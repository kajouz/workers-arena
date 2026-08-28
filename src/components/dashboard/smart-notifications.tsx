"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Bell,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Info,
  Coins,
  Zap,
  Trophy,
  Megaphone,
  Gift,
  X,
} from "lucide-react";

interface SmartNotification {
  id: string;
  type:
    | "low_balance"
    | "token_expiry"
    | "tier_change"
    | "achievement"
    | "campaign"
    | "promo";
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  severity: "info" | "warning" | "success" | "urgent";
  actionLabel?: string;
  actionLabelAr?: string;
  actionUrl?: string;
  createdAt: string;
  read: boolean;
}

const ICON_MAP: Record<string, React.ElementType> = {
  low_balance: Coins,
  token_expiry: Zap,
  tier_change: Trophy,
  achievement: Trophy,
  campaign: Megaphone,
  promo: Gift,
};

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  success: "bg-green-50 border-green-200 text-green-800",
  urgent: "bg-red-50 border-red-200 text-red-800",
};

const SEVERITY_ICON_STYLES: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-amber-500",
  success: "text-green-500",
  urgent: "text-red-500",
};

export function SmartNotificationsCard() {
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasUrgent, setHasUrgent] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/worker/notifications");
      const data = await response.json();
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setHasUrgent(data.hasUrgent);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-16 bg-gray-200 rounded" />
      </div>
    );
  }

  const urgentNotifications = notifications.filter(
    (n) => n.severity === "urgent" && !n.read
  );
  const warningNotifications = notifications.filter(
    (n) => n.severity === "warning" && !n.read
  );
  const displayNotifications = expanded
    ? notifications
    : notifications.slice(0, 3);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            <span className="font-medium">Smart Alerts</span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {unreadCount} new
              </span>
            )}
          </div>
          {hasUrgent && (
            <span className="flex items-center gap-1 px-2 py-1 bg-red-500 rounded-lg text-xs font-medium animate-pulse">
              <AlertCircle className="w-3 h-3" />
              Urgent
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Urgent Alerts Banner */}
        {urgentNotifications.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-red-800 font-medium text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              Action Required
            </div>
            {urgentNotifications.map((n) => (
              <p key={n.id} className="text-sm text-red-700">
                {n.message}
              </p>
            ))}
          </div>
        )}

        {/* Warning Alerts */}
        {warningNotifications.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-amber-800 font-medium text-sm mb-1">
              <AlertTriangle className="w-4 h-4" />
              Attention
            </div>
            {warningNotifications.map((n) => (
              <p key={n.id} className="text-sm text-amber-700">
                {n.message}
              </p>
            ))}
          </div>
        )}

        {/* Notification List */}
        <div className="space-y-2">
          {displayNotifications.map((notification) => {
            const Icon = ICON_MAP[notification.type] || Bell;
            return (
              <div
                key={notification.id}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  SEVERITY_STYLES[notification.severity],
                  !notification.read && "ring-2 ring-offset-1 ring-blue-200"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Icon
                      className={cn(
                        "w-5 h-5 mt-0.5 flex-shrink-0",
                        SEVERITY_ICON_STYLES[notification.severity]
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {notification.title}
                        </span>
                        {!notification.read && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                      </div>
                      <p className="text-sm opacity-80 mt-0.5">
                        {notification.message}
                      </p>
                      {notification.actionLabel && (
                        <a
                          href={notification.actionUrl}
                          className="inline-block mt-2 px-3 py-1 bg-white/50 hover:bg-white/80 rounded text-xs font-medium transition-colors"
                        >
                          {notification.actionLabel} →
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!notification.read && (
                      <button
                        onClick={() => markAsRead(notification.id)}
                        className="p-1 hover:bg-white/50 rounded transition-colors"
                        title="Mark as read"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => dismissNotification(notification.id)}
                      className="p-1 hover:bg-white/50 rounded transition-colors"
                      title="Dismiss"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Show More */}
        {notifications.length > 3 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full mt-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            Show all {notifications.length} notifications
          </button>
        )}
      </div>
    </div>
  );
}
