import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runWhatsAppRetrySweep } from "@/lib/data/whatsapp-delivery-store";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/whatsapp-retries — the bounded automatic retry sweep for
 * failed WhatsApp deliveries (5 min, then 30 min backoff; max 3 attempts —
 * WHATSAPP_RETRY_POLICY in src/lib/data/whatsapp-deliveries.ts).
 *
 * Call from a scheduler:
 *   curl -H "x-cron-secret: $CRON_SECRET" https://app.example.com/api/cron/whatsapp-retries
 *
 * Each run re-sends at most 50 due rows using their stored payload, stamps
 * the outcome, and schedules the next attempt (or exhausts the row). The
 * admin audit view (/admin → WhatsApp deliveries) shows every attempt.
 */
export async function GET(req: Request) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const run = await runWhatsAppRetrySweep();
  return NextResponse.json({ ok: true, ...run });
}
