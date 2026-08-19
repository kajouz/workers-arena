import { daysUntil, dueReminderWindow, REMINDER_WINDOW_DAYS, subscriptionStatus } from "@/lib/data/subscriptions";
import { getNotifications, inboxAdapterMode, pushNotification, seededReminderId } from "@/lib/data/notifications";
import { demoGetAllBookings } from "@/lib/data/bookings";
import { bookingNotification, type BookingNotificationPayload } from "@/lib/data/booking-notifications";
import { WORKERS } from "@/lib/data/workers";
import { BOOKING_REMINDER_WINDOW_MS, type Booking, type Notification } from "@/lib/data/types";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REMINDER ENGINES
 * ────────────────────────────────────────────────────────────────────────────
 * Two scans, one cron endpoint (/api/cron/reminders):
 *
 *  • Subscription expiry — every worker due for:
 *      7 / 3 / 1 day before expiry → "renews soon" reminder (email + push + inbox)
 *      expired                       → "profile hidden" alert + admin awareness
 *    Sent once per process (keyed by worker + window).
 *
 *  • Booking "job starts tomorrow" (M4) — CONFIRMED bookings starting within
 *    the next 24h notify the customer. Idempotency follows the schema's
 *    lastReminderSent pattern: demo mode dedupes per process (keyed by booking
 *    id); prisma mode persists a `lastReminderSent` stamp on the Booking row,
 *    claimed with a compare-and-swap so overlapping cron invocations can never
 *    double-send.
 *
 * Invoke via the cron endpoint (/api/cron/reminders) or the scheduler of your
 * choice (docs/ARCHITECTURE.md).
 * ────────────────────────────────────────────────────────────────────────────
 */

const REMINDER_TYPE = "subscription" as const;

function buildReminder(
  w: (typeof WORKERS)[number],
  kind: "reminder" | "expired",
  days?: (typeof REMINDER_WINDOW_DAYS)[number]
): Omit<Notification, "id" | "time" | "read"> {
  if (kind === "expired") {
    return {
      type: REMINDER_TYPE,
      titleEn: "Subscription expired",
      titleAr: "انتهى الاشتراك",
      bodyEn: `${w.nameEn} — your profile is hidden from search results until you renew.`,
      bodyAr: `${w.nameAr} — ملفك مخفي من نتائج البحث حتى التجديد.`,
      href: "/dashboard",
    };
  }
  const d = days!;
  return {
    type: REMINDER_TYPE,
    titleEn: `Subscription renews in ${d} day${d === 1 ? "" : "s"}`,
    titleAr: `الاشتراك يتجدد خلال ${d} ${d === 1 ? "يوم" : "أيام"}`,
    bodyEn: `${w.nameEn} — renew to stay visible in search results.`,
    bodyAr: `${w.nameAr} — جدّد لتبقى ظاهراً في نتائج البحث.`,
    href: "/dashboard",
  };
}

/** Dedupe key → worker + window, so a cron re-run never double-sends. */
const sentKeys = new Set<string>();

/** Booking reminder dedupe (demo mode only — prisma persists the stamp). */
const bookingSentKeys = new Set<string>();

export interface BookingReminderRun {
  dispatched: number;
  alreadySent: number;
  total: number;
}

export interface ReminderRun {
  dispatched: number;
  alreadySent: number;
  total: number;
  /** M4 — "job starts tomorrow" reminders for CONFIRMED bookings. */
  bookings: BookingReminderRun;
}

/** Which workers are due a reminder right now (pure, deterministic). */
export function workersDueReminders(): { worker: (typeof WORKERS)[number]; key: string; kind: "reminder" | "expired"; days: number }[] {
  const due: { worker: (typeof WORKERS)[number]; key: string; kind: "reminder" | "expired"; days: number }[] = [];
  for (const w of WORKERS) {
    const status = subscriptionStatus(w.subscription);
    const days = daysUntil(w.subscription.expiresAt);
    if (status === "expired") {
      due.push({ worker: w, key: `expired:${w.id}`, kind: "expired", days });
    } else {
      const window = dueReminderWindow(w.subscription);
      if (window !== null) {
        due.push({ worker: w, key: `reminder:${w.id}:${window}`, kind: "reminder", days: window });
      }
    }
  }
  return due;
}

/**
 * Dispatch all currently-due reminders. Deduped per process; safe to call from
 * a cron job every hour.
 */
