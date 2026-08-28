"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
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
  accept: "bg-green-100 text-green-700",
  decline: "bg-red-100 text-red-700",
  reschedule: "bg-amber-100 text-amber-700",
  follow_up: "bg-blue-100 text-blue-700",
};

export function MobileFeaturesCard() {
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-32 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!features) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
      <div className="p-4 bg-sky-50 border-b border-gray-200">
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
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
              ✓ Mobile App Detected
            </span>
          )}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200">
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
                    ? "border-sky-500 text-sky-600 bg-sky-50"
                    : "border-transparent text-gray-600 hover:text-gray-900"
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
            <h4 className="font-medium text-gray-900">
              Push Notification Preferences
            </h4>
            <div className="space-y-3">
              {features.pushPreferences.map((pref) => (
                <div
                  key={pref.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Bell
                      className={cn(
                        "w-5 h-5",
                        pref.enabled ? "text-sky-500" : "text-gray-400"
                      )}
                    />
                    <div>
                      <div className="font-medium text-sm">{pref.name}</div>
                      <div className="text-xs text-gray-500">
                        {pref.description}
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors cursor-pointer",
                      pref.enabled ? "bg-sky-500" : "bg-gray-300"
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
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800">
              <strong>Mobile Exclusive:</strong> Push notifications deliver leads
              3x faster than email, helping you respond before competitors.
            </div>
          </div>
        )}

        {/* Quick Respond */}
        {activeSection === "quickrespond" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Quick Respond Templates
            </h4>
            <p className="text-sm text-gray-600">
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
                      : "border-gray-200 hover:border-gray-300"
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
                    <span className="text-xs text-gray-500">
                      Used {template.usageCount}x
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {template.message}
                  </p>
                  {selectedTemplate === template.id && (
                    <div className="mt-3 flex items-center gap-2">
                      <button className="flex-1 py-2 bg-sky-500 text-white rounded-lg text-sm hover:bg-sky-600 transition-colors flex items-center justify-center gap-2">
                        <Send className="w-4 h-4" />
                        Send Response
                      </button>
                      <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors">
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
            <h4 className="font-medium text-gray-900">
              Offline Balance Cache
            </h4>
            <p className="text-sm text-gray-600">
              Your balance is cached locally for offline access. Last synced:{" "}
              {new Date(features.offlineBalance.lastSynced).toLocaleTimeString()}
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
                  ? "bg-amber-50 border border-amber-200 text-amber-800"
                  : "bg-green-50 border border-green-200 text-green-800"
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

            <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-800">
              <strong>Mobile Exclusive:</strong> Offline balance lets you check
              credits/tokens even without internet. Perfect for job sites with
              poor connectivity.
            </div>
          </div>
        )}

        {/* Mobile Bonuses */}
        {activeSection === "bonuses" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Mobile-Only Bonuses
            </h4>
            <p className="text-sm text-gray-600">
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
                        : "border-gray-200"
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
                            ? "bg-amber-100 text-amber-700"
                            : "bg-purple-100 text-purple-700"
                        )}
                      >
                        +{bonus.reward} {bonus.rewardType}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {bonus.description}
                    </p>
                    {bonus.claimed ? (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <Check className="w-4 h-4" />
                        Claimed
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">
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
