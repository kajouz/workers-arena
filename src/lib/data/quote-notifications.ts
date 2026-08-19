import type { Booking, Notification } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * QUOTE NOTIFICATION PAYLOADS — multi-candidate quotes
 * (docs/multi-candidate-quotes.md §7)
 * ────────────────────────────────────────────────────────────────────────────
 * The quote auction's worker-facing messages: invite → bid submitted is
 * silent for the customer (the /bookings card shows bids) → winner
 * shortlisted / losers declined / window expired. All reuse EXISTING
 * notification types (bookingRequest / bookingConfirmed / bookingDeclined) —
 * no new Prisma NotificationType enum values — and deliberately carry NO
 * `booking` context (the email channel's booking-confirmation variant
 * renders slot rows, which slot-less quote bids don't have; these fall back
 * to the generic email template).
 * ────────────────────────────────────────────────────────────────────────────
 */

export type QuoteNotificationKind = "quote-invite" | "quote-winner" | "quote-loser" | "quote-expired";

/** A quote notification input ready for pushNotification (inbox-only + outbound). */
export type QuoteNotificationPayload = Omit<Notification, "id" | "time" | "read">;

/**
 * The locale-appropriate service label for the quote bodies: the catalog name
 * (serviceItem.nameEn/nameAr — quote bid bookings carry the bilingual item the
 * customer posted against) when present, else the free-text jobTitle
 * (user-typed, single-locale — rendered as-is in both languages). Mirrors the
 * booking-notifications serviceLabel rule so the AR email never shows the EN
 * free-text title inside an Arabic body.
 */
function serviceLabel(booking: Booking, locale: "en" | "ar"): string {
  if (booking.serviceItem) return locale === "ar" ? booking.serviceItem.nameAr : booking.serviceItem.nameEn;
  return booking.jobTitle ?? "";
}

/** Build the payload for a quote-flow event (single source of truth). */
export function quoteNotification(
  booking: Booking,
  kind: QuoteNotificationKind
): QuoteNotificationPayload {
  switch (kind) {
    case "quote-invite":
      return {
        type: "bookingRequest",
        titleEn: "You're invited to quote",
        titleAr: "أنت مدعو لتقديم عرض سعر",
        bodyEn: `${booking.customerName} invited you to quote on “${serviceLabel(booking, "en")}”.`,
        bodyAr: `دعاك ${booking.customerName} لتقديم عرض سعر على «${serviceLabel(booking, "ar")}».`,
        href: "/dashboard",
      };
    case "quote-winner":
      return {
        type: "bookingConfirmed",
        titleEn: "Your quote was chosen",
        titleAr: "تم اختيار عرضك",
        bodyEn: `The customer chose your quote for “${serviceLabel(booking, "en")}” — confirm the time to lock it in.`,
        bodyAr: `اختار العميل عرضك لـ «${serviceLabel(booking, "ar")}» — أكّد الموعد لتثبيته.`,
        href: "/dashboard",
      };
    case "quote-loser":
      return {
        type: "bookingDeclined",
        titleEn: "Another quote was chosen",
        titleAr: "تم اختيار عرض آخر",
        bodyEn: `The customer chose another quote for “${serviceLabel(booking, "en")}”. Your bid stays on your record.`,
        bodyAr: `اختار العميل عرضاً آخر لـ «${serviceLabel(booking, "ar")}». يبقى عرضك مسجلاً في سجلك.`,
        href: "/dashboard",
      };
    case "quote-expired":
      return {
        type: "bookingDeclined",
        titleEn: "Quote window closed",
        titleAr: "أُغلق باب العروض",
        bodyEn: `The window to quote on “${serviceLabel(booking, "en")}” closed before a pick was made.`,
        bodyAr: `أُغلق باب تقديم العروض على «${serviceLabel(booking, "ar")}» قبل الاختيار.`,
        href: "/dashboard",
      };
  }
}
