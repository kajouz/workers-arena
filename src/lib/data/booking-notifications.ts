import { bookingEmailContext } from "./booking-ui";
import type { Booking, BookingEmailContext, Notification } from "./types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * BOOKING NOTIFICATION PAYLOADS — single source of truth
 * ────────────────────────────────────────────────────────────────────────────
 * Every booking-lifecycle notification (request / confirmed / declined /
 * cancelled / paid / rescheduled / completed / reminder) is built here, so the
 * outbound copy the adapters dispatch and the copy the admin dispute view
 * PREVIEWS (renderBookingEmail) can never drift — the preview shows exactly
 * what the customer received. Kinds are split by recipient + event:
 * `worker-*` targets the worker (href /dashboard), `customer-*` the customer
 * (href /bookings).
 *
 * Also exports `customerEmailKind(booking)` — which customer-facing email the
 * booking's current state implies (or null when the customer received none) —
 * used by the dispute page to decide what to preview.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** A booking notification input ready for pushNotification. */
export type BookingNotificationPayload = Omit<Notification, "id" | "time" | "read"> & {
  booking: BookingEmailContext;
};

/**
 * Optional structured extras for a booking notification — currently the M4
 * deposit-refund context (minor units), threaded into BookingEmailContext.refund
 * so the email card can render the refunded amount + reason.
 */
export interface BookingNotificationOptions {
  refund?: { amount: number; reason?: string };
}

/** Worker-facing events (deep-link /dashboard). */
export type WorkerNotificationKind =
  | "worker-request"
  | "worker-cancelled"
  | "worker-rescheduled"
  | "worker-request-nudge"
  | "worker-completion-confirmed";

/** Customer-facing events (deep-link /bookings) — the kinds a preview can show. */
export type CustomerNotificationKind =
  | "customer-confirmed"
  | "customer-declined"
  | "customer-completed"
  | "customer-cancelled"
  | "customer-paid"
  | "customer-rescheduled"
  | "customer-refund"
  | "customer-recurring-visit"
  | "customer-request-expired"
  | "customer-completion-pending";

export type BookingNotificationKind = WorkerNotificationKind | CustomerNotificationKind | "customer-reminder";

