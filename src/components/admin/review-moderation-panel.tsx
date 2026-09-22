"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REVIEW MODERATION QUEUE — /admin/reviews (docs/REVIEW-MODERATION.md)
 * ────────────────────────────────────────────────────────────────────────────
 * The queue that publishes reviews. Until an admin decides, a review is not on
 * the profile and not in the worker's rating — so this panel is the gate, and
 * it is built to make the decision cheap and explainable rather than blind:
 *
 *   • the triage signals (contact details shared, links, unverified, a bare
 *     1★/5★ with nothing to moderate) are shown next to the text that triggered
 *     them, with an advisory recommendation and a risk band
 *   • the queue is ordered risk-first, then oldest, so the dangerous and the
 *     over-SLA reviews are what an admin sees when the page opens
 *   • a rejection requires a reason from the shared vocabulary, because that
 *     reason is what the audit row carries
 *
 * Decisions go through `decideReviewAction`; a conflict (already decided)
 * refreshes the row rather than pretending the click did something.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Clock, ExternalLink, Flag, Info, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn, fillDuration, timeAgo } from "@/lib/utils";
import { decideReviewAction } from "@/app/actions/review-moderation";
import type { ReviewQueueItem } from "@/lib/data/review-moderation-store";
import type { QueueStats, ReviewFlagCode, ReviewRisk } from "@/lib/data/review-moderation";
import { REVIEW_REJECTION_REASONS, REVIEW_MODERATION_SLA_HOURS } from "@/lib/data/review-moderation";

const RISK_STYLE: Record<ReviewRisk, { badge: "success" | "outline" | "danger"; badgeClass?: string; ring: string }> = {
  low: { badge: "success", ring: "border-emerald-500/25" },
  medium: {
    badge: "outline",
    badgeClass: "border-amber-500/40 text-amber-700 dark:text-amber-400",
    ring: "border-amber-500/30",
  },
  high: { badge: "danger", ring: "border-red-500/35" },
};

function FlagRow({ code, locale }: { code: ReviewFlagCode; locale: string }) {
  const label = locale === "ar" ? AR_FLAGS[code] ?? code : EN_FLAGS[code] ?? code;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-[11px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
      <Flag className="size-3" />
      {label}
    </span>
  );
}

/** Bilingual flag copy — kept beside the enum so a new code can't ship untranslated. */
const EN_FLAGS: Partial<Record<ReviewFlagCode, string>> = {
  "no-text": "No text",
  "too-short": "Very short",
  link: "Contains a link",
  "contact-info": "Shares contact details",
  shouting: "Shouting",
  unverified: "Unverified purchase",
  "just-submitted": "Just submitted",
  "repeat-author": "Frequent reviewer",
  "author-history": "Author has rejected reviews",
  "extreme-rating": "Extreme rating, no detail",
};
const AR_FLAGS: Partial<Record<ReviewFlagCode, string>> = {
  "no-text": "بدون نص",
  "too-short": "قصير جدًا",
  link: "يحتوي رابطًا",
  "contact-info": "يشارك بيانات تواصل",
  shouting: "كتابة بحروف كبيرة",
  unverified: "شراء غير مؤكد",
  "just-submitted": "أُرسل للتو",
  "repeat-author": "مُقيِّم متكرر",
  "author-history": "كاتب لديه تقييمات مرفوضة",
  "extreme-rating": "تقييم متطرف بدون تفاصيل",
};

const EN_REASONS: Record<string, string> = {
  spam: "Spam or advertising",
  abusive: "Abusive language",
  "contact-info": "Shares contact details",
  "off-topic": "Not about the work",
  fake: "Looks fake",
  incentivized: "Paid or incentivized",
  duplicate: "Duplicate",
  other: "Other",
};
const AR_REASONS: Record<string, string> = {
  spam: "إعلان أو محتوى مكرر",
  abusive: "لغة مسيئة",
  "contact-info": "مشاركة بيانات تواصل",
  "off-topic": "لا يتعلق بالعمل",
  fake: "يبدو غير حقيقي",
  incentivized: "مقابل مقابل أو حافز",
  duplicate: "تقييم مكرر",
  other: "سبب آخر",
};

