/**
 * Platform settings — the single definition of every admin-editable setting:
 * section, label, input type, allowed options and default. Pure data, so the
 * admin UI renders from it and the server validates against it.
 */

export type PlatformSettingType = "toggle" | "text" | "number" | "select" | "textarea";
export type PlatformSettingValue = string | number | boolean;
export type PlatformSettingValues = Record<string, PlatformSettingValue>;

export interface PlatformSettingDef {
  id: string;
  label: string;
  description: string;
  type: PlatformSettingType;
  default: PlatformSettingValue;
  options?: { label: string; value: string }[];
  /** Lower bound for number settings (all current ones are counts or rates). */
  min?: number;
  requiresRestart?: boolean;
}

export interface PlatformSettingSection {
  id: string;
  title: string;
  description: string;
  settings: PlatformSettingDef[];
}

export const PLATFORM_SETTING_SECTIONS: PlatformSettingSection[] = [
  {
    id: "general",
    title: "General Settings",
    description: "Basic platform configuration",
    settings: [
      { id: "site_name", label: "Site Name", description: "Your platform name", type: "text", default: "WorkersArena" },
      { id: "site_url", label: "Site URL", description: "Your platform URL", type: "text", default: "https://workers-arena.vercel.app" },
      { id: "maintenance_mode", label: "Maintenance Mode", description: "Enable to show maintenance page", type: "toggle", default: false, requiresRestart: true },
      { id: "registration_enabled", label: "Allow New Registrations", description: "Allow new users to register", type: "toggle", default: true },
      { id: "default_language", label: "Default Language", description: "Default language for new users", type: "select", default: "en", options: [{ label: "English", value: "en" }, { label: "Arabic", value: "ar" }] },
    ],
  },
  {
    id: "features",
    title: "Feature Flags",
    description: "Enable or disable platform features",
    settings: [
      { id: "enable_chat", label: "Real-time Chat", description: "Enable chat between workers and customers", type: "toggle", default: true },
      { id: "enable_payments", label: "Online Payments", description: "Enable Stripe/online payment processing", type: "toggle", default: true },
      { id: "enable_manual_payments", label: "Manual Payments (OMT/Whish)", description: "Enable Lebanon manual payment methods", type: "toggle", default: true },
      { id: "enable_push_notifications", label: "Push Notifications", description: "Enable browser push notifications", type: "toggle", default: true },
      { id: "enable_whatsapp", label: "WhatsApp Integration", description: "Show WhatsApp contact buttons", type: "toggle", default: true },
      { id: "enable_analytics", label: "Analytics Tracking", description: "Enable Vercel Analytics", type: "toggle", default: true },
      { id: "enable_sentry", label: "Error Tracking (Sentry)", description: "Enable Sentry error monitoring", type: "toggle", default: true },
      { id: "enable_ab_testing", label: "A/B Testing", description: "Enable A/B testing framework", type: "toggle", default: false },
    ],
  },
  {
    id: "email",
    title: "Email Settings",
    description: "Email delivery configuration",
    settings: [
      { id: "email_provider", label: "Email Provider", description: "Select email delivery provider", type: "select", default: "resend", options: [{ label: "Resend", value: "resend" }, { label: "SendGrid", value: "sendgrid" }, { label: "AWS SES", value: "ses" }] },
      { id: "from_name", label: "From Name", description: "Name shown in email sender", type: "text", default: "WorkersArena" },
      { id: "from_email", label: "From Email", description: "Email address shown as sender", type: "text", default: "noreply@workersarena.com" },
      { id: "enable_welcome_email", label: "Welcome Email", description: "Send welcome email on registration", type: "toggle", default: true },
      { id: "enable_booking_emails", label: "Booking Notifications", description: "Send email notifications for bookings", type: "toggle", default: true },
      { id: "enable_weekly_digest", label: "Weekly Digest", description: "Send weekly summary emails", type: "toggle", default: true },
    ],
  },
  {
    id: "payments",
    title: "Payment Settings",
    description: "Payment processing configuration",
    settings: [
      { id: "currency", label: "Default Currency", description: "Primary currency for transactions (tenant lb — USD only)", type: "select", default: "USD", options: [{ label: "USD", value: "USD" }] },
      { id: "platform_fee_rate", label: "Platform Fee Rate (%)", description: "Percentage fee on completed bookings", type: "number", default: 10, min: 0 },
      { id: "min_booking_amount", label: "Minimum Booking Amount", description: "Minimum amount for a booking", type: "number", default: 10, min: 0 },
      { id: "enable_stripe", label: "Enable Stripe", description: "Enable Stripe payment processing", type: "toggle", default: true },
      { id: "enable_omt", label: "Enable OMT", description: "Enable OMT manual payments", type: "toggle", default: true },
      { id: "enable_whish", label: "Enable Whish", description: "Enable Whish manual payments", type: "toggle", default: true },
    ],
  },
  {
    id: "notifications",
    title: "Notification Settings",
    description: "Push notification configuration",
    settings: [
      { id: "push_enabled", label: "Push Notifications Enabled", description: "Enable browser push notifications", type: "toggle", default: true },
      { id: "booking_reminders", label: "Booking Reminders", description: "Send reminders before bookings", type: "toggle", default: true },
      { id: "reminder_hours", label: "Reminder Hours Before", description: "Hours before booking to send reminder", type: "number", default: 24, min: 0 },
      { id: "enable_sms", label: "SMS Notifications", description: "Enable SMS notifications via Twilio", type: "toggle", default: false },
    ],
  },
  {
    id: "security",
    title: "Security Settings",
    description: "Platform security configuration",
    settings: [
      { id: "require_email_verification", label: "Require Email Verification", description: "Require email verification on registration", type: "toggle", default: true },
      { id: "enable_2fa", label: "Enable 2FA", description: "Allow users to enable two-factor authentication", type: "toggle", default: true },
      { id: "max_login_attempts", label: "Max Login Attempts", description: "Max failed login attempts before lockout", type: "number", default: 5, min: 1 },
      { id: "lockout_duration", label: "Lockout Duration (minutes)", description: "Account lockout duration", type: "number", default: 15, min: 0 },
      { id: "session_timeout", label: "Session Timeout (minutes)", description: "Inactive session timeout", type: "number", default: 60, min: 1 },
    ],
  },
  {
    id: "seo",
    title: "SEO Settings",
    description: "Search engine optimization",
    settings: [
      { id: "meta_title", label: "Meta Title", description: "Default page title for SEO", type: "text", default: "WorkersArena - Find Trusted Workers" },
      { id: "meta_description", label: "Meta Description", description: "Default meta description", type: "textarea", default: "Find trusted workers for all your home services needs in Lebanon and Saudi Arabia." },
      { id: "enable_sitemap", label: "Auto-generate Sitemap", description: "Automatically generate sitemap.xml", type: "toggle", default: true },
      { id: "enable_robots", label: "Enable robots.txt", description: "Allow search engine crawling", type: "toggle", default: true },
    ],
  },
  {
    id: "database",
    title: "Database Settings",
    description: "Database configuration and backups",
    settings: [
      { id: "db_provider", label: "Database Provider", description: "Current database provider", type: "text", default: "Layerbase PostgreSQL", requiresRestart: true },
      { id: "backup_enabled", label: "Automatic Backups", description: "Enable daily automatic backups", type: "toggle", default: true },
      { id: "backup_retention", label: "Backup Retention (days)", description: "Number of days to keep backups", type: "number", default: 30, min: 1 },
    ],
  },
];

