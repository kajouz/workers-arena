"use client";

import { useState, useEffect } from "react";
import { cn, formatTime } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import {
  Smartphone,
  Bell,
  MessageSquare,
  Wifi,
  WifiOff,
  Gift,
  Clock,
  Send,
  Check,
  ChevronRight,
  Zap,
} from "lucide-react";

interface PushNotificationPreference {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  enabled: boolean;
  type: "leads" | "bookings" | "payments" | "promotions" | "achievements";
}

interface QuickRespondTemplate {
  id: string;
  name: string;
  nameAr: string;
  message: string;
  messageAr: string;
  category: "accept" | "decline" | "reschedule" | "follow_up";
  usageCount: number;
}

interface OfflineBalance {
  credits: number;
  tokens: number;
  lastSynced: string;
  isStale: boolean;
}

interface MobileBonus {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  reward: number;
  rewardType: "credits" | "tokens";
  expiresAt: string;
  claimed: boolean;
}

interface MobileFeatures {
  pushPreferences: PushNotificationPreference[];
  quickRespondTemplates: QuickRespondTemplate[];
  offlineBalance: OfflineBalance;
  mobileBonuses: MobileBonus[];
  appVersion: string;
  lastAppUpdate: string;
  isMobileApp: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  accept: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  decline: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  reschedule: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  follow_up: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
};

