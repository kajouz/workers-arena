import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { applyWhatsAppStatusEvent } from "@/lib/data/whatsapp-delivery-store";
import { flattenMetaError } from "@/lib/data/whatsapp-deliveries";

export const dynamic = "force-dynamic";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * META WHATSAPP STATUS WEBHOOK — /api/webhooks/whatsapp
 * ────────────────────────────────────────────────────────────────────────────
 * Two halves:
 *
 *   GET  — Meta's subscription handshake: echo `hub.challenge` when
 *          `hub.verify_token` matches WHATSAPP_VERIFY_TOKEN.
 *
 *   POST — delivery status callbacks. Each `entry[].changes[].value.statuses[]`
 *          item carries the `wamid` we stored at send time plus sent /
 *          delivered / read / failed, and (on failure) a structured error.
 *          The ledger row is advanced; stale or duplicate events are ignored
 *          (the pure transition table in src/lib/data/whatsapp-deliveries.ts
 *          decides). The handler ALWAYS answers 200 for recognized payloads so
 *          Meta doesn't redrive a dead letter forever.
 *
 * Security: when WHATSAPP_APP_SECRET is configured, the `X-Hub-Signature-256`
 * header is verified (HMAC-SHA256 over the raw body, constant-time compare)
 * and mismatches are rejected with 401 before parsing.
 *
 * Environment (docs/DEPLOYMENT.md):
 *   WHATSAPP_VERIFY_TOKEN — the value pasted into Meta's webhook config
 *   WHATSAPP_APP_SECRET   — the app secret Meta signs payloads with
 * ────────────────────────────────────────────────────────────────────────────
 */

interface MetaStatusEntry {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
}

interface MetaWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: { statuses?: MetaStatusEntry[]; messages?: unknown[] };
    }>;
  }>;
}

function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Meta handshake — echo the challenge when the token matches. */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && expected && token === expected) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();

  // Signature check — only enforced when the app secret is configured.
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret && !verifySignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(raw) as MetaWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const nowMs = Date.now();
  let applied = 0;
  let ignored = 0;

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        const providerMessageId = status.id;
        const kind = status.status;
        if (!providerMessageId || !kind) {
          ignored += 1;
          continue;
        }
        if (!["sent", "delivered", "read", "failed"].includes(kind)) {
          ignored += 1;
          continue;
        }
        const updated = await applyWhatsAppStatusEvent(
          {
            providerMessageId,
            status: kind as "sent" | "delivered" | "read" | "failed",
            timestampSeconds: status.timestamp ? Number(status.timestamp) : undefined,
            error: flattenMetaError(status.errors?.[0]),
            raw: status as unknown as Record<string, unknown>,
          },
          nowMs
        );
        if (updated) applied += 1;
        else ignored += 1;
      }
    }
  }

  // 200 even when nothing matched: Meta redrives non-2xx for days, and an
  // unknown wamid (e.g. ledger pruned) must not become a retry storm.
  return NextResponse.json({ received: true, applied, ignored });
}