const DEFS: ReadonlyMap<string, PlatformSettingDef> = new Map(
  PLATFORM_SETTING_SECTIONS.flatMap((s) => s.settings.map((d) => [d.id, d] as const))
);

/** Text inputs are single-line labels/URLs/addresses; textareas hold short copy. */
const MAX_TEXT = 200;
const MAX_TEXTAREA = 1000;

export function defaultPlatformSettings(): PlatformSettingValues {
  return Object.fromEntries([...DEFS.values()].map((d) => [d.id, d.default]));
}

/** Why a value was rejected, or null if it's valid for its setting. */
export function validatePlatformSetting(id: string, value: unknown): string | null {
  const def = DEFS.get(id);
  if (!def) return `unknown setting "${id}"`;
  switch (def.type) {
    case "toggle":
      return typeof value === "boolean" ? null : `${id} must be true or false`;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return `${id} must be a number`;
      if (def.min != null && value < def.min) return `${id} must be at least ${def.min}`;
      return null;
    case "select":
      return typeof value === "string" && def.options?.some((o) => o.value === value)
        ? null
        : `${id} must be one of ${def.options?.map((o) => o.value).join(", ")}`;
    case "text":
    case "textarea": {
      if (typeof value !== "string") return `${id} must be text`;
      const max = def.type === "text" ? MAX_TEXT : MAX_TEXTAREA;
      return value.length > max ? `${id} must be at most ${max} characters` : null;
    }
  }
}

/**
 * Stored values over the defaults. Keys no longer defined are dropped and
 * stored values that no longer validate fall back to the default, so a
 * renamed or retyped setting can't surface a stale value.
 */
export function mergeWithDefaults(stored: unknown): PlatformSettingValues {
  const merged = defaultPlatformSettings();
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [id, value] of Object.entries(stored as Record<string, unknown>)) {
      if (validatePlatformSetting(id, value) === null) merged[id] = value as PlatformSettingValue;
    }
  }
  return merged;
}
