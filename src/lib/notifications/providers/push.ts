import https from "node:https";
import { hasVapidKeys } from "../config";
import {
  forceRemovePushSubscription,
  getPushSubscription,
  getPushSubscriptions,
  unregisterPushSubscription,
} from "../push-store";
import { renderPushPayload } from "../templates";
import { ACTION_CODES, logAdminActivity } from "@/lib/data/activity";
import type { ChannelPayload, DispatchResult, NotificationChannel } from "../types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * PUSH CHANNEL
 * ────────────────────────────────────────────────────────────────────────────
 * Providers:
 *   console → dev log (no deps)
 *   web-push → Web Push via the web-push SDK (install: `npm i web-push`) using
 *              VAPID keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)
 *              and subscriptions registered via POST /api/push/register.
 *
 * When no browser has registered a subscription the channel reports a benign
 * no-op result instead of an error — nothing to notify, nothing broken.
 *
 * web-push only talks HTTPS push services. For local development against
 * scripts/mock-push-service.cjs (self-signed cert) we allow an insecure agent
 * for LOOPBACK endpoints only — remote endpoints always use the default
 * (cert-validating) agent.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** True for loopback hostnames (localhost, ::1, 127.x.x.x, 0.0.0.0). */
function isLoopback(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h === "::1" || h === "0.0.0.0") return true;
  return /^127\.\d{1,3}(\.\d{1,3}){2}$/.test(h);
}

// Shared agent for the local mock push service (dev/testing only).
const LOOPBACK_AGENT = new https.Agent({ rejectUnauthorized: false });

function agentFor(endpoint: string): https.Agent | undefined {
  try {
    return isLoopback(new URL(endpoint).hostname) ? LOOPBACK_AGENT : undefined;
  } catch {
    return undefined;
  }
}

function logPush(payload: ChannelPayload): DispatchResult {
  // Render the SAME single-language copy the device would receive: the
  // web-push provider renders the payload per recipient locale (title +
  // body via copy()), and the SMS/WhatsApp console channels do the same — so
  // the console push line must never show the EN title/body inside an Arabic
  // dispatch (the titleEn/bodyEn hardcode was the same drift class as the
  // SMS/WhatsApp ones).
  const locale = payload.recipient?.locale ?? "en";
  const title = locale === "ar" ? payload.titleAr : payload.titleEn;
  const body = locale === "ar" ? payload.bodyAr : payload.bodyEn;
  console.log(
    `\n🔔 [notify:push:console] → ${payload.recipient?.name ?? "unknown"}\n` +
      `   Title: ${title}\n` +
      `   Body:  ${body}\n` +
      `   Href:  ${payload.href ?? "—"}`
  );
  return { channel: "push", ok: true, provider: "console" };
}

class ConsolePushChannel implements NotificationChannel {
  readonly id = "push";
  readonly provider = "console";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    return logPush(payload);
  }
}

class WebPushChannel implements NotificationChannel {
  readonly id = "push";
  readonly provider = "web-push";

