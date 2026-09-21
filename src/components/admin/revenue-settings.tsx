"use client";

import { useState, useEffect } from "react";
import { cn, formatNumber } from "@/lib/utils";
import {
  DollarSign,
  Coins,
  TrendingUp,
  Shield,
  Zap,
  CreditCard,
  Megaphone,
  Headphones,
  BookOpen,
  Package,
  Building2,
  Palette,
  Save,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  BarChart3,
  Clock,
} from "lucide-react";

interface RevenueStream {
  id: string;
  name: string;
  nameAr: string;
  enabled: boolean;
  description: string;
  descriptionAr: string;
  settings: Record<string, unknown>;
}

interface RevenueAnalytics {
  streamId: string;
  streamName: string;
  totalRevenue: number;
  monthlyRevenue: number;
  transactionCount: number;
  averageTransactionValue: number;
  growthPercent: number;
}

const STREAM_ICONS: Record<string, React.ElementType> = {
  credits: Coins,
  tokens: Zap,
  sliding_commissions: TrendingUp,
  background_checks: Shield,
  instant_payouts: CreditCard,
  saas_tools: Package,
  promoted_profiles: Megaphone,
  premium_support: Headphones,
  insurance: Shield,
  training: BookOpen,
  equipment_marketplace: Package,
  whitelabel: Building2,
  branding: Palette,
};