export async function runDueReminderEngine(): Promise<ReminderRun> {
  const due = workersDueReminders();
  let dispatched = 0;
  let alreadySent = 0;

  for (const { worker: w, key, kind, days } of due) {
    if (sentKeys.has(key)) {
      alreadySent += 1;
      continue;
    }
    sentKeys.add(key);
    // The demo seed already places one in-app reminder per due worker; skip it
    // so the first cron run doesn't double the inbox (production: unique index
    // on prisma.notification (workerId, reminderWindow) enforces the same).
    const seededId = seededReminderId(kind, w.id, kind === "reminder" ? (days as (typeof REMINDER_WINDOW_DAYS)[number]) : undefined);
    if ((await getNotifications()).some((n) => n.id === seededId)) {
      alreadySent += 1;
      continue;
    }
    const message = buildReminder(w, kind, kind === "reminder" ? (days as (typeof REMINDER_WINDOW_DAYS)[number]) : undefined);
    // pushNotification persists to the inbox AND fans out to email/push channels.
    await pushNotification(message, {
      name: w.nameEn,
      email: w.email,
      phone: w.phone,
      locale: w.languages[0]?.code === "ar" ? "ar" : "en",
    });
    dispatched += 1;
  }

  // M4 — booking "job starts tomorrow" reminders run on the same cron tick.
  const bookings = await runBookingReminderEngine();

  return { dispatched, alreadySent, total: due.length, bookings };
}

/**
 * M4 — build the "job starts tomorrow" customer notification for a booking
 * (mirrors the bilingual style of the booking flow notifications in the
 * demo/prisma adapters). Deep-links to the customer's My Bookings page.
 */
/**
 * The booking reminder payload — delegated to the shared builder (same copy +
 * booking context the admin dispute view previews). Exported for tests to lock
 * that parity.
 */
export function buildBookingReminder(booking: Booking): BookingNotificationPayload {
  return bookingNotification(booking, "customer-reminder");
}

/** CONFIRMED bookings starting in (now, now+24h] — dual-adapter scan. */
async function bookingsDueForReminder(now: Date, windowEnd: Date): Promise<Booking[]> {
  if (inboxAdapterMode() === "prisma") {
    const { prismaGetBookingsDueForReminder } = await import("@/lib/data/prisma-repo");
    return prismaGetBookingsDueForReminder(now);
  }
  return demoGetAllBookings().filter((b) => {
    if (b.status !== "confirmed") return false;
    // A confirmed booking always has a slot; NaN (impossible) fails both bounds.
    const start = new Date(b.startAt ?? "").getTime();
    return start > now.getTime() && start <= windowEnd.getTime();
  });
}

/**
 * M4 — dispatch the "job starts tomorrow" reminders currently due.
 * Idempotent: demo mode dedupes per process; prisma mode claims each booking's
 * lastReminderSent stamp with a CAS BEFORE pushing, so a concurrent cron run
 * loses the claim and is counted as already-sent (best-effort — a crash after
 * the stamp loses the reminder rather than double-sending).
 */
export async function runBookingReminderEngine(now = new Date()): Promise<BookingReminderRun> {
  const due = await bookingsDueForReminder(now, new Date(now.getTime() + BOOKING_REMINDER_WINDOW_MS));
  let dispatched = 0;
  let alreadySent = 0;

  for (const booking of due) {
    if (bookingSentKeys.has(booking.id)) {
      alreadySent += 1;
      continue;
    }
    if (inboxAdapterMode() === "prisma") {
      const { prismaMarkBookingReminderSent } = await import("@/lib/data/prisma-repo");
      if (!(await prismaMarkBookingReminderSent(booking.id, now))) {
        alreadySent += 1;
        continue;
      }
    }
    bookingSentKeys.add(booking.id);
    await pushNotification(
      buildBookingReminder(booking),
      booking.customerEmail
        ? {
            name: booking.customerName,
            email: booking.customerEmail,
            phone: booking.customerPhone,
            // The customer's preferred language (booking.customerLocale — the
            // prisma adapter maps it from User.locale; demo defaults "en").
            locale: booking.customerLocale ?? "en",
          }
        : undefined
    );
    dispatched += 1;
  }

  return { dispatched, alreadySent, total: due.length };
}

/** Test helper: reset the per-process dedupe sets. */
export function resetReminderEngine(): void {
  sentKeys.clear();
  bookingSentKeys.clear();
}
