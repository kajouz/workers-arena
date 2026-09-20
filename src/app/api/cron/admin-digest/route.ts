import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { appBaseUrl } from "@/lib/notifications/config";
import { dispatchWhatsApp } from "@/lib/notifications/dispatcher";
import { ALL_COUNTRIES } from "@/lib/tenant/countries";
import { computeSurgeReport } from "@/lib/data/surge-report";
import { buildAdminWeeklyDigest } from "@/lib/data/admin-weekly-digest";
import { listLeadOffers } from "@/lib/data/repo";
import { listLeadRefunds } from "@/lib/data/lead-refund-store";
import { getAllBookings, getPendingManualPayments, getAllWorkers } from "@/lib/data/repo";
import { getWhatsAppDeliveryHealth, getWhatsAppDeliveries } from "@/lib/data/whatsapp-delivery-store";
import { retentionSnapshot } from "@/lib/data/retention";
import { sendEmail } from "@/lib/email/send";

export const revalidate = 0;
export const dynamic = "force-dynamic";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WEEKLY ADMIN WHATSAPP DIGEST — /api/cron/admin-digest
 * ────────────────────────────────────────────────────────────────────────────
 * Keeps the Phase-2 tuning decision visible while the 30-day emergency-surge
 * measurement window runs, plus the week's operational triage: every admin on
 * `ADMIN_WHATSAPP_NUMBERS` gets the WhatsApp digest, and every address on
 * `ADMIN_EMAILS` gets the HTML email — both carry the surge verdict and its
 * tuning line, FAILED WhatsApp deliveries (with error text and retry state),
 * the PENDING lead-refund review queue, and AT-RISK renewals (subscriptions
 * expiring within 30 days).
 *
 * No ADMIN_WHATSAPP_NUMBERS configured → 200 with `recipients: 0` so the
 * scheduler does not page on an unconfigured project; the message body is
 * still returned for verification. Set numbers E.164-style (with the
 * country's dial code from the tenant registry), comma-separated.
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
  const [offers, refunds, bookings, pendingPayments, whatsappHealth, failedDeliveries, workers] = await Promise.all([
    listLeadOffers(2000),
    listLeadRefunds(),
    getAllBookings(),
    getPendingManualPayments(),
    getWhatsAppDeliveryHealth(),
    getWhatsAppDeliveries({ status: "failed", limit: 10 }),
    getAllWorkers(),
  ]);
  const surge = computeSurgeReport(offers, refunds, { windowDays: 30, nowMs });
  const pendingRefunds = refunds
    .filter((r) => r.status === "pending")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    .slice(0, 10);
  const atRiskRenewals = retentionSnapshot(workers, nowMs).atRiskWorkers.slice(0, 10);

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
    whatsappHealth,
    failedDeliveries,
    pendingRefunds,
    atRiskRenewals,
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
  // Message locale follows the recipient's dial code, matched against the
  // tenant registry — never a hardcoded country list (tests/tenant-countries).
  const ARABIC_CODES = new Set(
    ALL_COUNTRIES.filter((c) => c.nameAr.length > 0 && c.slug !== "us").map((c) => c.dialCode)
  );
  for (const phone of recipients) {
    const digits = phone.replace(/^\+/, "");
    const matchedCountry = ALL_COUNTRIES.find((c) => digits.startsWith(c.dialCode));
    const locale: "ar" | "en" = matchedCountry && ARABIC_CODES.has(matchedCountry.dialCode) ? "ar" : "en";
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

  // Email recipients: ADMIN_EMAILS (comma-separated). Unset → no email, the
  // WhatsApp channel above still runs. Both languages are sent as separate
  // messages only when addresses declare a locale (admin@…#ar) — plain
  // addresses get the English HTML with the Arabic text alongside.
  const emailResults: Array<{ to: string; ok: boolean; error?: string }> = [];
  const emailRecipients = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  for (const entry of emailRecipients) {
    const wantsAr = entry.toLowerCase().endsWith("#ar");
    const to = wantsAr ? entry.slice(0, -3) : entry;
    const subject = wantsAr ? digest.titleAr : digest.titleEn;
    const html = wantsAr ? digest.htmlAr : digest.htmlEn;
    const email = await sendEmail({ to, subject, html, text: wantsAr ? digest.bodyAr : digest.bodyEn });
    emailResults.push({ to, ok: email.success, error: email.success ? undefined : email.error });
  }

  if (process.env.LOG_LEVEL !== "silent") {
    console.log("[AdminDigest] verdict:", digest.meta.verdict, "recipients:", results.length, "emails:", emailResults.length, "results:", results, emailResults);
  }

  return NextResponse.json({
    success: true,
    weekStart,
    weekEnd,
    digest: { verdict: digest.meta, bodyEn: digest.bodyEn, bodyAr: digest.bodyAr },
    recipients: results.length,
    emails: emailResults.length,
    results,
    emailResults,
  });
}

/** GET handler — cron-guarded, describes usage (no open leak). */
export async function GET(request: Request) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return NextResponse.json({
    message: "Weekly admin digest endpoint is ready (WhatsApp + email)",
    usage: "POST /api/cron/admin-digest with x-cron-secret: $CRON_SECRET",
    env: [
      "ADMIN_WHATSAPP_NUMBERS (comma-separated E.164 admin phones)",
      "ADMIN_EMAILS (comma-separated admin addresses; suffix #ar for the Arabic body)",
    ],
  });
}
