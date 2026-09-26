"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  PLATFORM_SETTING_SECTIONS,
  type PlatformSettingValue,
  type PlatformSettingValues,
} from "@/lib/data/platform-settings-schema";
import {
  Settings,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Globe,
  Mail,
  Bell,
  Shield,
  CreditCard,
  Database,
  Zap,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Key,
  Lock,
} from "lucide-react";

const SECTION_ICONS: Record<string, React.ElementType> = {
  general: Settings,
  features: Zap,
  email: Mail,
  payments: CreditCard,
  notifications: Bell,
  security: Shield,
  seo: Globe,
  database: Database,
};

export function PlatformSettings() {
  // `saved` is what the server holds; `values` is the form. Changed keys are
  // the difference, so an edit that's undone no longer counts as a change.
  const [saved, setSaved] = useState<PlatformSettingValues | null>(null);
  const [values, setValues] = useState<PlatformSettingValues>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("general");
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async (): Promise<PlatformSettingValues> => {
    const res = await fetch("/api/admin/platform-settings", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { settings: PlatformSettingValues }).settings;
  }, []);

  const applyLoaded = useCallback((settings: PlatformSettingValues) => {
    setSaved(settings);
    setValues(settings);
  }, []);
  const applyLoadError = useCallback((err: unknown) => {
    setLoadError(err instanceof Error ? err.message : "failed to load");
  }, []);

  const load = useCallback(() => {
    fetchSettings().then(applyLoaded, applyLoadError);
  }, [fetchSettings, applyLoaded, applyLoadError]);

  useEffect(() => {
    let live = true;
    fetchSettings().then(
      (settings) => live && applyLoaded(settings),
      (err) => live && applyLoadError(err)
    );
    return () => {
      live = false;
    };
  }, [fetchSettings, applyLoaded, applyLoadError]);

  const changed = saved ? Object.keys(values).filter((id) => values[id] !== saved[id]) : [];
  const hasChanges = changed.length > 0;

  const sections = PLATFORM_SETTING_SECTIONS.map((section) => ({
    ...section,
    icon: SECTION_ICONS[section.id] ?? Settings,
    settings: section.settings.map((def) => ({ ...def, value: values[def.id] ?? def.default })),
  }));

  const handleSettingChange = (_sectionId: string, settingId: string, value: PlatformSettingValue) => {
    setValues((prev) => ({ ...prev, [settingId]: value }));
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: Object.fromEntries(changed.map((id) => [id, values[id]])) }),
      });
      const data = (await res.json().catch(() => ({}))) as { settings?: PlatformSettingValues; errors?: string[] };
      if (!res.ok || !data.settings) {
        toast("error", "Settings not saved", data.errors?.join("; ") ?? `HTTP ${res.status}`);
        return;
      }
      setSaved(data.settings);
      setValues(data.settings);
      toast("success", "Settings saved", `${changed.length} setting${changed.length === 1 ? "" : "s"} updated`);
    } catch {
      toast("error", "Settings not saved", "Network error — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
        <AlertTriangle className="size-5 shrink-0" />
        <span className="flex-1">Couldn&apos;t load platform settings ({loadError}).</span>
        <button
          onClick={() => {
            setLoadError(null);
            load();
          }}
          className="rounded-lg px-3 py-1.5 font-semibold hover:bg-red-100 dark:hover:bg-red-500/20">
          Retry
        </button>
      </div>
    );
  }

  if (!saved) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
        <RefreshCw className="size-4 animate-spin" /> Loading settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-ink-900 dark:text-ink-50">Platform Settings</h2>
          <p className="text-ink-500 dark:text-ink-400">Configure your platform settings and feature flags</p>
        </div>
        <button
          onClick={handleSave}
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

      {/* Settings Sections */}
      <div className="space-y-4">
        {sections.map((section) => {
          const Icon = section.icon;
          const isExpanded = expandedSection === section.id;
          
          return (
            <div key={section.id} className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-ink-50 dark:hover:bg-ink-950"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-ink-100 dark:bg-ink-800 rounded-lg">
                    <Icon className="w-5 h-5 text-ink-600 dark:text-ink-300" />
                  </div>
                  <div className="text-start">
                    <p className="font-medium text-ink-900 dark:text-ink-50">{section.title}</p>
                    <p className="text-sm text-ink-500 dark:text-ink-400">{section.description}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-ink-400 dark:text-ink-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-ink-400 dark:text-ink-500" />
                )}
              </button>

              {isExpanded && (
                <div className="p-4 border-t border-ink-200 dark:border-ink-800 space-y-4">
                  {section.settings.map((setting) => (
                    <div key={setting.id} className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium text-ink-900 dark:text-ink-50">{setting.label}</p>
                        <p className="text-sm text-ink-500 dark:text-ink-400">{setting.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {setting.requiresRestart && (
                          <span className="text-xs text-orange-800 bg-orange-100 px-2 py-0.5 rounded-full dark:bg-orange-500/15 dark:text-orange-300">
                            Requires restart
                          </span>
                        )}
                        {setting.type === "toggle" && (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={Boolean(setting.value)}
                            aria-label={setting.label}
                            onClick={() => handleSettingChange(section.id, setting.id, !setting.value)}
                            className={cn(
                              "relative w-11 h-6 rounded-full transition-colors",
                              setting.value ? "bg-blue-600" : "bg-ink-200 dark:bg-ink-800"
                            )}
                          >
                            <span className={cn(
                              "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform",
                              Boolean(setting.value) && "translate-x-5"
                            )} />
                          </button>
                        )}
                        {setting.type === "text" && (
                          <input
                            type="text"
                            value={setting.value as string}
                            onChange={(e) => handleSettingChange(section.id, setting.id, e.target.value)}
                            className="w-64 px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {setting.type === "number" && (
                          <input
                            type="number"
                            value={setting.value as number}
                            onChange={(e) => handleSettingChange(section.id, setting.id, Number(e.target.value))}
                            className="w-32 px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {setting.type === "select" && (
                          <select
                            value={setting.value as string}
                            onChange={(e) => handleSettingChange(section.id, setting.id, e.target.value)}
                            className="w-48 px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {setting.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        )}
                        {setting.type === "textarea" && (
                          <textarea
                            value={setting.value as string}
                            onChange={(e) => handleSettingChange(section.id, setting.id, e.target.value)}
                            rows={3}
                            className="w-80 px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
