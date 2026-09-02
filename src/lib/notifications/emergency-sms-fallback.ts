/**
 * ────────────────────────────────────────────────────────────────────────────
 * EMERGENCY SMS FALLBACK
 * ────────────────────────────────────────────────────────────────────────────
 * When a booking is marked as emergency (isEmergency = true), the system
 * attempts push notification first. If push fails or is unavailable, it
 * falls back to SMS to ensure the worker receives the emergency alert
 * immediately.
 *
 * Emergency SMS messages are sent regardless of the normal SMS enabled
 * config — if a worker has a phone number and the booking is emergency,
 * the SMS is sent via the Twilio provider (or console in demo mode).
 * ────────────────────────────────────────────────────────────────────────────
 */

import { createSmsChannel } from "./providers/sms";
import { renderSmsText } from "./templates";
import type { ChannelPayload, DispatchResult, NotificationRecipient } from "./types";
import { normalizePhone } from "./types";

/**
 * Emergency-specific SMS templates (bilingual).
 * These are more urgent and action-oriented than regular booking SMS.
 */
function renderEmergencySmsText(
  payload: ChannelPayload,
  locale: "en" | "ar"
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const href = payload.href ? `${baseUrl}${payload.href}` : "";
  const app = "WorkersArena";

  // Check if this is a worker emergency notification
  const isWorkerEmergency =
    payload.type === "bookingRequest" &&
    payload.titleEn.includes("EMERGENCY");

  if (isWorkerEmergency) {
    if (locale === "ar") {
      return [
        `🚨 [${app}] طوارئ — طلب خدمة عاجل`,
        ``,
        `${payload.bodyAr}`,
        ``,
        `📞 رقمك المخفٍ جاهز — اتصل بالعميل فوراً`,
        href ? `🔗 ${href}` : ``,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return [
      `🚨 [${app}] EMERGENCY — Urgent Service Request`,
      ``,
      `${payload.bodyEn}`,
      ``,
      `📞 Your masked number is ready — call the customer NOW`,
      href ? `🔗 ${href}` : ``,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Customer emergency confirmation
  if (locale === "ar") {
    return [
      `✅ [${app}] تم استلام طلب الطوارئ`,
      ``,
      `تم استلام طلب الطوارئ الخاص بك. العامل اختار للتواصل.`,
      `📞 رقمك المخفٍ جاهز للاستعمال.`,
      href ? `🔗 ${href}` : ``,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `✅ [${app}] Emergency Request Received`,
    ``,
    `Your emergency request has been received. A worker has been notified.`,
    `📞 Your masked number is ready for privacy-protected calling.`,
    href ? `🔗 ${href}` : ``,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Send an emergency SMS fallback. This is called when:
 * 1. The booking is marked as emergency (isEmergency = true)
 * 2. Push notification fails or is unavailable
 * 3. The recipient has a phone number
 *
 * Unlike regular SMS (which respects the NOTIFY_SMS_ENABLED config),
 * emergency SMS is sent if the recipient has a phone number — the safety
 * of the emergency takes priority.
 */
export async function sendEmergencySmsFallback(
  payload: ChannelPayload,
  recipient: NotificationRecipient,
  pushResults: DispatchResult[]
): Promise<DispatchResult | null> {
  // Only trigger for emergency bookings
  const isEmergency = payload.titleEn.includes("EMERGENCY") ||
    payload.titleAr.includes("طوارئ") ||
    payload.bodyEn.includes("EMERGENCY") ||
    payload.bodyAr.includes("طوارئ");

  if (!isEmergency) return null;

  // Check if push already succeeded
  const pushResult = pushResults.find((r) => r.channel === "push");
  if (pushResult?.ok) {
    // Push succeeded — no need for SMS fallback
    return null;
  }

  // Check if we have a phone number
  const phone = normalizePhone(recipient.phone);
  if (!phone) {
    console.info("[emergency-sms-fallback] No phone number — cannot send SMS fallback");
    return null;
  }

  // Send emergency SMS regardless of NOTIFY_SMS_ENABLED config
  // Emergency safety takes priority over config settings
  const smsChannel = createSmsChannel();
  const locale = recipient.locale ?? "en";

  // Override the SMS text with emergency-specific template
  const emergencyPayload: ChannelPayload = {
    ...payload,
    // Use emergency-specific title/body for SMS
    titleEn: "🚨 EMERGENCY — Urgent Service Request",
    titleAr: "🚨 طوارئ — طلب خدمة عاجل",
  };

  try {
    // Create a custom SMS send with emergency template
    const emergencySmsText = renderEmergencySmsText(emergencyPayload, locale);

    // For console provider, just log it
    if (smsChannel.provider === "console") {
      console.log(`\n🚨 [emergency-sms-fallback] → ${phone}\n   Text: ${emergencySmsText}`);
      return {
        channel: "sms",
        ok: true,
        provider: "console-emergency",
      };
    }

    // For Twilio, use the SDK directly with emergency template
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;

    if (!accountSid || !authToken || !from) {
      throw new Error("Twilio credentials not configured for emergency SMS");
    }

    const mod = await import(/* webpackIgnore: true */ "twilio");
    const Twilio = mod.default ?? mod;
    const client = new Twilio(accountSid, authToken);
    await client.messages.create({
      from,
      to: phone,
      body: emergencySmsText,
    });

    return {
      channel: "sms",
      ok: true,
      provider: "twilio-emergency",
    };
  } catch (err) {
    console.error("[emergency-sms-fallback] SMS send failed:", err);
    return {
      channel: "sms",
      ok: false,
      provider: "twilio-emergency",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if an emergency SMS should be sent based on push results.
 * Returns true if push failed or wasn't attempted.
 */
export function shouldSendEmergencySms(pushResults: DispatchResult[]): boolean {
  const pushResult = pushResults.find((r) => r.channel === "push");
  return !pushResult || !pushResult.ok;
}
