"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
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

interface SettingSection {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  settings: Setting[];
}

interface Setting {
  id: string;
  label: string;
  description: string;
  type: "toggle" | "text" | "number" | "select" | "textarea";
  value: unknown;
  options?: { label: string; value: string }[];
  requiresRestart?: boolean;
}

export function PlatformSettings() {
  const [sections, setSections] = useState<SettingSection[]>([]);
  const [expandedSection, setExpandedSection] = useState<string | null>("general");
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Mock data
    setSections([
      {
        id: "general",
        title: "General Settings",
        description: "Basic platform configuration",
        icon: Settings,
        settings: [
          { id: "site_name", label: "Site Name", description: "Your platform name", type: "text", value: "WorkersArena" },
          { id: "site_url", label: "Site URL", description: "Your platform URL", type: "text", value: "https://workersarena.com" },
          { id: "maintenance_mode", label: "Maintenance Mode", description: "Enable to show maintenance page", type: "toggle", value: false, requiresRestart: true },
          { id: "registration_enabled", label: "Allow New Registrations", description: "Allow new users to register", type: "toggle", value: true },
          { id: "default_language", label: "Default Language", description: "Default language for new users", type: "select", value: "en", options: [{ label: "English", value: "en" }, { label: "Arabic", value: "ar" }] },
        ],
      },
      {
        id: "features",
        title: "Feature Flags",
        description: "Enable or disable platform features",
        icon: Zap,
        settings: [
          { id: "enable_chat", label: "Real-time Chat", description: "Enable chat between workers and customers", type: "toggle", value: true },
          { id: "enable_payments", label: "Online Payments", description: "Enable Stripe/online payment processing", type: "toggle", value: true },
          { id: "enable_manual_payments", label: "Manual Payments (OMT/Whish)", description: "Enable Lebanon manual payment methods", type: "toggle", value: true },
          { id: "enable_push_notifications", label: "Push Notifications", description: "Enable browser push notifications", type: "toggle", value: true },
          { id: "enable_whatsapp", label: "WhatsApp Integration", description: "Show WhatsApp contact buttons", type: "toggle", value: true },
          { id: "enable_analytics", label: "Analytics Tracking", description: "Enable Vercel Analytics", type: "toggle", value: true },
          { id: "enable_sentry", label: "Error Tracking (Sentry)", description: "Enable Sentry error monitoring", type: "toggle", value: true },
          { id: "enable_ab_testing", label: "A/B Testing", description: "Enable A/B testing framework", type: "toggle", value: false },
        ],
      },
      {
        id: "email",
        title: "Email Settings",
        description: "Email delivery configuration",
        icon: Mail,
        settings: [
          { id: "email_provider", label: "Email Provider", description: "Select email delivery provider", type: "select", value: "resend", options: [{ label: "Resend", value: "resend" }, { label: "SendGrid", value: "sendgrid" }, { label: "AWS SES", value: "ses" }] },
          { id: "from_name", label: "From Name", description: "Name shown in email sender", type: "text", value: "WorkersArena" },
          { id: "from_email", label: "From Email", description: "Email address shown as sender", type: "text", value: "noreply@workersarena.com" },
          { id: "enable_welcome_email", label: "Welcome Email", description: "Send welcome email on registration", type: "toggle", value: true },
          { id: "enable_booking_emails", label: "Booking Notifications", description: "Send email notifications for bookings", type: "toggle", value: true },
          { id: "enable_weekly_digest", label: "Weekly Digest", description: "Send weekly summary emails", type: "toggle", value: true },
        ],
      },
      {
        id: "payments",
        title: "Payment Settings",
        description: "Payment processing configuration",
        icon: CreditCard,
        settings: [
          { id: "currency", label: "Default Currency", description: "Primary currency for transactions", type: "select", value: "USD", options: [{ label: "USD", value: "USD" }, { label: "LBP", value: "LBP" }, { label: "SAR", value: "SAR" }] },
          { id: "platform_fee_rate", label: "Platform Fee Rate (%)", description: "Percentage fee on completed bookings", type: "number", value: 10 },
          { id: "min_booking_amount", label: "Minimum Booking Amount", description: "Minimum amount for a booking", type: "number", value: 10 },
          { id: "enable_stripe", label: "Enable Stripe", description: "Enable Stripe payment processing", type: "toggle", value: true },
          { id: "enable_omt", label: "Enable OMT", description: "Enable OMT manual payments", type: "toggle", value: true },
          { id: "enable_whish", label: "Enable Whish", description: "Enable Whish manual payments", type: "toggle", value: true },
        ],
      },
      {
        id: "notifications",
        title: "Notification Settings",
        description: "Push notification configuration",
        icon: Bell,
        settings: [
          { id: "push_enabled", label: "Push Notifications Enabled", description: "Enable browser push notifications", type: "toggle", value: true },
          { id: "booking_reminders", label: "Booking Reminders", description: "Send reminders before bookings", type: "toggle", value: true },
          { id: "reminder_hours", label: "Reminder Hours Before", description: "Hours before booking to send reminder", type: "number", value: 24 },
          { id: "enable_sms", label: "SMS Notifications", description: "Enable SMS notifications via Twilio", type: "toggle", value: false },
        ],
      },
      {
        id: "security",
        title: "Security Settings",
        description: "Platform security configuration",
        icon: Shield,
        settings: [
          { id: "require_email_verification", label: "Require Email Verification", description: "Require email verification on registration", type: "toggle", value: true },
          { id: "enable_2fa", label: "Enable 2FA", description: "Allow users to enable two-factor authentication", type: "toggle", value: true },
          { id: "max_login_attempts", label: "Max Login Attempts", description: "Max failed login attempts before lockout", type: "number", value: 5 },
          { id: "lockout_duration", label: "Lockout Duration (minutes)", description: "Account lockout duration", type: "number", value: 15 },
          { id: "session_timeout", label: "Session Timeout (minutes)", description: "Inactive session timeout", type: "number", value: 60 },
        ],
      },
      {
        id: "seo",
        title: "SEO Settings",
        description: "Search engine optimization",
        icon: Globe,
        settings: [
          { id: "meta_title", label: "Meta Title", description: "Default page title for SEO", type: "text", value: "WorkersArena - Find Trusted Workers" },
          { id: "meta_description", label: "Meta Description", description: "Default meta description", type: "textarea", value: "Find trusted workers for all your home services needs in Lebanon and Saudi Arabia." },
          { id: "enable_sitemap", label: "Auto-generate Sitemap", description: "Automatically generate sitemap.xml", type: "toggle", value: true },
          { id: "enable_robots", label: "Enable robots.txt", description: "Allow search engine crawling", type: "toggle", value: true },
        ],
      },
      {
        id: "database",
        title: "Database Settings",
        description: "Database configuration and backups",
        icon: Database,
        settings: [
          { id: "db_provider", label: "Database Provider", description: "Current database provider", type: "text", value: "Neon PostgreSQL", requiresRestart: true },
          { id: "backup_enabled", label: "Automatic Backups", description: "Enable daily automatic backups", type: "toggle", value: true },
          { id: "backup_retention", label: "Backup Retention (days)", description: "Number of days to keep backups", type: "number", value: 30 },
        ],
      },
    ]);
  }, []);

  const handleSettingChange = (sectionId: string, settingId: string, value: unknown) => {
    setSections(sections.map((s) =>
      s.id === sectionId
        ? {
            ...s,
            settings: s.settings.map((st) =>
              st.id === settingId ? { ...st, value } : st
            ),
          }
        : s
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setSaving(false);
    setHasChanges(false);
    alert("Settings saved successfully!");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Platform Settings</h2>
          <p className="text-gray-500">Configure your platform settings and feature flags</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
            hasChanges
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
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
            <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Icon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{section.title}</p>
                    <p className="text-sm text-gray-500">{section.description}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {isExpanded && (
                <div className="p-4 border-t border-gray-200 space-y-4">
                  {section.settings.map((setting) => (
                    <div key={setting.id} className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{setting.label}</p>
                        <p className="text-sm text-gray-500">{setting.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {setting.requiresRestart && (
                          <span className="text-xs text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                            Requires restart
                          </span>
                        )}
                        {setting.type === "toggle" && (
                          <button
                            onClick={() => handleSettingChange(section.id, setting.id, !setting.value)}
                            className={cn(
                              "relative w-11 h-6 rounded-full transition-colors",
                              setting.value ? "bg-blue-600" : "bg-gray-200"
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
                            className="w-64 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {setting.type === "number" && (
                          <input
                            type="number"
                            value={setting.value as number}
                            onChange={(e) => handleSettingChange(section.id, setting.id, Number(e.target.value))}
                            className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        {setting.type === "select" && (
                          <select
                            value={setting.value as string}
                            onChange={(e) => handleSettingChange(section.id, setting.id, e.target.value)}
                            className="w-48 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                            className="w-80 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
