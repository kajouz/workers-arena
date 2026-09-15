/**
 * ────────────────────────────────────────────────────────────────────────────
 * LEAD MARKETPLACE NOTIFICATION PAYLOADS (§7–§10)
 * ────────────────────────────────────────────────────────────────────────────
 * A paid lead offer that nobody is told about is dead on arrival, so the
 * marketplace speaks to workers the same way the quote auction does
 * (`quote-notifications.ts`): a locale-neutral payload builder, pushed through
 * the ONE notification seam (`pushNotification`), which persists the inbox
 * record and fans it out to the enabled email/SMS/push channels.
 *
 * These reuse the existing `lead` notification type — no new Prisma enum value,
 * no migration — and carry no `booking` context (an offer has no booking yet;
 * the email channel's generic template renders them).
 */

import type { Notification } from "./types";
import { LEAD_BOARD_HREF, type LeadGrade, type LeadOffer } from "./lead-market";

export type LeadNotificationKind = "lead-offer" | "lead-offer-lost" | "lead-offer-expired";

/** A payload ready for pushNotification (id/time/read are assigned there). */
export type LeadNotificationPayload = Omit<Notification, "id" | "time" | "read">;

/** Bilingual grade names — the same words the admin config uses. */
export const LEAD_GRADE_LABELS: Record<LeadGrade, { en: string; ar: string }> = {
  bronze: { en: "Bronze", ar: "برونزي" },
  silver: { en: "Silver", ar: "فضي" },
  gold: { en: "Gold", ar: "ذهبي" },
  emergency: { en: "Emergency", ar: "طارئ" },
};

export function leadGradeLabel(grade: LeadGrade, locale: "en" | "ar"): string {
  return (LEAD_GRADE_LABELS[grade] ?? LEAD_GRADE_LABELS.bronze)[locale];
}

export function leadOfferNotification(
  offer: Pick<LeadOffer, "leadNumber" | "grade" | "priceCredits" | "matchScore">,
  kind: LeadNotificationKind
): LeadNotificationPayload {
  const gradeEn = leadGradeLabel(offer.grade, "en");
  const gradeAr = leadGradeLabel(offer.grade, "ar");
  switch (kind) {
    case "lead-offer":
      return {
        type: "lead",
        titleEn: `New ${gradeEn} lead: ${offer.leadNumber}`,
        titleAr: `عميل محتمل ${gradeAr}: ${offer.leadNumber}`,
        bodyEn: `A ${gradeEn.toLowerCase()} lead matched your profile (match ${offer.matchScore}/100). Unlock the customer's details for ${offer.priceCredits} credits before it expires.`,
        bodyAr: `طابق ملفك عميل محتمل ${gradeAr} (مطابقة ${offer.matchScore}/100). افتح بيانات العميل مقابل ${offer.priceCredits} رصيد قبل انتهاء المدة.`,
        href: LEAD_BOARD_HREF,
      };
    case "lead-offer-lost":
      return {
        type: "lead",
        titleEn: `Lead ${offer.leadNumber} was taken`,
        titleAr: `تم أخذ العميل المحتمل ${offer.leadNumber}`,
        bodyEn: `Another professional bought ${offer.leadNumber} exclusively, so your offer was withdrawn. New leads are matched daily.`,
        bodyAr: `اشترى محترف آخر ${offer.leadNumber} بشكل حصري، لذا سُحب عرضك. تُطابق عملاء محتملون جدد يومياً.`,
        href: LEAD_BOARD_HREF,
      };
    case "lead-offer-expired":
      return {
        type: "lead",
        titleEn: `Lead ${offer.leadNumber} expired`,
        titleAr: `انتهت مدة العميل المحتمل ${offer.leadNumber}`,
        bodyEn: `The window to unlock ${offer.leadNumber} closed before you bought it.`,
        bodyAr: `أُغلقت نافذة فتح ${offer.leadNumber} قبل شرائه.`,
        href: LEAD_BOARD_HREF,
      };
  }
}
