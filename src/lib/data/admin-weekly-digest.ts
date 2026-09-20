/**
 * ────────────────────────────────────────────────────────────────────────────
 * ADMIN WEEKLY DIGEST — the WhatsApp message that keeps Phase 2 visible
 * ────────────────────────────────────────────────────────────────────────────
 * The enhancement plan's tuning rule says: let the surge report accumulate 30
 * days of data, then tune the 1.5× emergency factor — re-exporting the CSV
 * monthly as the decision record. A decision nobody sees is a decision
 * nobody makes, so the weekly admin digest carries the surge summary every
 * week while the 30-day window runs:
 *
 *   • the emergency cohort headline (offers, purchases, conversion);
 *   • the verdict and its tuning line (what the plan says to do next);
 *   • the premium's net credits, so the money is in the same glance.
 *
 * Pure engine: takes the surge report (already computed server-side by the
 * same `computeSurgeReport` the admin card uses) plus the digest week's
 * bookkeeping numbers and renders identical text for identical inputs.
 * No clocks — `nowMs` rides in the input.
 */

import type { SurgeReport, SurgeVerdictCode } from "./surge-report";
import type { WhatsAppDeliveryHealth, WhatsAppDelivery } from "./whatsapp-deliveries";
import type { RetentionAtRiskWorker } from "./retention";
import type { LeadRefundRequest } from "./lead-refunds";

/* ──────────────────────────────── Shapes ──────────────────────────────── */

/** Everything the digest text needs, in the exact shape the route gathers. */
export interface AdminWeeklyDigestInput {
  /** The computed 30-day emergency-surge report (same one the card renders). */
  surge: SurgeReport;
  /** The digest week's boundaries (ISO) — shown so the message is self-dating. */
  weekStart: string;
  weekEnd: string;
  /** Bookkeeping counts for the week, so the digest is more than the surge. */
  newBookings: number;
  completedJobs: number;
  pendingManualPayments: number;
  pendingRefundRequests: number;
  /** Where the CSV export lives, so the decision record stays one click away. */
  csvPath: string;
  /** Delivery-ledger health — the failed-deliveries section of the digest. */
  whatsappHealth: WhatsAppDeliveryHealth;
  /** Failed WhatsApp sends this week (newest first, capped by the caller). */
  failedDeliveries: WhatsAppDelivery[];
  /** Pending lead-quality refund requests (oldest first — the review queue). */
  pendingRefunds: LeadRefundRequest[];
  /** Subscriptions expiring within the retention window, soonest first. */
  atRiskRenewals: RetentionAtRiskWorker[];
  /** The rendering clock — injected for determinism. */
  nowMs: number;
}

export interface AdminWeeklyDigest {
  /** Bilingual message body, ready for the WhatsApp channel. */
  bodyEn: string;
  bodyAr: string;
  /** Short titles for the in-app notification trail. */
  titleEn: string;
  titleAr: string;
  /** HTML email body (locale-neutral — the admin renders both languages). */
  htmlEn: string;
  htmlAr: string;
  /** Structured facts the route logs alongside the send. */
  meta: {
    verdict: SurgeVerdictCode;
    conversionPct: number;
    approvedRefundRatePct: number;
    offers: number;
    purchases: number;
    netPremiumCredits: number;
    pendingRefundRequests: number;
  };
}

/* ─────────────────────── Verdict → tuning-decision line ────────────────── */

/**
 * What the plan says to do next, per verdict. Mirrors the surge card's
 * verdict reasons — the digest never contradicts the UI.
 */