/** Build the payload for a booking lifecycle event (single source of truth). */
export function bookingNotification(
  booking: Booking,
  kind: BookingNotificationKind,
  opts?: BookingNotificationOptions
): BookingNotificationPayload {
  const ctx = opts?.refund ? { ...bookingEmailContext(booking), refund: opts.refund } : bookingEmailContext(booking);
  const time = new Date(booking.startAt).toLocaleString();
  switch (kind) {
    case "worker-request":
      return {
        type: "bookingRequest",
        titleEn: "New booking request",
        titleAr: "طلب حجز جديد",
        bodyEn: `${booking.customerName} requested ${time} — review and respond.`,
        bodyAr: `${booking.customerName} طلب حجزاً في ${time} — راجِع الطلب وردّ.`,
        href: "/dashboard",
        booking: ctx,
      };
    case "customer-confirmed":
      return {
        type: "bookingConfirmed",
        titleEn: "Booking confirmed",
        titleAr: "تم تأكيد الحجز",
        bodyEn: `Your booking ${booking.number} is confirmed. The worker will reach out.`,
        bodyAr: `تم تأكيد حجزك ${booking.number}. سيتواصل معك العامل.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-declined":
      return {
        type: "bookingDeclined",
        titleEn: "Booking declined",
        titleAr: "تم رفض الحجز",
        bodyEn: `Unfortunately, your booking ${booking.number} was declined.`,
        bodyAr: `للأسف، تم رفض حجزك ${booking.number}.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-completed":
      return {
        type: "bookingCompleted",
        titleEn: "Job completed",
        titleAr: "اكتملت المهمة",
        bodyEn: `Your booking ${booking.number} is marked complete. Thanks for choosing the worker — a review helps the community.`,
        bodyAr: `تم اكتمال حجزك ${booking.number}. شكراً لاختيارك العامل — تقييمك يساعد المجتمع.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-cancelled":
      return {
        type: "bookingCancelled",
        titleEn: "Booking cancelled",
        titleAr: "تم إلغاء الحجز",
        bodyEn: `Your booking ${booking.number} was cancelled. The slot is free again.`,
        bodyAr: `تم إلغاء حجزك ${booking.number}. الموعد أصبح متاحاً.`,
        href: "/bookings",
        booking: ctx,
      };
    case "worker-cancelled":
      return {
        type: "bookingCancelled",
        titleEn: "Booking cancelled",
        titleAr: "تم إلغاء الحجز",
        bodyEn: `${booking.customerName} cancelled ${booking.number}. The slot is free again.`,
        bodyAr: `ألغى ${booking.customerName} الحجز ${booking.number}. الموعد أصبح متاحاً.`,
        href: "/dashboard",
        booking: ctx,
      };
    case "customer-paid":
      return {
        type: "bookingPaid",
        titleEn: "Payment received",
        titleAr: "تم استلام الدفع",
        bodyEn: `Payment for ${booking.number} received — your booking is confirmed.`,
        bodyAr: `تم استلام دفعة ${booking.number} — تم تأكيد حجزك.`,
        href: "/bookings",
        booking: ctx,
      };
    case "worker-rescheduled":
      return {
        type: "bookingRescheduled",
        titleEn: "Booking rescheduled",
        titleAr: "تم تغيير موعد الحجز",
        bodyEn: `${booking.customerName} moved ${booking.number} to a new time.`,
        bodyAr: `غيّر ${booking.customerName} موعد الحجز ${booking.number}.`,
        href: "/dashboard",
        booking: ctx,
      };
    case "customer-rescheduled":
      return {
        type: "bookingRescheduled",
        titleEn: "Booking rescheduled",
        titleAr: "تم تغيير موعد الحجز",
        bodyEn: `Your booking ${booking.number} was moved to a new time.`,
        bodyAr: `تم تغيير موعد حجزك ${booking.number}.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-reminder":
      return {
        type: "bookingReminder",
        titleEn: "Job starts tomorrow",
        titleAr: "الموعد غداً",
        bodyEn: `Your booking ${booking.number} (${booking.jobTitle}) starts tomorrow at ${time}. Be ready — the worker will reach out.`,
        bodyAr: `حجزك ${booking.number} (${booking.jobTitle}) يبدأ غداً في ${time}. كن جاهزاً — سيتواصل معك العامل.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-refund":
      // The amount + reason ride BookingEmailContext.refund (rendered as the
      // "Refunded" row in the email card); the body stays copy-light.
      return {
        type: "bookingRefund",
        titleEn: "Deposit refunded",
        titleAr: "تم استرداد الدفعة المقدمة",
        bodyEn: `Your deposit for ${booking.number} was refunded to your original payment method.`,
        bodyAr: `تم استرداد دفعتك المقدمة للحجز ${booking.number} إلى طريقة الدفع الأصلية.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-recurring-visit":
      // The cron (or, in demo mode, the accept-time materialization) scheduled
      // the contract's next visit — the date rides the body AND the email's
      // receipt card (BookingEmailContext.startAt renders the full date).
      return {
        type: "recurringVisitScheduled",
        titleEn: "Next visit scheduled",
        titleAr: "تم جدولة الزيارة القادمة",
        bodyEn: `Your next visit for ${booking.number} (${booking.jobTitle}) is scheduled for ${time}.`,
        bodyAr: `تمت جدولة زيارتك القادمة للحجز ${booking.number} (${booking.jobTitle}) في ${time}.`,
        href: "/bookings",
        booking: ctx,
      };
    case "customer-completion-pending":
      // §2.3 — the worker staged completion; the customer confirms (or the
      // grace cron auto-confirms), so fake-COMPLETED can't pollute the funnel.
      return {
        type: "bookingCompletionPending",
        titleEn: "Confirm job completion",
        titleAr: "أكّد إتمام المهمة",
        bodyEn: `The worker marked your job ${booking.number} done — confirm completion so the payout can be released.`,
        bodyAr: `أكمل العامل مهمتك ${booking.number} — أكّد الإتمام ليتم تحرير الدفعة.`,
        href: "/bookings",
        booking: ctx,
      };
    case "worker-completion-confirmed":
      return {
        type: "bookingCompletionConfirmed",
        titleEn: "Customer confirmed completion",
        titleAr: "أكّد العميل إتمام المهمة",
        bodyEn: `${booking.customerName} confirmed ${booking.number} is done — your payout is on its way.`,
        bodyAr: `أكّد ${booking.customerName} إتمام ${booking.number} — دفعتك في الطريق.`,
        href: "/dashboard",
        booking: ctx,
      };
    case "worker-request-nudge":
      // Request SLA (ENHANCEMENT-PLAN §2.2) — the cron nudges the worker that
      // a request has sat unanswered past the nudge window.
      return {
        type: "bookingRequestNudge",
        titleEn: "Booking request needs a response",
        titleAr: "طلب الحجز ينتظر ردّك",
        bodyEn: `${booking.customerName}'s request for ${time} is waiting — respond before it expires.`,
        bodyAr: `طلب ${booking.customerName} في ${time} ينتظر ردّك — ردّ قبل انتهائه.`,
        href: "/dashboard",
        booking: ctx,
      };
    case "customer-request-expired":
      // Request SLA — the worker never answered, the cron auto-cancelled the
      // request and freed the slot.
      return {
        type: "bookingRequestExpired",
        titleEn: "Booking request expired",
        titleAr: "انتهت صلاحية طلب الحجز",
        bodyEn: `Your request ${booking.number} for ${time} was closed — the worker didn't respond in time. The slot is free; try another worker.`,
        bodyAr: `أُغلق طلبك ${booking.number} في ${time} — لم يستجب العامل في الوقت المحدد. الموعد متاح؛ جرّب عاملاً آخر.`,
        href: "/bookings",
        booking: ctx,
      };
  }
}

/**
 * Which customer-facing email the booking's CURRENT state implies — the last
 * email the customer received (a deposit booking got "Booking confirmed" at
 * accept, then "Payment received" once the webhook flipped it to CONFIRMED).
 * Returns null when the customer received nothing yet (REQUESTED / NO_SHOW, or
 * a customer-initiated cancellation — that email went to the worker).
 *
 * Status-driven only: a cron reminder isn't tied to a status change, so a
 * just-reminded booking previews its confirmation email instead — the
 * approximation the dispute page documents.
 */
export function customerEmailKind(
  booking: Pick<Booking, "status" | "paymentId" | "events">
): CustomerNotificationKind | null {
  switch (booking.status) {
    case "completionPending":
      // The staged-completion prompt is a push, not an email — the customer
      // has received nothing yet (the receipt arrives on the confirmed flip).
      return null;
    case "completed": {
      const last = [...booking.events].reverse().find((e) => e.status === "completed");
      // Customer-confirmed completions email the WORKER — the customer got
      // nothing; worker/system (legacy + auto-confirm) flips email the customer.
      return last?.actorType === "customer" ? null : "customer-completed";
    }
    case "declined":
      return "customer-declined";
    case "cancelled": {
      const last = [...booking.events].reverse().find((e) => e.status === "cancelled");
      // Customer-initiated cancels email the WORKER — the customer got nothing.
      return last?.actorType === "customer" ? null : "customer-cancelled";
    }
    case "pendingPayment":
    case "confirmed":
    case "inProgress":
      return booking.paymentId ? "customer-paid" : "customer-confirmed";
    default:
      return null; // requested / noShow
  }
}
