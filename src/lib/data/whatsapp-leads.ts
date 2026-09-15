/**
 * ────────────────────────────────────────────────────────────────────────────
 * WhatsApp Lead Notifications — admin-initiated worker outreach
 * ────────────────────────────────────────────────────────────────────────────
 * Instead of automated email notifications, admins send personalized
 * WhatsApp messages to workers about new lead offers. The system:
 *
 *   1. Generates a pre-filled wa.me deep link with the lead details
 *   2. Logs the notification in the activity feed
 *   3. Tracks which workers were notified (dedup guard)
 *
 * wa.me links open WhatsApp on the worker's phone with the message
 * pre-filled — one tap to send. No API keys needed.
 */

import type { LeadGrade, LeadOffer } from "./lead-market";
import { leadGradeLabel } from "./lead-notifications";

/* ─────────────────────────────────── Input ─────────────────────────────────── */

export interface WhatsAppLeadMessage {
  /** Worker's phone number (E.166 format, e.g. "+96170123456"). */
  workerPhone: string;
  /** Worker's name for personalization. */
  workerName: string;
  /** The lead offer details. */
  offer: Pick<LeadOffer, "leadNumber" | "grade" | "priceCredits" | "matchScore">;
  /** The admin's name (sender). */
  adminName: string;
  /** Optional custom message appended after the template. */
  customMessage?: string;
}

export interface WhatsAppLeadLink {
  /** The full wa.me URL with pre-filled message. */
  url: string;
  /** The pre-filled message text (for logging/display). */
  message: string;
  /** The phone number (E.166). */
  phone: string;
}

/* ─────────────────────────────────── Engine ─────────────────────────────────── */

/**
 * Build the bilingual WhatsApp message for a lead offer. Pure.
 */
export function buildLeadOfferMessage(
  input: WhatsAppLeadMessage,
  locale: "en" | "ar" = "en"
): string {
  const { offer, workerName, adminName, customMessage } = input;
  const grade = leadGradeLabel(offer.grade, locale);

  if (locale === "ar") {
    const parts = [
      `مرحباً ${workerName} 👋`,
      ``,
      `لديك عميل محتمل جديد من 类型 ${grade}:`,
      `• الرقم: ${offer.leadNumber}`,
      `• الدرجة: ${grade}`,
      `• نقاط المطابقة: ${offer.matchScore}/100`,
      `• التكلفة: ${offer.priceCredits} رصيد`,
      ``,
      `افتح اللوحة لشراء هذا العميل قبل انتهاء المدة.`,
      `https://workers-arena.vercel.app/dashboard/leads`,
    ];
    if (customMessage) parts.push(``, customMessage);
    parts.push(``, `— ${adminName}, فريق WorkersArena`);
    return parts.join("\n");
  }

  const parts = [
    `Hi ${workerName} 👋`,
    ``,
    `You have a new ${grade} lead offer:`,
    `• Lead: ${offer.leadNumber}`,
    `• Grade: ${grade}`,
    `• Match score: ${offer.matchScore}/100`,
    `• Cost: ${offer.priceCredits} credits`,
    ``,
    `Open your board to buy this lead before it expires:`,
    `https://workers-arena.vercel.app/dashboard/leads`,
  ];
  if (customMessage) parts.push(``, customMessage);
  parts.push(``, `— ${adminName}, WorkersArena Team`);
  return parts.join("\n");
}

/**
 * Generate a wa.me deep link with the pre-filled message. Pure.
 *
 * wa.me format: https://wa.me/<phone>?text=<encoded-message>
 * Phone must be in E.166 format without + or spaces.
 */
export function generateWhatsAppLink(
  phone: string,
  message: string
): WhatsAppLeadLink {
  // Normalize: remove +, spaces, dashes
  const normalized = phone.replace(/[^0-9]/g, "");
  const encoded = encodeURIComponent(message);
  return {
    url: `https://wa.me/${normalized}?text=${encoded}`,
    message,
    phone: normalized,
  };
}

/**
 * Build a complete WhatsApp lead notification: message + link. Pure.
 */
export function buildWhatsAppLeadNotification(
  input: WhatsAppLeadMessage,
  locale: "en" | "ar" = "en"
): WhatsAppLeadLink {
  const message = buildLeadOfferMessage(input, locale);
  return generateWhatsAppLink(input.workerPhone, message);
}

/**
 * Build a batch notification for multiple workers on the same lead. Pure.
 */
export function buildBatchWhatsAppNotifications(
  workers: Array<{ phone: string; name: string }>,
  offer: WhatsAppLeadMessage["offer"],
  adminName: string,
  locale: "en" | "ar" = "en"
): Array<WhatsAppLeadMessage & { link: WhatsAppLeadLink }> {
  return workers.map((w) => {
    const msg: WhatsAppLeadMessage = {
      workerPhone: w.phone,
      workerName: w.name,
      offer,
      adminName,
    };
    return {
      ...msg,
      link: buildWhatsAppLeadNotification(msg, locale),
    };
  });
}