export function MobileFeaturesCard() {
  const { locale } = useLocale();
  const [features, setFeatures] = useState<MobileFeatures | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<
    "notifications" | "quickrespond" | "offline" | "bonuses"
  >("notifications");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/worker/mobile-features");
      const data = await response.json();
      setFeatures(data);
    } catch (error) {
      console.error("Error fetching mobile features:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-6 animate-pulse">
        <div className="h-6 bg-ink-200 dark:bg-ink-800 rounded w-1/3 mb-4" />
        <div className="h-32 bg-ink-200 dark:bg-ink-800 rounded" />
      </div>
    );
  }

  if (!features) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-sky-500 to-blue-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            <span className="font-medium">Mobile Features</span>
          </div>
          <span className="text-sm opacity-80">مميزات الهاتف</span>
        </div>
      </div>

      {/* App Info */}
      <div className="p-4 bg-sky-50 border-b border-ink-200 dark:border-ink-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-sky-600" />
            <div>
              <div className="font-medium text-sky-800">
                WorkersArena Mobile
              </div>
              <div className="text-xs text-sky-600">
                Version {features.appVersion}
              </div>
            </div>
          </div>
          {features.isMobileApp && (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded dark:bg-green-500/15 dark:text-green-300">
              ✓ Mobile App Detected
            </span>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-ink-200 dark:border-ink-800">
        <div className="flex overflow-x-auto">
          {[
            {
              id: "notifications" as const,
              label: "Push Alerts",
              icon: Bell,
            },
            {
              id: "quickrespond" as const,
              label: "Quick Reply",
              icon: MessageSquare,
            },
            { id: "offline" as const, label: "Offline", icon: Wifi },
            { id: "bonuses" as const, label: "Bonuses", icon: Gift },
          ].map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeSection === section.id
                    ? "border-sky-500 text-sky-800 bg-sky-50 dark:bg-sky-500/15 dark:text-sky-300"
                    : "border-transparent text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-ink-50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {/* Push Notifications */}
        {activeSection === "notifications" && (
          <div className="space-y-4">
            <h4 className="font-medium text-ink-900 dark:text-ink-50">
              Push Notification Preferences
            </h4>
            <div className="space-y-3">
              {features.pushPreferences.map((pref) => (
                <div
                  key={pref.id}
                  className="flex items-center justify-between p-3 bg-ink-50 dark:bg-ink-950 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Bell
                      className={cn(
                        "w-5 h-5",
                        pref.enabled ? "text-sky-500" : "text-ink-400 dark:text-ink-500"
                      )}
                    />
                    <div>
                      <div className="font-medium text-sm">{pref.name}</div>
                      <div className="text-xs text-ink-500 dark:text-ink-400">
                        {pref.description}
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors cursor-pointer",
                      pref.enabled ? "bg-sky-500" : "bg-ink-300 dark:bg-ink-700"
                    )}
                  >
                    <div
                      className={cn(
                        "w-6 h-6 bg-white rounded-full shadow transition-transform",
                        pref.enabled ? "translate-x-6" : "translate-x-0"
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
              <strong>Mobile Exclusive:</strong> Push notifications deliver leads
              3x faster than email, helping you respond before competitors.
            </div>
          </div>
        )}

        {/* Quick Respond */}
        {activeSection === "quickrespond" && (
          <div className="space-y-4">
            <h4 className="font-medium text-ink-900 dark:text-ink-50">
              Quick Respond Templates
            </h4>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              Tap a template to instantly respond to leads from push
              notifications.
            </p>
            <div className="space-y-2">
              {features.quickRespondTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={cn(
                    "p-3 rounded-lg border-2 cursor-pointer transition-all",
                    selectedTemplate === template.id
                      ? "border-sky-500 bg-sky-50"
                      : "border-ink-200 dark:border-ink-800 hover:border-ink-300 dark:hover:border-ink-700"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {template.name}
                      </span>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-xs rounded",
                          CATEGORY_COLORS[template.category]
                        )}
                      >
                        {template.category}
                      </span>
                    </div>
                    <span className="text-xs text-ink-500 dark:text-ink-400">
                      Used {template.usageCount}x
                    </span>
                  </div>
                  <p className="text-sm text-ink-600 dark:text-ink-300 line-clamp-2">
                    {template.message}
                  </p>
                  {selectedTemplate === template.id && (
                    <div className="mt-3 flex items-center gap-2">
                      <button className="flex-1 py-2 bg-sky-500 text-white rounded-lg text-sm hover:bg-sky-600 transition-colors flex items-center justify-center gap-2">
                        <Send className="w-4 h-4" />
                        Send Response
                      </button>
                      <button className="px-4 py-2 bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 rounded-lg text-sm hover:bg-ink-200 dark:hover:bg-ink-800 transition-colors">
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Offline Balance */}
        {activeSection === "offline" && (
          <div className="space-y-4">
            <h4 className="font-medium text-ink-900 dark:text-ink-50">
              Offline Balance Cache
            </h4>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              Your balance is cached locally for offline access. Last synced:{" "}
              {formatTime(features.offlineBalance.lastSynced, locale)}
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                <Zap className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-amber-700">
                  {features.offlineBalance.credits}
                </div>
                <div className="text-sm text-amber-600">Credits</div>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-center">
                <Zap className="w-6 h-6 text-purple-500 mx-auto mb-2" />
                <div className="text-2xl font-bold text-purple-700">
                  {features.offlineBalance.tokens}
                </div>
                <div className="text-sm text-purple-600">Tokens</div>
              </div>
            </div>

            <div
              className={cn(
                "p-3 rounded-lg flex items-center gap-2",
                features.offlineBalance.isStale
                  ? "bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                  : "bg-green-50 border border-green-200 text-green-800 dark:bg-green-500/15 dark:text-green-300"
              )}
            >
              {features.offlineBalance.isStale ? (
                <>
                  <WifiOff className="w-5 h-5" />
                  <span className="text-sm">
                    Data may be outdated. Connect to internet to sync.
                  </span>
                </>
              ) : (
                <>
                  <Wifi className="w-5 h-5" />
                  <span className="text-sm">
                    Balance is up to date. Cached for offline use.
                  </span>
                </>
              )}
            </div>

            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800 dark:bg-sky-500/15 dark:text-sky-300">
              <strong>Mobile Exclusive:</strong> Offline balance lets you check
              credits/tokens even without internet. Perfect for job sites with
              poor connectivity.
            </div>
          </div>
        )}

        {/* Mobile Bonuses */}
        {activeSection === "bonuses" && (
          <div className="space-y-4">
            <h4 className="font-medium text-ink-900 dark:text-ink-50">
              Mobile-Only Bonuses
            </h4>
            <p className="text-sm text-ink-600 dark:text-ink-300">
              Exclusive rewards for using the mobile app. These bonuses are not
              available on the web.
            </p>
            <div className="space-y-3">
              {features.mobileBonuses.map((bonus) => {
                const daysLeft = Math.ceil(
                  (new Date(bonus.expiresAt).getTime() - Date.now()) /
                    86400000
                );
                return (
                  <div
                    key={bonus.id}
                    className={cn(
                      "p-4 rounded-lg border-2",
                      bonus.claimed
                        ? "border-green-500 bg-green-50"
                        : "border-ink-200 dark:border-ink-800"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Gift
                          className={cn(
                            "w-5 h-5",
                            bonus.claimed
                              ? "text-green-500"
                              : "text-sky-500"
                          )}
                        />
                        <span className="font-medium">{bonus.name}</span>
                      </div>
                      <span
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded",
                          bonus.rewardType === "credits"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300"
                        )}
                      >
                        +{bonus.reward} {bonus.rewardType}
                      </span>
                    </div>
                    <p className="text-sm text-ink-600 dark:text-ink-300 mb-2">
                      {bonus.description}
                    </p>
                    {bonus.claimed ? (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <Check className="w-4 h-4" />
                        Claimed
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-ink-500 dark:text-ink-400">
                          {daysLeft} days left
                        </span>
                        <button className="px-3 py-1 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600 transition-colors">
                          Claim Bonus
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
