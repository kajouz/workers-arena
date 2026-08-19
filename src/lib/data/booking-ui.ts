import type { Booking, BookingEmailContext, BookingSlot } from "./types";

/**
 * Pure helpers for the booking slot picker — kept free of React so the
 * grouping/labeling logic is unit-testable in the node test env (repo style).
 */

/** YYYY-MM-DD key of a slot's local start date. */
/**
 * WhatsApp deep-link fallback for the booking chat (docs/ENHANCEMENT-PLAN.md
 * §2.3): `https://wa.me/<digits>?text=<encoded>` so a party can continue the
 * negotiation off-platform without losing the booking context. Digits are
 * stripped to international form (no +, spaces, dashes — the wa.me format),
 * and the prefilled text is URL-encoded. The text is the localized handoff
 * line the component builds (booking number + job title included), so the
 * other party knows exactly which booking the message is about.
 */
export function buildWhatsappChatLink(digits: string, text: string): string {
  const clean = digits.replace(/[^\d]/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export function slotDayKey(startAt: string): string {
  const d = new Date(startAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Group slots by local day, chronological. Each group keeps its sorted slots.
 * Returns the same slot objects (no copying) so callers can render directly.
 */
export function groupSlotsByDay(slots: BookingSlot[]): { dayKey: string; slots: BookingSlot[] }[] {
  const map = new Map<string, BookingSlot[]>();
  for (const slot of slots) {
    const key = slotDayKey(slot.startAt);
    const list = map.get(key);
    if (list) list.push(slot);
    else map.set(key, [slot]);
  }
  return [...map.entries()]
    .map(([dayKey, list]) => ({ dayKey, slots: list.sort((a, b) => a.startAt.localeCompare(b.startAt)) }))
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}

/** Localized HH:MM (24h) from an ISO timestamp. */
function hourMinute(iso: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "09:00 – 10:00" time-range label for a slot chip. Slot-less bookings
 * (multi-candidate quote bids — startAt/endAt undefined) return an empty
 * string so callers can hide the range instead of rendering "Invalid Date". */
export function formatSlotRange(slot: { startAt?: string; endAt?: string }, locale: "en" | "ar"): string {
  if (!slot.startAt || !slot.endAt) return "";
  return `${hourMinute(slot.startAt, locale)} – ${hourMinute(slot.endAt, locale)}`;
}

/**
 * The structured booking context attached to outbound notification payloads
 * (ChannelPayload.booking) — quote/deposit pass through in minor units as-is.
 * Shared by both booking adapters so the confirmation email always carries the
 * same booking number/slot the feed and funnel reference.
 */
export function bookingEmailContext(
  booking: Pick<
    Booking,
    "number" | "startAt" | "endAt" | "quote" | "deposit" | "currency" | "jobTitle" | "serviceItem" | "platformFee" | "events"
  >
): BookingEmailContext {
  return {
    number: booking.number,
    // Slot-less quote bids fall back to the creation (first-event) time — the
    // email's "Date & time" row never renders an Invalid Date.
    startAt: booking.startAt ?? booking.events[0]?.time ?? "",
    endAt: booking.endAt ?? booking.events[0]?.time ?? "",
    quote: booking.quote,
    deposit: booking.deposit,
    currency: booking.currency,
    jobTitle: booking.jobTitle,
    serviceItem: booking.serviceItem,
    // M5 — the fee snapshot rides the payload so the receipt matches the row.
    platformFee: booking.platformFee,
  };
}

/**
 * Relative day label: "Today" / "Tomorrow" / plain weekday (local time).
 * Callers resolve "today"/"tomorrow" via t(); weekdays come from the shared
 * DAYS arrays using the returned weekday index.
 */
export function dayLabel(
  startAt: string,
  today = new Date()
): { kind: "today" | "tomorrow" | "weekday"; weekday: number } {
  const d = new Date(startAt);
  const todayKey = slotDayKey(today.toISOString());
  const dKey = slotDayKey(startAt);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = slotDayKey(tomorrow.toISOString());

  if (dKey === todayKey) return { kind: "today", weekday: d.getDay() };
  if (dKey === tomorrowKey) return { kind: "tomorrow", weekday: d.getDay() };
  return { kind: "weekday", weekday: d.getDay() };
}

/** Full short date (e.g. "Mon, Aug 12") for weekday headers. */
export function formatDayDate(startAt: string, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(startAt));
}

/**
 * The next `count` day keys (YYYY-MM-DD) starting today — used by the
 * availability editor so closed/empty days still render (with "Closed").
 */
export function nextDayKeys(count = 7, today = new Date()): string[] {
  const keys: string[] = [];
  const walk = new Date(today);
  walk.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    keys.push(slotDayKey(walk.toISOString()));
    walk.setDate(walk.getDate() + 1);
  }
  return keys;
}

/**
 * Share of answered bookings, 0–100 rounded, null when there is no history.
 * Extracted from computeResponseRate so the prisma adapter (which tallies via
 * a groupBy, not a booking list) uses the SAME rounding without drift.
 */
export function responseRateFromCounts(answered: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((answered / total) * 100);
}

/**
 * Worker response rate — the share of a worker's bookings they've answered.
 * Anything past REQUESTED counts (accepted, declined, cancelled…), so a
 * booking waiting for a decision keeps the rate down until the worker
 * responds. Returns null when there is no history yet (dashboard shows "—").
 * Pure — feeds the dashboard stat card (docs/booking-scheduling.md §6) and
 * the W1 customer-facing response-rate signal (ENHANCEMENT-PLAN §2.1).
 * Lives here (not in the server-only bookings adapter) so client components
 * can import it without dragging the notifications/fs module graph in.
 */
export function computeResponseRate(bookings: Pick<Booking, "status">[]): number | null {
  return responseRateFromCounts(
    bookings.filter((b) => b.status !== "requested").length,
    bookings.length
  );
}

/**
 * M5 take rate (docs/booking-take-rate.md §1) — the platform's cut of a
 * quoted booking, snapshot ONCE at accept-with-quote (never recomputed from a
 * later rate change). Shared by both adapters so demo and DB can never drift.
 */
export const PLATFORM_FEE_RATE_BPS = 700; // 7.0% take rate
/** Floor, minor units (SAR 5 / $5). */
export const PLATFORM_FEE_MIN_MINOR = 500;
/** Cap per job, minor units (SAR 300 / $300). */
export const PLATFORM_FEE_MAX_MINOR = 30_000;
/** Subscription plans that waive the platform fee (BUSINESS-MODEL §5.2). */
export const FEE_EXEMPT_PLANS: readonly string[] = ["enterprise"];

/** True when a subscription plan waives the platform fee (case-insensitive —
 * the prisma side passes the DB enum, e.g. "ENTERPRISE"). */
export function isPlanFeeExempt(plan?: string): boolean {
  return Boolean(plan && FEE_EXEMPT_PLANS.includes(plan.toLowerCase()));
}

/**
 * M5 — the platform fee on a quote (minor units): round-half-up percentage,
 * then clamped to [MIN, MAX]. Zero for an exempt plan, a non-finite quote, or
 * a non-positive quote. Pure — the RespondDialog preview and both adapters
 * call the SAME function, so what the worker sees is exactly what is stored.
 */
export function computePlatformFee(
  quoteMinor: number,
  opts: { exempt?: boolean } = {}
): number {
  if (opts.exempt || !Number.isFinite(quoteMinor) || quoteMinor <= 0) return 0;
  const raw = Math.round((quoteMinor * PLATFORM_FEE_RATE_BPS) / 10_000);
  return Math.min(Math.max(raw, PLATFORM_FEE_MIN_MINOR), PLATFORM_FEE_MAX_MINOR);
}

/** The "this week" window used by hasFreeSlotsThisWeek (7 days from now). */
export const AVAILABLE_WINDOW_DAYS = 7;

/**
 * W1 "free this week" signal — true when any AVAILABLE slot starts within the
 * next 7 days (docs/ENHANCEMENT-PLAN.md §2.1). Pure: the prisma adapter
 * mirrors the same window in its batched slot query, so the demo and DB
 * answers can never drift. NaN-safe (an unparsable startAt is skipped).
 */
export function hasFreeSlotsThisWeek(
  slots: Pick<BookingSlot, "status" | "startAt">[],
  now = new Date()
): boolean {
  const start = now.getTime();
  const end = start + AVAILABLE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return slots.some((s) => {
    if (s.status !== "available") return false;
    const t = Date.parse(s.startAt);
    return Number.isFinite(t) && t >= start && t <= end;
  });
}

/**
 * Bucket a worker's bookings into the dashboard panel tabs
 * (docs/booking-scheduling.md §6): Requests = waiting on the worker;
 * Upcoming = accepted/scheduled; Past = finished or voided.
 */
export function bucketBookings(bookings: Booking[]): {
  requests: Booking[];
  upcoming: Booking[];
  past: Booking[];
} {
  const requests: Booking[] = [];
  const upcoming: Booking[] = [];
  const past: Booking[] = [];
  for (const b of bookings) {
    // Multi-candidate quotes: QUOTING/QUOTED bids land in Requests — the
    // worker must act (submit a quote, or wait for the customer's pick).
    if (b.status === "requested" || b.status === "quoting" || b.status === "quoted") requests.push(b);
    else if (b.status === "pendingPayment" || b.status === "confirmed" || b.status === "inProgress") upcoming.push(b);
    // §2.3 — a staged completion (awaiting the customer's confirm) is a past
    // slot; it lands in the Past tab with an "Awaiting confirmation" badge.
    else past.push(b); // completionPending, completed, cancelled, declined, noShow
  }
  // Newest first within each tab, regardless of input order. Slot-less quote
  // bids sort by their creation (first-event) time instead.
  const key = (b: Booking) => b.startAt ?? b.events[0]?.time ?? "";
  const byNewest = (a: Booking, b: Booking) => key(b).localeCompare(key(a));
  return {
    requests: requests.sort(byNewest),
    upcoming: upcoming.sort(byNewest),
    past: past.sort(byNewest),
  };
}