export function surgeTuningLine(
  verdict: SurgeReport["verdict"],
  locale: "en" | "ar"
): string {
  const { code, conversionPct, purchases, offers } = verdict;
  const pctText = `${conversionPct}%`;
  const counts = `${purchases}/${offers}`;
  switch (code) {
    case "healthy":
      return locale === "ar"
        ? `الطلب يستوعب العلاوة (${counts} شراء، ${pctText}) — أبقِ 1.5× أو جرّب رفع الأساس.`
        : `Demand is absorbing the premium (${counts} bought, ${pctText}) — keep 1.5×, or test raising the base price.`;
    case "overpriced":
      return locale === "ar"
        ? `العلاوة تكبح الطلب (${counts} شراء، ${pctText}) — خفّض الأساس أو وسّع نافذة العرض.`
        : `The premium is suppressing demand (${counts} bought, ${pctText}) — consider lowering the base price.`;
    case "quality-risk":
      return locale === "ar"
        ? `نسبة استرداد ${verdict.approvedRefundRatePct}% — عالج جودة العملاء أولًا؛ تغيير السعر لن يحل المشكلة.`
        : `Refund rate ${verdict.approvedRefundRatePct}% — fix lead quality first; a price change will not fix this.`;
    case "watch":
      return locale === "ar"
        ? `المؤشرات بين الحد السليم وحد الخطر (${pctText}) — واصل جمع البيانات قبل أي تعديل.`
        : `Signals sit between the healthy and danger bands (${pctText}) — keep collecting before tuning.`;
    case "insufficient-data":
    default:
      return locale === "ar"
        ? `${counts} عرض/شراء خلال 30 يومًا — أقل من الحد الأدنى 20/10 لإصدار حكم؛ واصل جمع البيانات.`
        : `${counts} offers/purchases in 30 days — below the 20/10 minimum for a verdict; keep collecting.`;
  }
}

/* ───────────── Section renderers (text + HTML fragments) ───────────── */

/** Escapes the small bits of dynamic text that go into the HTML email. */
function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SectionCopy {
  label: string;
  empty: string;
}

const FAILED_COPY: Record<"en" | "ar", SectionCopy> = {
  en: { label: "Failed WhatsApp deliveries", empty: "None — every send this week went out clean." },
  ar: { label: "رسائل واتساب الفاشلة", empty: "لا شيء — كل إرسالات الأسبوع نجحت." },
};
const REFUND_COPY: Record<"en" | "ar", SectionCopy> = {
  en: { label: "Pending lead refunds (review queue)", empty: "None waiting for review." },
  ar: { label: "استردادات عملاء معلّقة (قائمة المراجعة)", empty: "لا يوجد ما ينتظر المراجعة." },
};
const RENEWAL_COPY: Record<"en" | "ar", SectionCopy> = {
  en: { label: "At-risk renewals (next 30 days)", empty: "No subscriptions expiring in the next 30 days." },
  ar: { label: "تجديدات معرّضة للخطر (30 يومًا القادمة)", empty: "لا اشتراكات تنتهي خلال 30 يومًا." },
};

function renderFailedSection(
  health: WhatsAppDeliveryHealth,
  failed: WhatsAppDelivery[],
  locale: "en" | "ar"
): { text: string[]; html: string } {
  const copy = FAILED_COPY[locale];
  if (failed.length === 0 && health.last24h.failed === 0) {
    return { text: [`${copy.label}: ${copy.empty}`], html: `<p><b>${copy.label}:</b> ${copy.empty}</p>` };
  }
  const lines = failed.map((d) => {
    const when = (d.updatedAt ?? d.createdAt).slice(0, 10);
    const to = d.recipientPhone ?? "unknown";
    const err = d.lastError ? ` — ${d.lastError.slice(0, 80)}` : "";
    return `${to} · ${d.kind} · ${d.attempts}× · ${when}${err}`;
  });
  const summaryLine =
    locale === "ar"
      ? `${health.last24h.failed} فشل من ${health.last24h.sends} إرسال في 24 ساعة · ${health.deadLetters} مستنكاة نهائيًا`
      : `${health.last24h.failed} failed of ${health.last24h.sends} sends in 24h · ${health.deadLetters} dead-lettered overall`;
  const items = failed
    .map((d) => {
      const when = (d.updatedAt ?? d.createdAt).slice(0, 10);
      const to = esc(d.recipientPhone ?? "unknown");
      const err = d.lastError ? ` — ${esc(d.lastError.slice(0, 80))}` : "";
      return `<li>${to} · ${esc(d.kind)} · ${d.attempts}× · ${esc(when)}${err}</li>`;
    })
    .join("");
  return {
    text: [`${copy.label} (${summaryLine}):`, ...lines.map((l) => `  • ${l}`)],
    html: `<p><b>${copy.label}</b> <small>(${summaryLine})</small></p><ul>${items}</ul>`,
  };
}

