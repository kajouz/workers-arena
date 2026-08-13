import { isEmailEnabled, isPushEnabled, isSmsEnabled, isWhatsAppEnabled } from "./config";
import { createEmailChannel } from "./providers/email";
import { createPushChannel } from "./providers/push";
import { createSmsChannel } from "./providers/sms";
import { createWhatsAppChannel } from "./providers/whatsapp";
import type { ChannelPayload, DispatchResult, NotificationChannel } from "./types";

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
  return settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          channel: channels[i].id,
          ok: false,
          provider: channels[i].provider,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        }
  );
}
