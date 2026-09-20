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

  // EN — a phone-screen-shaped message: decision first, numbers after.
  const bodyEn = [
    `📊 WorkersArena weekly admin digest — ${input.weekStart.slice(0, 10)} → ${input.weekEnd.slice(0, 10)}`,
    "",
    `🚨 Emergency surge (30d): ${surge.verdict.purchases}/${surge.verdict.offers} bought · ${surge.verdict.conversionPct}% conversion · refunds ${surge.verdict.approvedRefundRatePct}% · net premium ${int(s.netPremiumCredits)} credits`,
    `Verdict: ${surge.verdict.code}${dayMarker}`,
    `→ ${surgeTuningLine(surge.verdict, "en")}`,
    "",
    `Bookings ${input.newBookings} · jobs completed ${input.completedJobs} · pending payments ${input.pendingManualPayments} · pending refunds ${input.pendingRefundRequests}`,
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
    `سجل القرار: ${input.csvPath}`,
  ].join("\n");

  return {
    bodyEn,
    bodyAr,
    titleEn: "Weekly admin digest",
    titleAr: "الملخص الإداري الأسبوعي",
    meta,
  };
}