export function RevenueSettingsDashboard() {
  const [streams, setStreams] = useState<RevenueStream[]>([]);
  const [analytics, setAnalytics] = useState<RevenueAnalytics[]>([]);
  const [expandedStream, setExpandedStream] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchAnalytics();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/admin/revenue-settings");
      const data = await response.json();
      setStreams(data.streams || []);
    } catch (error) {
      console.error("Error fetching revenue settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch("/api/admin/revenue-settings?analytics=true");
      const data = await response.json();
      setAnalytics(data.analytics || []);
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
  };

  const handleToggleStream = async (streamId: string, enabled: boolean) => {
    try {
      const response = await fetch("/api/admin/revenue-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, enabled }),
      });

      if (response.ok) {
        setStreams(streams.map(s => 
          s.id === streamId ? { ...s, enabled } : s
        ));
        setHasChanges(true);
      }
    } catch (error) {
      console.error("Error toggling stream:", error);
    }
  };

  const handleUpdateSettings = async (streamId: string, settings: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/admin/revenue-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamId, updates: { settings } }),
      });

      if (response.ok) {
        setStreams(streams.map(s => 
          s.id === streamId ? { ...s, settings } : s
        ));
        setHasChanges(true);
      }
    } catch (error) {
      console.error("Error updating settings:", error);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    // In production, this would save all pending changes
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSaving(false);
    setHasChanges(false);
    alert("Settings saved successfully!");
  };

  const totalMonthlyRevenue = analytics.reduce((sum, a) => sum + a.monthlyRevenue, 0);
  const enabledCount = streams.filter(s => s.enabled).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-ink-400 dark:text-ink-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Revenue Streams</h2>
          <p className="text-ink-500 dark:text-ink-400">Configure and manage all revenue streams</p>
        </div>
        <button
          onClick={handleSaveAll}
          disabled={!hasChanges || saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            hasChanges
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-ink-100 dark:bg-ink-800 text-ink-400 dark:text-ink-500 cursor-not-allowed"
          )}
        >
          {saving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-ink-500 dark:text-ink-400">Monthly Revenue</p>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">${formatNumber(totalMonthlyRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-ink-500 dark:text-ink-400">Active Streams</p>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{enabledCount} / {streams.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-ink-500 dark:text-ink-400">Avg. Growth</p>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">
                {analytics.length > 0 
                  ? Math.round(analytics.reduce((sum, a) => sum + a.growthPercent, 0) / analytics.length)
                  : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Streams List */}
      <div className="space-y-3">
        {streams.map((stream) => {
          const Icon = STREAM_ICONS[stream.id] || DollarSign;
          const isExpanded = expandedStream === stream.id;
          const streamAnalytics = analytics.find(a => a.streamId === stream.id);

          return (
            <div
              key={stream.id}
              className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden"
            >
              {/* Stream Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-ink-50 dark:hover:bg-ink-950"
                onClick={() => setExpandedStream(isExpanded ? null : stream.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "p-2 rounded-lg",
                    stream.enabled ? "bg-green-100" : "bg-ink-100 dark:bg-ink-800"
                  )}>
                    <Icon className={cn(
                      "w-5 h-5",
                      stream.enabled ? "text-green-600" : "text-ink-400 dark:text-ink-500"
                    )} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-ink-900 dark:text-ink-50">{stream.name}</p>
                      <span className="text-sm text-ink-500 dark:text-ink-400">({stream.nameAr})</span>
                    </div>
                    <p className="text-sm text-ink-500 dark:text-ink-400">{stream.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {streamAnalytics && (
                    <div className="text-right">
                      <p className="text-sm font-medium text-ink-900 dark:text-ink-50">
                        ${formatNumber(streamAnalytics.monthlyRevenue)}/mo
                      </p>
                      <p className="text-xs text-green-600">
                        +{streamAnalytics.growthPercent}% growth
                      </p>
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStream(stream.id, !stream.enabled);
                    }}
                    className={cn(
                      "relative w-12 h-6 rounded-full transition-colors",
                      stream.enabled ? "bg-green-500" : "bg-ink-200 dark:bg-ink-800"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow",
                        stream.enabled && "translate-x-6"
                      )}
                    />
                  </button>

                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-ink-400 dark:text-ink-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-ink-400 dark:text-ink-500" />
                  )}
                </div>
              </div>

              {/* Stream Settings (Expanded) */}
              {isExpanded && (
                <div className="p-4 border-t border-ink-200 dark:border-ink-800 bg-ink-50 dark:bg-ink-950">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(stream.settings).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <label className="text-sm font-medium text-ink-700 dark:text-ink-200 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </label>
                        {typeof value === "boolean" ? (
                          <button
                            onClick={() => handleUpdateSettings(stream.id, {
                              ...stream.settings,
                              [key]: !value,
                            })}
                            className={cn(
                              "relative w-10 h-5 rounded-full transition-colors",
                              value ? "bg-blue-500" : "bg-ink-200 dark:bg-ink-800"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform",
                                value && "translate-x-5"
                              )}
                            />
                          </button>
                        ) : typeof value === "number" ? (
                          <input
                            type="number"
                            value={value}
                            onChange={(e) => handleUpdateSettings(stream.id, {
                              ...stream.settings,
                              [key]: parseFloat(e.target.value) || 0,
                            })}
                            className="w-24 px-2 py-1 border border-ink-200 dark:border-ink-800 rounded-lg text-sm"
                          />
                        ) : (
                          <input
                            type="text"
                            value={String(value)}
                            onChange={(e) => handleUpdateSettings(stream.id, {
                              ...stream.settings,
                              [key]: e.target.value,
                            })}
                            className="w-32 px-2 py-1 border border-ink-200 dark:border-ink-800 rounded-lg text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {streamAnalytics && (
                    <div className="mt-4 pt-4 border-t border-ink-200 dark:border-ink-800">
                      <h4 className="text-sm font-medium text-ink-700 dark:text-ink-200 mb-2">Analytics</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-ink-500 dark:text-ink-400">Total Revenue</p>
                          <p className="font-medium">${formatNumber(streamAnalytics.totalRevenue)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-ink-500 dark:text-ink-400">Transactions</p>
                          <p className="font-medium">{streamAnalytics.transactionCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-ink-500 dark:text-ink-400">Avg. Value</p>
                          <p className="font-medium">${streamAnalytics.averageTransactionValue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-ink-500 dark:text-ink-400">Growth</p>
                          <p className="font-medium text-green-600">+{streamAnalytics.growthPercent}%</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
