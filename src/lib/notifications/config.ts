/**
 * ────────────────────────────────────────────────────────────────────────────
 * CHANNEL CONFIGURATION (env-driven)
 * ────────────────────────────────────────────────────────────────────────────
 *   NOTIFY_EMAIL_ENABLED   "true" | "false"   (default: on in demo mode, off in prod)
 *   NOTIFY_EMAIL_PROVIDER  "console" | "smtp" | "resend"   (default: "console")
 *   NOTIFY_SMTP_HOST       SMTP server / credentials
 *   NOTIFY_SMTP_PORT       default 587
 *   NOTIFY_SMTP_USER / NOTIFY_SMTP_PASS
 *   NOTIFY_MAIL_FROM       sender address, default "WorkersArena <no-reply@workersarena.com>"
 *   RESEND_API_KEY         Resend REST API key (when provider = "resend")
 *   NOTIFY_PUSH_ENABLED    "true" | "false"   (default: on in demo mode, off in prod)
 *   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
 *   NOTIFY_SMS_ENABLED     "true" | "false"   (default: on in demo mode, off in prod)
 *   NOTIFY_SMS_PROVIDER    "console" | "twilio"   (default: "console")
 *   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM   (when provider = "twilio")
 *   NOTIFY_WHATSAPP_ENABLED  "true" | "false"  (default: on in demo mode, off in prod)
 *   NOTIFY_WHATSAPP_PROVIDER "console" | "whatsapp-cloud"  (default: "console")
 *   WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID   (when provider = "whatsapp-cloud")
 *   NEXT_PUBLIC_APP_URL    base URL for email CTA links
 * ────────────────────────────────────────────────────────────────────────────
 * Safety: outbound sending is OFF by default in production until explicitly
 * enabled with real credentials. In demo mode the console providers log every
 * dispatch so the flows are observable without any external dependency.
 * ────────────────────────────────────────────────────────────────────────────
 */

export const isDemoMode = process.env.DEMO_MODE !== "false";

export function isEmailEnabled(): boolean {
  if (process.env.NOTIFY_EMAIL_ENABLED) return process.env.NOTIFY_EMAIL_ENABLED !== "false";
  return isDemoMode;
}

export type EmailProviderName = "console" | "smtp" | "resend";

export function emailProviderName(): EmailProviderName {
  const p = process.env.NOTIFY_EMAIL_PROVIDER?.toLowerCase();
  return p === "smtp" || p === "resend" ? p : "console";
}

export function isPushEnabled(): boolean {
  if (process.env.NOTIFY_PUSH_ENABLED) return process.env.NOTIFY_PUSH_ENABLED !== "false";
  return isDemoMode;
}

export type SmsProviderName = "console" | "twilio";

export function smsProviderName(): SmsProviderName {
  const p = process.env.NOTIFY_SMS_PROVIDER?.toLowerCase();
  return p === "twilio" ? p : "console";
}

export function isSmsEnabled(): boolean {
  if (process.env.NOTIFY_SMS_ENABLED) return process.env.NOTIFY_SMS_ENABLED !== "false";
  return isDemoMode;
}

export type WhatsAppProviderName = "console" | "whatsapp-cloud";

export function whatsappProviderName(): WhatsAppProviderName {
  const p = process.env.NOTIFY_WHATSAPP_PROVIDER?.toLowerCase();
  return p === "whatsapp-cloud" ? p : "console";
}

export function isWhatsAppEnabled(): boolean {
  if (process.env.NOTIFY_WHATSAPP_ENABLED) return process.env.NOTIFY_WHATSAPP_ENABLED !== "false";
  return isDemoMode;
}

/** True only when real VAPID keys are configured (enables web-push provider). */
export function hasVapidKeys(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT
  );
}

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
