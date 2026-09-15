/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD NOTIFICATIONS DISPATCH — email + SMS channels for lead offers
 * ────────────────────────────────────────────────────────────────────────────
 * Uses the existing notification infrastructure (src/lib/notifications/) to
 * send lead offer notifications via email and SMS. The WhatsApp channel is
 * handled separately (wa.me deep links). This module dispatches through the
 * unified notification system so email/SMS providers (SMTP, Resend, Twilio)
 * are used when configured.
 *
 * Flow:
 *   1. Admin clicks "Notify" on a lead offer
 *   2. This module builds the notification payload per channel
 *   3. Dispatches through the existing notification dispatcher
 *   4. Logs the activity
 */

import type { LeadGrade, LeadOffer, EmailTemplates, SmsTemplates, NotificationChannelConfig } from "./lead-market";
import { DEFAULT_EMAIL_TEMPLATES, DEFAULT_SMS_TEMPLATES } from "./lead-market";
import { leadGradeLabel } from "./lead-notifications";
import type { Notification } from "@/lib/data/types";
import { dispatch } from "@/lib/notifications/dispatcher";
import type { ChannelPayload, NotificationRecipient } from "@/lib/notifications/types";

/* ─────────────────────────────────── Input ─────────────────────────────────── */

export interface LeadDispatchInput {
  /** Worker details. */
  workerName: string;
  workerPhone?: string;
  workerEmail?: string;
  workerLocale?: "en" | "ar";
  /** The lead offer details. */
  offer: Pick<LeadOffer, "leadNumber" | "grade" | "priceCredits" | "matchScore">;
  /** The admin's name (sender). */
  adminName: string;
  /** Admin-configured templates (falls back to defaults). */
  emailTemplates?: EmailTemplates;
  smsTemplates?: SmsTemplates;
  /** Which channels to actually send to. */
  channels?: NotificationChannelConfig;
}

/* ─────────────────────────────────── Engine ─────────────────────────────────── */

/** Replace placeholders in a template string. Pure. */
function replacePlaceholders(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

/** Build the placeholder variables for a lead offer. Pure. */
function leadVars(input: LeadDispatchInput, locale: "en" | "ar"): Record<string, string> {
  const boardUrl = "https://workers-arena.vercel.app/dashboard/leads";
  return {
    workerName: input.workerName,
    grade: leadGradeLabel(input.offer.grade, locale),
    leadNumber: input.offer.leadNumber,
    matchScore: String(input.offer.matchScore),
    priceCredits: String(input.offer.priceCredits),
    boardUrl,
    adminName: input.adminName,
  };
}

/** Build the email notification payload for a lead offer. Pure. */
export function buildLeadEmailPayload(
  input: LeadDispatchInput,
  locale: "en" | "ar" = "en"
): ChannelPayload & { recipient: NotificationRecipient } {
  const templates = input.emailTemplates ?? DEFAULT_EMAIL_TEMPLATES;
  const template = templates[locale]?.[input.offer.grade] ?? templates.en[input.offer.grade] ?? templates.en.bronze;
  const vars = leadVars(input, locale);
  const boardUrl = vars.boardUrl;

  return {
    id: `lead-email-${input.offer.leadNumber}-${locale}`,
    type: "lead_offer" as Notification["type"],
    titleEn: replacePlaceholders(template.subject, vars),
    titleAr: replacePlaceholders(template.subject, vars),
    bodyEn: replacePlaceholders(template.body, vars),
    bodyAr: replacePlaceholders(template.body, vars),
    href: boardUrl,
    time: new Date().toISOString(),
    recipient: {
      name: input.workerName,
      email: input.workerEmail,
      phone: input.workerPhone,
      locale,
    },
  };
}

/** Build the SMS notification payload for a lead offer. Pure. */
export function buildLeadSmsPayload(
  input: LeadDispatchInput,
  locale: "en" | "ar" = "en"
): ChannelPayload & { recipient: NotificationRecipient } {
  const templates = input.smsTemplates ?? DEFAULT_SMS_TEMPLATES;
  const template = templates[locale]?.[input.offer.grade] ?? templates.en[input.offer.grade] ?? templates.en.bronze;
  const vars = leadVars(input, locale);
  const boardUrl = vars.boardUrl;

  return {
    id: `lead-sms-${input.offer.leadNumber}-${locale}`,
    type: "lead_offer" as Notification["type"],
    titleEn: replacePlaceholders(template, vars),
    titleAr: replacePlaceholders(template, vars),
    bodyEn: replacePlaceholders(template, vars),
    bodyAr: replacePlaceholders(template, vars),
    href: boardUrl,
    time: new Date().toISOString(),
    recipient: {
      name: input.workerName,
      email: input.workerEmail,
      phone: input.workerPhone,
      locale,
    },
  };
}

/**
 * Dispatch lead notification to all enabled channels (email + SMS).
 * WhatsApp is handled separately via wa.me deep links.
 * Returns dispatch results per channel.
 */
export async function dispatchLeadNotification(
  input: LeadDispatchInput
): Promise<Array<{ channel: string; ok: boolean; provider: string; error?: string }>> {
  const locale = input.workerLocale ?? "en";
  const channels = input.channels ?? { whatsapp: true, email: true, sms: false };
  const results: Array<{ channel: string; ok: boolean; provider: string; error?: string }> = [];

  // Email channel
  if (channels.email && input.workerEmail) {
    const emailPayload = buildLeadEmailPayload(input, locale);
    const emailResults = await dispatch(emailPayload);
    results.push(...emailResults);
  }

  // SMS channel
  if (channels.sms && input.workerPhone) {
    const smsPayload = buildLeadSmsPayload(input, locale);
    const smsResults = await dispatch(smsPayload);
    results.push(...smsResults);
  }

  return results;
}