function renderRefundSection(
  refunds: LeadRefundRequest[],
  locale: "en" | "ar"
): { text: string[]; html: string } {
  const copy = REFUND_COPY[locale];
  if (refunds.length === 0) {
    return { text: [`${copy.label}: ${copy.empty}`], html: `<p><b>${copy.label}:</b> ${copy.empty}</p>` };
  }
  const lines = refunds.map((r) => `${r.id} · ${r.workerId} · ${r.requestedCredits} credits · ${r.reason} · since ${r.submittedAt.slice(0, 10)}`);
  const items = refunds
    .map((r) => `<li>${esc(r.id)} · ${esc(r.workerId)} · ${r.requestedCredits} cr · ${esc(r.reason)} · ${esc(r.submittedAt.slice(0, 10))}</li>`)
    .join("");
  return {
    text: [`${copy.label}:`, ...lines.map((l) => `  • ${l}`)],
    html: `<p><b>${copy.label}</b></p><ul>${items}</ul>`,
  };
}

function renderRenewalSection(
  workers: RetentionAtRiskWorker[],
  locale: "en" | "ar"
): { text: string[]; html: string } {
  const copy = RENEWAL_COPY[locale];
  if (workers.length === 0) {
    return { text: [`${copy.label}: ${copy.empty}`], html: `<p><b>${copy.label}:</b> ${copy.empty}</p>` };
  }
  const lines = workers.map((w) => {
    const name = locale === "ar" && w.nameAr ? w.nameAr : w.nameEn;
    return `${name} · ${w.plan} · ${w.daysUntilExpiry}d`;
  });
  const items = workers
    .map((w) => {
      const name = locale === "ar" && w.nameAr ? w.nameAr : w.nameEn;
      return `<li>${esc(name)} · ${esc(w.plan)} · ${w.daysUntilExpiry}d</li>`;
    })
    .join("");
  return {
    text: [`${copy.label}:`, ...lines.map((l) => `  • ${l}`)],
    html: `<p><b>${copy.label}</b></p><ul>${items}</ul>`,
  };
}

/* ──────────────────────────────── Engine ──────────────────────────────── */

/** Round to whole numbers for message text; credits are integers anyway. */
const int = (n: number) => Math.round(n);

