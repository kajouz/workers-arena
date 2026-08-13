import { whatsappProviderName, type WhatsAppProviderName } from "../config";
import { renderWhatsAppText } from "../templates";
import { normalizePhone, type ChannelPayload, type DispatchResult, type NotificationChannel } from "../types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHATSAPP CHANNEL
 * ────────────────────────────────────────────────────────────────────────────
 * Providers (NOTIFY_WHATSAPP_PROVIDER):
 *   console         → structured dev log (always available, no deps)
 *   whatsapp-cloud  → Meta WhatsApp Cloud API (official Graph API) via fetch —
 *                     no SDK to install. Requires WHATSAPP_TOKEN (a system-user
 *                     access token) and WHATSAPP_PHONE_NUMBER_ID (your business
 *                     phone number ID). Numbers are sent in E.164 without a
 *                     "whatsapp:" prefix.
 *
 * Missing credentials report a non-throwing error (same as the other channels);
 * a recipient without a phone number is a benign no-op.
 * ────────────────────────────────────────────────────────────────────────────
 */

const GRAPH_VERSION = "v21.0";

class ConsoleWhatsAppChannel implements NotificationChannel {
  readonly id = "whatsapp";
  readonly provider = "console";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    const to = payload.recipient?.phone;
    if (!to) {
      console.info("[notify:whatsapp:console] recipient has no phone — skipped");
      return { channel: "whatsapp", ok: true, provider: "console" };
    }
    const text = renderWhatsAppText(payload, payload.recipient?.locale ?? "en");
    console.log(`\n🟢 [notify:whatsapp:console] → ${to}\n   Message: ${text.replace(/\n/g, "\n            ")}`);
    return { channel: "whatsapp", ok: true, provider: "console" };
  }
}

class WhatsAppCloudChannel implements NotificationChannel {
  readonly id = "whatsapp";
  readonly provider = "whatsapp-cloud";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      const to = normalizePhone(payload.recipient?.phone);
      if (!to) throw new Error("recipient has no phone number");

      const token = process.env.WHATSAPP_TOKEN;
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
      if (!token || !phoneNumberId) {
        throw new Error("WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured");
      }

      const body = renderWhatsAppText(payload, payload.recipient?.locale ?? "en");
      const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body, preview_url: true },
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`WhatsApp Cloud API ${res.status}: ${detail.slice(0, 200)}`);
      }
      return { channel: "whatsapp", ok: true, provider: "whatsapp-cloud" };
    } catch (err) {
      return {
        channel: "whatsapp",
        ok: false,
        provider: "whatsapp-cloud",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createWhatsAppChannel(name: WhatsAppProviderName = whatsappProviderName()): NotificationChannel {
  return name === "whatsapp-cloud" ? new WhatsAppCloudChannel() : new ConsoleWhatsAppChannel();
}
