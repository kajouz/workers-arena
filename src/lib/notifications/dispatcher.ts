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

  return results;
}
