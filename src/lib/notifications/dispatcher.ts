import { isEmailEnabled, isPushEnabled, isSmsEnabled, isWhatsAppEnabled } from "./config";
import { createEmailChannel } from "./providers/email";
import { createPushChannel } from "./providers/push";
import { createSmsChannel } from "./providers/sms";
import { createWhatsAppChannel } from "./providers/whatsapp";
import type { ChannelPayload, DispatchResult, NotificationChannel } from "./types";
import { sendEmergencySmsFallback } from "./emergency-sms-fallback";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * DISPATCHER
 * ────────────────────────────────────────────────────────────────────────────
 * The single outbound seam. `dispatch()` fans a ChannelPayload out to every
 * enabled channel (email, sms, push, whatsapp by default) and ALWAYS resolves —
 * a failing provider reports its error in the result instead of throwing, so
 * the server action that triggered the notification never 500s.
 *
 * Usage (called by src/lib/data/notifications.ts → pushNotification):
 *   void dispatch({ ...notificationRecord, recipient }).catch(console.error)
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Channels currently enabled (email → sms → push → whatsapp) — memoized per process. */
let enabledChannels: NotificationChannel[] | null = null;

export function getEnabledChannels(): NotificationChannel[] {
  if (enabledChannels) return enabledChannels;
  const channels: NotificationChannel[] = [];
  if (isEmailEnabled()) channels.push(createEmailChannel());
  if (isSmsEnabled()) channels.push(createSmsChannel());
  if (isPushEnabled()) channels.push(createPushChannel());
  if (isWhatsAppEnabled()) channels.push(createWhatsAppChannel());
  enabledChannels = channels;
  return channels;
}

/** Reset the memoized channel list (used by tests to re-read env). */
export function resetChannels(): void {
  enabledChannels = null;
}

/**
 * Dispatch a payload to all enabled channels. Resolves with one DispatchResult
 * per channel; never rejects.
 */
export async function dispatch(payload: ChannelPayload): Promise<DispatchResult[]> {
  const channels = getEnabledChannels();
  if (channels.length === 0) return [];

  const settled = await Promise.allSettled(channels.map((c) => c.send(payload)));
  const results = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          channel: channels[i].id,
          ok: false,
          provider: channels[i].provider,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        }
  );

  // Emergency SMS fallback: if push failed for an emergency booking,
  // send an SMS to ensure the worker receives the urgent alert
  if (payload.recipient?.phone) {
    const smsFallback = await sendEmergencySmsFallback(payload, payload.recipient, results);
    if (smsFallback) {
      results.push(smsFallback);
    }
  }

  // Delivery-ledger seam: every WhatsApp attempt (any provider) lands in the
  // audit ledger via the recorder registered by src/lib/data/notifications.ts.
  const whatsappResult = results.find((r) => r.channel === "whatsapp");
  if (whatsappResult) recordWhatsAppSend(payload, whatsappResult);

  return results;
}

/* ─────────────────── WhatsApp delivery ledger recording ─────────────────── */

/**
 * Called by the dispatcher after every WhatsApp send (both the fan-out
 * `dispatch()` and the direct `dispatchWhatsApp()`). The DATA layer registers
 * the actual recorder at composition time — keeping this module free of data
 * imports (and import cycles). Errors in recording must never break sending.
 */
export type WhatsAppDeliveryRecorder = (payload: ChannelPayload, result: DispatchResult) => void;

let whatsappDeliveryRecorder: WhatsAppDeliveryRecorder | null = null;

export function setWhatsAppDeliveryRecorder(recorder: WhatsAppDeliveryRecorder | null): void {
  whatsappDeliveryRecorder = recorder;
}

function recordWhatsAppSend(payload: ChannelPayload, result: DispatchResult): void {
  if (!whatsappDeliveryRecorder) return;
  try {
    whatsappDeliveryRecorder(payload, result);
  } catch (err) {
    console.error("[notify:whatsapp] delivery ledger recording failed", err);
  }
}

/** Dispatch only the WhatsApp channel for admin-directed outreach. */
export async function dispatchWhatsApp(
  payload: ChannelPayload,
  options: { skipRecord?: boolean } = {}
): Promise<DispatchResult> {
  const channel = createWhatsAppChannel();
  let result: DispatchResult;
  try {
    result = await channel.send(payload);
  } catch (error) {
    result = {
      channel: channel.id,
      ok: false,
      provider: channel.provider,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  if (!options.skipRecord) recordWhatsAppSend(payload, result);
  return result;
}
