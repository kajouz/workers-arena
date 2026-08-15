import { dictionaries, translate, type Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/config";
import type { Booking } from "./types";
import { auditActorLabel, auditStatusLabel } from "./booking-print";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ADMIN BOOKING-TRAILS CSV (docs/ENHANCEMENT-PLAN.md §2.4)
 * ────────────────────────────────────────────────────────────────────────────
 * The flat-table twin of the printable audit document: every BookingEvent of
 * EVERY booking becomes one row, prefixed with the booking's facts (number,
 * job, worker, customer, current status) so each row stands alone — exactly
 * the story the per-booking print view tells, in spreadsheet form.
 *
 *   • One row per event, sorted by booking number then event time;
 *   • bookings with NO events still emit one row (facts + empty event
 *     columns) so nothing disappears from the export;
 *   • RFC-4180 quoting, CRLF line endings, UTF-8 BOM (so Excel renders the
 *     Arabic labels/values correctly);
 *   • labels resolved through the same dictionaries the print document uses.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** RFC-4180: quote a field when it contains a comma, quote, CR or LF. */
function csvField(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildBookingTrailsCsv(
  bookings: Booking[],
  opts: { locale: Locale; workerNames?: Record<string, string> }
): string {
  const { locale, workerNames = {} } = opts;
  const dict: Dictionary = dictionaries[locale];
  const t = (key: string) => translate(dict, key);

  const header = [
    t("booking.bookingNumber"), // Booking
    t("booking.disputeJob"), // Job
    t("booking.disputeWorker"), // Worker
    t("booking.disputeCustomer"), // Customer
    t("booking.printStatus"), // Status (current)
    "#",
    t("booking.printTime"), // Time
    t("booking.printStatus"), // Status (event)
    t("booking.printActor"), // Actor
    t("booking.printReason"), // Reason
  ];

  const sorted = [...bookings].sort((a, b) => a.number.localeCompare(b.number));
  const rows: string[] = [header.map(csvField).join(",")];
  for (const b of sorted) {
    const facts = [
      b.number,
      b.jobTitle,
      workerNames[b.workerId] ?? b.workerId,
      [b.customerName, b.customerPhone, b.customerEmail].filter(Boolean).join(" · "),
      t(`booking.status.${b.status}`),
    ];
    const events = b.events.length > 0 ? b.events : null;
    if (!events) {
      // Event-less booking — one row with the facts and empty event columns.
      rows.push([...facts, "", "", "", "", ""].map(csvField).join(","));
      continue;
    }
    events.forEach((e, i) => {
      rows.push(
        [...facts, String(i + 1), auditStatusLabel(dict, e.status), auditActorLabel(dict, e.actorType), e.reason ?? ""]
          .map(csvField)
          .join(",")
      );
    });
  }
  // UTF-8 BOM so Excel detects UTF-8 (Arabic labels) instead of guessing.
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