  async send(payload: ChannelPayload): Promise<DispatchResult> {
    try {
      const subs = await getPushSubscriptions();
      if (subs.length === 0) {
        // Benign no-op: no browser has registered a subscription yet.
        console.info("[notify:push:web-push] no registered subscriptions — skipped");
        return { channel: "push", ok: true, provider: "web-push" };
      }

      const mod = await import(/* webpackIgnore: true */ "web-push");
      const webpush = mod.default ?? mod;
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT!,
        process.env.VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
      );

      const data = renderPushPayload(payload, payload.recipient?.locale ?? "en");
      const results = await Promise.allSettled(
        subs.map((s) => {
          const agent = agentFor(s.endpoint);
          return webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys },
            data,
            { TTL: 60 * 60 * 24, ...(agent ? { agent } : {}) }
          );
        })
      );
      let failed = 0;
      const prune: Promise<unknown>[] = [];
      const pruned: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") return;
        failed += 1;
        // 404/410 means the endpoint is dead (unsubscribed / expired) — prune it
        // so future dispatches don't keep retrying it.
        const code = (r.reason as { statusCode?: number } | undefined)?.statusCode;
        if (code === 404 || code === 410) {
          pruned.push(subs[i]!.endpoint);
          prune.push(unregisterPushSubscription(subs[i]!.endpoint));
        }
      });
      await Promise.allSettled(prune);
      if (pruned.length > 0) await logPushPruneActivity(pruned, "dispatch");
      console.info(
        `[notify:push:web-push] delivered to ${results.length - failed}/${results.length} subscription${results.length === 1 ? "" : "s"}` +
          (failed > 0 ? ` (${failed} failed)` : "")
      );
      return {
        channel: "push",
        ok: failed === 0,
        provider: "web-push",
        error: failed > 0 ? `${failed}/${results.length} subscriptions failed` : undefined,
      };
    } catch (err) {
      return {
        channel: "push",
        ok: false,
        provider: "web-push",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function createPushChannel(): NotificationChannel {
  return hasVapidKeys() ? new WebPushChannel() : new ConsolePushChannel();
}

/* ────────────────────────────── Admin cleanup ────────────────────────────── */

/** Shorten an endpoint for display without losing which one it was. */
function shortEndpoint(ep: string): string {
  return ep.length > 64 ? `${ep.slice(0, 48)}…${ep.slice(-12)}` : ep;
}

/** Log pruned/removed endpoints to the admin activity feed (identified by endpoint). */
async function logPushPruneActivity(endpoints: string[], source: "dispatch" | "cleanup"): Promise<void> {
  for (const ep of endpoints) {
    const short = shortEndpoint(ep);
    await logAdminActivity({
      code: ACTION_CODES.PUSH_SUBSCRIPTION_PRUNED,
      actionEn: `Push subscription pruned (${source}): ${short}`,
      actionAr: `إزالة اشتراك إشعارات (${source === "dispatch" ? "إرسال" : "تنظيف"}): ${short}`,
      actor: "System",
      type: "system",
    });
    console.info(`[notify:push:prune:${source}] removed dead endpoint ${ep}`);
  }
}

/**
 * Probe every registered endpoint with a TTL:0 notification — a healthy push
 * service accepts it (and discards it instantly), while a dead endpoint returns
 * 404/410. Dead endpoints are force-removed and logged to the admin feed.
 *
 * Returns the pruned endpoints and how many healthy ones remain. Requires VAPID
 * keys; without them it's a benign no-op (nothing can be probed).
 */
/* ────────────────────────────── Admin test send ──────────────────────────── */

/**
 * Send a real test notification to ONE endpoint (admin "Test send" button).
 *
 * Uses the standard web-push provider path (bilingual payload via
 * renderPushPayload) so the receiving device confirms delivery. If the push
 * service answers 404/410 the endpoint is dead — it's pruned and reported so
 * the admin can see why the test didn't land. Requires VAPID keys.
 */
export async function sendTestPushSubscription(
  endpoint: string
): Promise<{ ok: boolean; error?: string; pruned?: boolean }> {
  if (!hasVapidKeys()) {
    return { ok: false, error: "vapid-unconfigured" };
  }
  const sub = await getPushSubscription(endpoint);
  if (!sub) return { ok: false, error: "not-found" };

  try {
    const mod = await import(/* webpackIgnore: true */ "web-push");
    const webpush = mod.default ?? mod;
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!,
      process.env.VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    );

    const testPayload: ChannelPayload = {
      id: `test-${Date.now()}`,
      type: "system",
      titleEn: "WorkersArena test notification",
      titleAr: "إشعار اختبار من وركرز أرينا",
      bodyEn: "This is a test send from the admin dashboard — you're receiving it, so push works.",
      bodyAr: "هذه رسالة اختبار من لوحة التحكم — تستلمها الآن، فالإشعارات تعمل.",
      href: "/admin/push-subscriptions",
      time: new Date().toISOString(),
    };
    const data = renderPushPayload(testPayload, "en");
    const agent = agentFor(sub.endpoint);
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, data, {
      TTL: 60 * 60, // an hour — the device should actually show this
      ...(agent ? { agent } : {}),
    });
    console.info(`[notify:push:test-send] delivered to ${sub.endpoint}`);
    return { ok: true };
  } catch (err) {
    const code = (err as { statusCode?: number } | undefined)?.statusCode;
    if (code === 404 || code === 410) {
      // Dead endpoint — remove it so it stops failing and tell the admin why.
      await unregisterPushSubscription(sub.endpoint);
      console.info(`[notify:push:test-send] endpoint dead (${code}) — pruned ${sub.endpoint}`);
      return { ok: false, error: "endpoint-dead", pruned: true };
    }
    const message = err instanceof Error ? err.message : String(err);
    console.info(`[notify:push:test-send] failed ${sub.endpoint}: ${message}`);
    return { ok: false, error: message };
  }
}

/* ────────────────────────────── Admin cleanup ────────────────────────────── */

export async function pruneDeadPushSubscriptions(): Promise<{ pruned: string[]; kept: number }> {
  if (!hasVapidKeys()) {
    console.info("[notify:push:prune] no VAPID keys configured — skipped");
    return { pruned: [], kept: (await getPushSubscriptions()).length };
  }

  const subs = await getPushSubscriptions();
  if (subs.length === 0) return { pruned: [], kept: 0 };

  const mod = await import(/* webpackIgnore: true */ "web-push");
  const webpush = mod.default ?? mod;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const probe = JSON.stringify({ type: "probe", tag: `prune-${Date.now()}` });
  const results = await Promise.allSettled(
    subs.map((s) => {
      const agent = agentFor(s.endpoint);
      return webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, probe, {
        TTL: 0, // expire immediately — a probe, not a real notification
        ...(agent ? { agent } : {}),
      });
    })
  );

  const pruned: string[] = [];
  let kept = 0;
  const removes: Promise<unknown>[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      kept += 1;
      return;
    }
    const code = (r.reason as { statusCode?: number } | undefined)?.statusCode;
    if (code === 404 || code === 410) {
      pruned.push(subs[i]!.endpoint);
      removes.push(forceRemovePushSubscription(subs[i]!.endpoint));
    } else {
      // Transient/network error — don't delete, count as kept.
      kept += 1;
      console.info(`[notify:push:prune] probe error (kept) ${subs[i]!.endpoint}: ${(r.reason as Error)?.message ?? r.reason}`);
    }
  });
  await Promise.allSettled(removes);

  if (pruned.length > 0) await logPushPruneActivity(pruned, "cleanup");
  console.info(`[notify:push:prune] ${pruned.length} pruned, ${kept} kept`);
  return { pruned, kept };
}
