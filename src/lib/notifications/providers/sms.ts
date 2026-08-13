import { smsProviderName, type SmsProviderName } from "../config";
import { renderSmsText } from "../templates";
import { normalizePhone, type ChannelPayload, type DispatchResult, type NotificationChannel } from "../types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * SMS CHANNEL
 * ────────────────────────────────────────────────────────────────────────────
 * Providers (NOTIFY_SMS_PROVIDER):
 *   console → structured dev log (always available, no deps)
 *   twilio  → Twilio SMS API (dynamically imported — install via `npm i twilio`)
 *
 * Like the other channels the SDK import is lazy and failure-tolerant: if the
 * package isn't installed or the credentials are missing, the channel reports a
 * non-throwing error instead of crashing the action that triggered the
 * notification. A recipient without a phone number is a benign no-op (nothing
 * to send, nothing broken).
 * ────────────────────────────────────────────────────────────────────────────
 */

class ConsoleSmsChannel implements NotificationChannel {
  readonly id = "sms";
  readonly provider = "console";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    const to = payload.recipient?.phone;
    if (!to) {
      console.info("[notify:sms:console] recipient has no phone — skipped");
      return { channel: "sms", ok: true, provider: "console" };
    }
    const text = renderSmsText(payload, payload.recipient?.locale ?? "en");
    console.log(`\n💬 [notify:sms:console] → ${to}\n   Text: ${text}`);
    return { channel: "sms", ok: true, provider: "console" };
  }
}

class TwilioSmsChannel implements NotificationChannel {
  readonly id = "sms";
  readonly provider = "twilio";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      const to = normalizePhone(payload.recipient?.phone);
      if (!to) throw new Error("recipient has no phone number");

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const from = process.env.TWILIO_FROM;
      if (!accountSid || !authToken || !from) {
        throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM not configured");
      }

      // Lazy import keeps the bundle dependency-free until Twilio is configured.
      const mod = await import(/* webpackIgnore: true */ "twilio");
      const Twilio = mod.default ?? mod;
      const client = new Twilio(accountSid, authToken);
      await client.messages.create({
        from,
        to,
        body: renderSmsText(payload, payload.recipient?.locale ?? "en"),
      });
      return { channel: "sms", ok: true, provider: "twilio" };
    } catch (err) {
      return {
        channel: "sms",
        ok: false,
        provider: "twilio",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createSmsChannel(name: SmsProviderName = smsProviderName()): NotificationChannel {
  return name === "twilio" ? new TwilioSmsChannel() : new ConsoleSmsChannel();
}
