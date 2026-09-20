import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { appBaseUrl } from "@/lib/notifications/config";
import { dispatchWhatsApp } from "@/lib/notifications/dispatcher";
import { computeSurgeReport } from "@/lib/data/surge-report";
import { buildAdminWeeklyDigest } from "@/lib/data/admin-weekly-digest";
import { listLeadOffers } from "@/lib/data/repo";
import { listLeadRefunds } from "@/lib/data/lead-refund-store";
import { getAllBookings, getPendingManualPayments } from "@/lib/data/repo";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WEEKLY ADMIN WHATSAPP DIGEST — /api/cron/admin-digest
 * ────────────────────────────────────────────────────────────────────────────
 * Keeps the Phase-2 tuning decision visible while the 30-day emergency-surge
 * measurement window runs: every week each admin phone on
 * `ADMIN_WHATSAPP_NUMBERS` receives the surge headline (offers, purchases,
 * conversion, refund rate, net premium credits), the verdict with its tuning
 * line (what the plan says to do next), the week's booking/payment
 * bookkeeping, and the CSV decision-record link.
 *
 * No ADMIN_WHATSAPP_NUMBERS configured → 200 with `recipients: 0` so the
 * scheduler does not page on an unconfigured project; the message body is
 * still returned for verification. Set numbers E.164-style, comma-separated:
 *   ADMIN_WHATSAPP_NUMBERS="+9613123456,+9617654321"
 *
 * Call weekly from a scheduler:
 *   curl -x POST -H "x-cron-secret: $CRON_SECRET" https://…/api/cron/admin-digest
 */
export async function POST(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const nowMs = Date.now();

  // The surge report is computed from the same stores the admin card uses —
  // one source of truth for the UI and the digest.
  const [offers, refunds, bookings, pendingPayments] = await Promise.all([
    listLeadOffers(2000),
    listLeadRefunds(),
    getAllBookings(),
    getPendingManualPayments(),
  ]);
  const surge = computeSurgeReport(offers, refunds, { windowDays: 30, nowMs });

  // The digest week: the 7 days ending now. The surge cohort stays 30 days
  // (that is the measurement window); week boundaries only date the message
  // and bucket the bookkeeping counts.
  const weekMs = 7 * 86_400_000;
  const weekStart = new Date(nowMs - weekMs).toISOString();
  const weekEnd = new Date(nowMs).toISOString();
  const weekStartMs = nowMs - weekMs;
  const completedStatuses = new Set(["completed", "confirmed"]);
  // Bookings carry no createdAt/updatedAt — creation is the first lifecycle
  // event (same convention as requestSlaExpiryMs), completion the last event
  // that flipped status to completed.
  const createdMs = (b: (typeof bookings)[number]) => {
    const t = Date.parse(b.events[0]?.time ?? "");
    return Number.isFinite(t) ? t : null;
  };
  const completedMs = (b: (typeof bookings)[number]) => {
    for (let i = b.events.length - 1; i >= 0; i -= 1) {
      if (b.events[i]?.status === "completed") {
        const t = Date.parse(b.events[i]!.time);
        if (Number.isFinite(t)) return t;
      }
    }
    return null;
  };
  const newBookings = bookings.filter((b) => {
    const t = createdMs(b);
    return t !== null && t >= weekStartMs && t < nowMs;
  }).length;
  const completedJobs = bookings.filter((b) => {
    const t = completedMs(b);
    return t !== null && t >= weekStartMs && t < nowMs;
  }).length;

  const pendingRefundRequests = refunds.filter((r) => r.status === "pending").length;

  const digest = buildAdminWeeklyDigest({
    surge,
    weekStart,
    weekEnd,
    newBookings,
    completedJobs,
    pendingManualPayments: pendingPayments.length,
    pendingRefundRequests,
    csvPath: `${appBaseUrl()}/api/admin/revenue/surge-report?days=30`,
    nowMs,
  });

  // Recipients: admin phones from env (E.164, comma-separated). Demo mode has
  // no live provider; dispatchWhatsApp still records the attempt in the
  // delivery ledger so the audit view shows the digest ran.
  const recipients = (process.env.ADMIN_WHATSAPP_NUMBERS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const results: Array<{ to: string; ok: boolean; error?: string }> = [];
  for (const phone of recipients) {
    const locale: "ar" | "en" = phone.startsWith("+961") || phone.startsWith("+966") || phone.startsWith("+971") ? "ar" : "en";
    const result = await dispatchWhatsApp({
      id: `admin-digest-${nowMs}-${phone}`,
      type: "system",
      titleEn: digest.titleEn,
      titleAr: digest.titleAr,
      bodyEn: digest.bodyEn,
      bodyAr: digest.bodyAr,
      href: "/admin",
      time: new Date(nowMs).toISOString(),
      recipient: { name: "Admin", phone, locale },
      meta: { kind: "admin_weekly_digest", verdict: digest.meta.verdict },
    });
    results.push({ to: phone, ok: result.ok, error: result.error });
  }

  if (process.env.LOG_LEVEL !== "silent") {
    console.log("[AdminDigest] verdict:", digest.meta.verdict, "recipients:", results.length, "results:", results);
  }

  return NextResponse.json({
    success: true,
    weekStart,
    weekEnd,
    digest: { verdict: digest.meta, bodyEn: digest.bodyEn, bodyAr: digest.bodyAr },
    recipients: results.length,
    results,
  });
}

/** GET handler — cron-guarded, describes usage (no open leak). */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return NextResponse.json({
    message: "Weekly admin WhatsApp digest endpoint is ready",
    usage: "POST /api/cron/admin-digest with x-cron-secret: $CRON_SECRET",
    env: ["ADMIN_WHATSAPP_NUMBERS (comma-separated E.164 admin phones)"],
  });
}
