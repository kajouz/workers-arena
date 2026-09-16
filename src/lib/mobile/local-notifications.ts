/**
 * Local Notification Scheduler — booking reminders
 *
 * Schedules local notifications for upcoming bookings so workers don't miss
 * appointments. Only active on native platforms (Capacitor); on web, this
 * module is a no-op (the server-side push notification handles reminders).
 */

import { Capacitor } from "@capacitor/core";

export interface ScheduleReminderInput {
  /** Booking ID (used as notification identifier). */
  bookingId: string;
  /** Booking number (e.g. "BK-1001"). */
  bookingNumber: string;
  /** Customer name for the notification title. */
  customerName: string;
  /** Job title. */
  jobTitle: string;
  /** When the booking starts (ISO string). */
  startAt: string;
  /** Minutes before startAt to fire the reminder (default 30). */
  minutesBefore?: number;
}

/** Schedule a local reminder for an upcoming booking. */
export async function scheduleBookingReminder(
  input: ScheduleReminderInput
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    const perm = await LocalNotifications.requestPermissions();
    if (perm.display !== "granted") return false;

    const minutesBefore = input.minutesBefore ?? 30;
    const triggerDate = new Date(
      new Date(input.startAt).getTime() - minutesBefore * 60 * 1000
    );

    // Don't schedule if the reminder time is in the past.
    if (triggerDate.getTime() <= Date.now()) return false;

    await LocalNotifications.schedule({
      notifications: [
        {
          title: `Upcoming: ${input.jobTitle}`,
          body: `${input.customerName} — ${input.bookingNumber} starts in ${minutesBefore} minutes`,
          id: hashId(input.bookingId),
          schedule: { at: triggerDate },
          extra: {
            bookingId: input.bookingId,
            url: `/bookings/${input.bookingId}`,
          },
        },
      ],
    });

    return true;
  } catch {
    return false;
  }
}

/** Cancel a scheduled reminder for a booking. */
export async function cancelBookingReminder(bookingId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.cancel({ notifications: [{ id: hashId(bookingId) }] });
  } catch {
    // Best effort — don't throw.
  }
}

/** Cancel all scheduled reminders (e.g. on logout). */
export async function cancelAllReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length > 0) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  } catch {
    // Best effort.
  }
}

/**
 * Schedule reminders for a list of upcoming bookings.
 * Called once when the dashboard loads on native.
 */
export async function scheduleDashboardReminders(
  bookings: Array<{
    id: string;
    number: string;
    customerName: string;
    jobTitle: string;
    startAt?: string;
  }>
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const now = Date.now();
  for (const b of bookings) {
    if (!b.startAt) continue;
    const startTime = new Date(b.startAt).getTime();
    // Only schedule for bookings starting in the next 24 hours.
    if (startTime <= now || startTime > now + 24 * 60 * 60 * 1000) continue;

    await scheduleBookingReminder({
      bookingId: b.id,
      bookingNumber: b.number,
      customerName: b.customerName,
      jobTitle: b.jobTitle,
      startAt: b.startAt,
      minutesBefore: 30,
    });
  }
}

/**
 * Stable numeric ID from a booking string ID (local notifications require
 * integer IDs). Simple hash — collisions mean one notification replaces
 * another, which is acceptable for reminders.
 */
function hashId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