export function ReviewModerationPanel({
  pending,
  decided,
  stats,
}: {
  /** Reviews awaiting a decision (risk-first, oldest first). */
  pending: ReviewQueueItem[];
  /** Recently decided reviews, so an admin can see what happened. */
  decided: ReviewQueueItem[];
  stats: QueueStats;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("spam");

  async function decide(item: ReviewQueueItem, approve: boolean) {
    if (busyId) return;
    setBusyId(item.reviewId);
    const res = await decideReviewAction({
      reviewId: item.reviewId,
      approve,
      ...(approve ? {} : { reason }),
    });
    setBusyId(null);
    setRejectingId(null);
    if (res.ok) {
      toast("success", approve ? t("admin.reviewApproved") : t("admin.reviewRejected"));
      router.refresh();
      return;
    }
    // "conflict" is the honest story: someone (or another tab) already decided
    // this review, so show the fresh state instead of a fake success.
    toast(res.error === "conflict" ? "info" : "error", res.error === "conflict" ? t("admin.reviewAlreadyDecided") : t("admin.reviewDecisionFailed"));
    router.refresh();
  }

  const sla = stats.oldestPendingHours;

  return (
    <div className="space-y-6">
      {/* ── Queue health: what an admin needs before reading a single review ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className={cn(pending.length > 0 && "border-brand-500/25")}>
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{t("admin.reviewQueuePending")}</p>
            <p className="mt-1 text-3xl font-black text-ink-900 dark:text-ink-50">{stats.pending}</p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {stats.pending === 0
                ? t("admin.reviewQueueClear")
                : fillDuration(t("admin.reviewQueueOldest"), { hours: Math.round(sla), minutes: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card className={cn(sla > REVIEW_MODERATION_SLA_HOURS && "border-amber-500/40")}>
          <CardContent className="p-5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-400">
              <Clock className="size-3.5" /> {t("admin.reviewQueueSla")}
            </p>
            <p className="mt-1 text-3xl font-black text-ink-900 dark:text-ink-50">{stats.slaBreached}</p>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
              {fillDuration(t("admin.reviewQueueSlaBody"), { hours: REVIEW_MODERATION_SLA_HOURS, minutes: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{t("admin.reviewQueueRisk")}</p>
            <div className="mt-2 flex items-center gap-3 text-sm font-bold">
              <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                <ShieldAlert className="size-4" /> {stats.risk.high}
              </span>
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" /> {stats.risk.medium}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-4" /> {stats.risk.low}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t("admin.reviewQueueRiskBody")}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── The queue itself ── */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-brand-500" /> {t("admin.reviewQueueTitle")}
          </CardTitle>
          <Badge variant="outline">{pending.length}</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 && <p className="py-8 text-center text-sm text-ink-500 dark:text-ink-400">{t("admin.reviewQueueEmpty")}</p>}
          {pending.map((item) => {
            const style = RISK_STYLE[item.assessment.risk];
            const body = locale === "ar" ? item.textAr : item.textEn;
            const busy = busyId === item.reviewId;
            return (
              <div key={item.reviewId} className={cn("rounded-xl border p-4", style.ring)}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="font-black text-ink-900 dark:text-ink-50">{item.workerNameEn}</p>
                  <Badge variant="outline" className="whitespace-nowrap">
                    {item.rating}★
                  </Badge>
                  <Badge variant={style.badge} className={style.badgeClass}>
                    {item.assessment.risk}
                  </Badge>
                  {item.verifiedPurchase && <Badge variant="success">{t("admin.reviewVerified")}</Badge>}
                  <span className="text-xs text-ink-400">{timeAgo(item.date, locale)}</span>
                  <Link
                    href={`/workers/${item.workerSlug}`}
                    className="ms-auto inline-flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    <ExternalLink className="size-3.5" /> {t("admin.reviewViewProfile")}
                  </Link>
                </div>

                <p className="mt-2 whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">{body || t("admin.reviewNoText")}</p>
                <p className="mt-1 text-xs text-ink-400">
                  {t("admin.reviewBy")} <span className="font-semibold">{item.author}</span>
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {item.assessment.flags.map((f) => (
                    <FlagRow key={f.code} code={f.code} locale={locale} />
                  ))}
                  <span className="ms-1 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400">
                    <Info className="size-3" />
                    {t("admin.reviewAdvisory").replace("{recommendation}", item.assessment.recommendation)}
                  </span>
                </div>

                {rejectingId === item.reviewId ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t("admin.reviewRejectReason")}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="h-10 rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
                    >
                      {REVIEW_REJECTION_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {locale === "ar" ? AR_REASONS[r] ?? r : EN_REASONS[r] ?? r}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => void decide(item, false)}>
                      <X className="size-4" /> {t("admin.reviewConfirmReject")}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRejectingId(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void decide(item, true)}>
                      <Check className="size-4" /> {t("admin.reviewApprove")}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejectingId(item.reviewId)}>
                      <X className="size-4" /> {t("admin.reviewReject")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Recently decided: the trail, in the same vocabulary as the audit log ── */}
      {decided.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.reviewDecidedTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {decided.map((item) => (
              <div key={item.reviewId} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-100 py-2 text-sm last:border-0 dark:border-ink-800">
                <Badge variant={item.status === "approved" ? "success" : "danger"} className="whitespace-nowrap">
                  {item.status === "approved" ? <Check className="size-3" /> : <X className="size-3" />}
                  {item.status === "approved" ? t("admin.reviewApprove") : t("admin.reviewReject")}
                </Badge>
                <span className="font-bold text-ink-800 dark:text-ink-100">{item.workerNameEn}</span>
                <span className="text-ink-500 dark:text-ink-400">· {item.rating}★</span>
                {item.rejectionReason && (
                  <span className="text-xs text-ink-400">
                    {locale === "ar" ? AR_REASONS[item.rejectionReason] ?? item.rejectionReason : EN_REASONS[item.rejectionReason] ?? item.rejectionReason}
                  </span>
                )}
                <span className="ms-auto text-xs text-ink-400">
                  {item.moderatedBy && `${item.moderatedBy} · `}
                  {item.moderatedAt ? timeAgo(item.moderatedAt, locale) : ""}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