export function buildAdminWeeklyDigest(input: AdminWeeklyDigestInput): AdminWeeklyDigest {
  const { surge } = input;
  const s = surge.summary;

  // How far into the 30-day measurement window we are (0–30). Negative or
  // unparseable bounds degrade to "no day marker" rather than garbage text.
  const fromT = Date.parse(surge.from);
  const nowT = input.nowMs;
  const windowDay =
    Number.isFinite(fromT) && Number.isFinite(nowT)
      ? Math.min(30, Math.max(0, Math.ceil((nowT - fromT) / 86_400_000)))
      : null;
  const dayMarker = windowDay !== null && windowDay > 0 ? ` (window day ${windowDay}/30)` : "";
  const dayMarkerAr = windowDay !== null && windowDay > 0 ? ` (اليوم ${windowDay}/30 من الفترة)` : "";

  const meta = {
    verdict: surge.verdict.code,
    conversionPct: surge.verdict.conversionPct,
    approvedRefundRatePct: surge.verdict.approvedRefundRatePct,
    offers: surge.verdict.offers,
    purchases: surge.verdict.purchases,
    netPremiumCredits: s.netPremiumCredits,
    pendingRefundRequests: input.pendingRefundRequests,
  };

  const failedEn = renderFailedSection(input.whatsappHealth, input.failedDeliveries, "en");
  const failedAr = renderFailedSection(input.whatsappHealth, input.failedDeliveries, "ar");
  const refundsEn = renderRefundSection(input.pendingRefunds, "en");
  const refundsAr = renderRefundSection(input.pendingRefunds, "ar");
  const renewalsEn = renderRenewalSection(input.atRiskRenewals, "en");
  const renewalsAr = renderRenewalSection(input.atRiskRenewals, "ar");

  // EN — a phone-screen-shaped message: decision first, numbers after.
  const bodyEn = [
    `📊 WorkersArena weekly admin digest — ${input.weekStart.slice(0, 10)} → ${input.weekEnd.slice(0, 10)}`,
    "",
    `🚨 Emergency surge (30d): ${surge.verdict.purchases}/${surge.verdict.offers} bought · ${surge.verdict.conversionPct}% conversion · refunds ${surge.verdict.approvedRefundRatePct}% · net premium ${int(s.netPremiumCredits)} credits`,
    `Verdict: ${surge.verdict.code}${dayMarker}`,
    `→ ${surgeTuningLine(surge.verdict, "en")}`,
    "",
    `Bookings ${input.newBookings} · jobs completed ${input.completedJobs} · pending payments ${input.pendingManualPayments} · pending refunds ${input.pendingRefundRequests}`,
    ...failedEn.text,
    ...refundsEn.text,
    ...renewalsEn.text,
    `Decision record: ${input.csvPath}`,
  ].join("\n");

  // AR — same shape, native phrasing (numbers stay Western digits for clarity).
  const bodyAr = [
    `📊 ملخص الإدارة الأسبوعي — ${input.weekStart.slice(0, 10)} → ${input.weekEnd.slice(0, 10)}`,
    "",
    `🚨 علاوة الطوارئ (30 يومًا): ${surge.verdict.purchases}/${surge.verdict.offers} شراء · نسبة ${surge.verdict.conversionPct}% · استرداد ${surge.verdict.approvedRefundRatePct}% · صافي العلاوة ${int(s.netPremiumCredits)} رصيد`,
    `الحكم: ${surge.verdict.code}${dayMarkerAr}`,
    `→ ${surgeTuningLine(surge.verdict, "ar")}`,
    "",
    `حجوزات ${input.newBookings} · أعمال مكتملة ${input.completedJobs} · مدفوعات معلّقة ${input.pendingManualPayments} · استردادات معلّقة ${input.pendingRefundRequests}`,
    ...failedAr.text,
    ...refundsAr.text,
    ...renewalsAr.text,
    `سجل القرار: ${input.csvPath}`,
  ].join("\n");

  // The email body: same content, HTML-shaped. The surge block reuses the
  // digest's own text lines inside a styled header.
  const htmlBlock = (title: string, headingAr: string, lines: string[], sections: string) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
  <h2 style="font-size:16px;margin:0 0 4px">${title}</h2>
  <p style="margin:0 0 12px;color:#6b7280;font-size:12px">${headingAr}</p>
  ${sections}
  <pre style="background:#f3f4f6;border-radius:8px;padding:12px;font-size:12px;white-space:pre-wrap">${esc(lines.join("\n"))}</pre>
  <p style="font-size:11px;color:#9ca3af;margin-top:12px">${esc(input.csvPath)}</p>
</div>`;

  return {
    bodyEn,
    bodyAr,
    titleEn: "Weekly admin digest",
    titleAr: "الملخص الإداري الأسبوعي",
    htmlEn: htmlBlock("WorkersArena weekly admin digest", "ملخص الإدارة الأسبوعي", bodyEn.split("\n"), failedEn.html + refundsEn.html + renewalsEn.html),
    htmlAr: htmlBlock("ملخص الإدارة الأسبوعي", "WorkersArena weekly admin digest", bodyAr.split("\n"), failedAr.html + refundsAr.html + renewalsAr.html),
    meta,
  };
}
