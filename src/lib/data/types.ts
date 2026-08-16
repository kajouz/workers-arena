import type { CurrencyCode } from "@/lib/utils";

/**
 * Payment method domain values (mirror of the provider seam's
 * PaymentProviderMethod, lowercase). "stripe" / "simulated" are the hosted
 * checkouts; "omt" / "whish" are the MANUAL Lebanon-first money-movers
 * (docs/PAYMENTS.md) — no webhook, the customer pays offline and an admin
 * confirms receipt from the /admin pending-payments card.
 */
export type PaymentMethod = "stripe" | "simulated" | "omt" | "whish";

/** Map a provider-method string (e.g. "OMT", "BANK_TRANSFER") to the domain
 * PaymentMethod — unknown/legacy values default to "stripe". Shared by the
 * demo + prisma adapters so the mapping can never drift. */
export function toDomainPaymentMethod(method?: string | null): PaymentMethod | undefined {
  switch ((method ?? "").toUpperCase()) {
    case "OMT":
      return "omt";
    case "WHISH":
      return "whish";
    case "SIMULATED":
      return "simulated";
    default:
      return "stripe";
  }
}

/** The paid-upgrade scopes a manual payment can confirm (docs/BUSINESS-MODEL.md
 * §5.1 — the revenue-first levers that need no Stripe): a worker pays via
 * OMT/Whish and the admin's confirm flips the purchased capability live. */
export type PurchaseScope = "subscription" | "verification" | "featured" | "emergency";

/**
 * Booking reminder window (M4): a CONFIRMED booking whose start is within the
 * next 24h is due the "job starts tomorrow" notification. Shared by the demo
 * engine filter and the prisma query so the two adapters can never drift.
 */
export const BOOKING_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * M4 cancellation policy window (decision §8.4): how long before startAt a
 * WORKER cancel still refunds the paid deposit. Cancelling MORE than this far
 * ahead gets a full refund; within the window the deposit is kept (the slot
 * could no longer be re-sold in time). Customer and system cancels always
 * refund — the worker didn't bail. Tune this single constant to change the
 * policy; shared by the demo + prisma adapters so they can never drift.
 */
export const BOOKING_CANCEL_REFUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Request SLA (ENHANCEMENT-PLAN §2.2) — a REQUESTED booking the worker hasn't
 * answered is NUDGED after BOOKING_SLA_NUDGE_HOURS and AUTO-EXPIRED (slot
 * freed, request closed) after BOOKING_SLA_EXPIRE_HOURS. Tune these two
 * constants to change the policy; shared by the demo + prisma adapters and
 * the cron engine so copy and logic can never drift.
 */
export const BOOKING_SLA_NUDGE_HOURS = 24;
export const BOOKING_SLA_EXPIRE_HOURS = 48;

/** Request SLA — has a request sat unresponded past the worker-nudge window? */
export function slaNudgeDue(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= BOOKING_SLA_NUDGE_HOURS * 60 * 60 * 1000;
}

/** Request SLA — has a request sat unresponded past the auto-expire window? */
export function slaExpireDue(createdAtMs: number, nowMs: number): boolean {
  return nowMs - createdAtMs >= BOOKING_SLA_EXPIRE_HOURS * 60 * 60 * 1000;
}

/**
 * §2.2 — when a REQUESTED booking auto-expires (creation + the expire window).
 * Creation time is the first audit event (the demo store has no column); a
 * booking without one falls back to its slot start. Shared by the demo + prisma
 * adapters and the UI countdown, so copy and logic can never drift.
 */
export function requestSlaExpiryMs(booking: Pick<Booking, "events" | "startAt">): number {
  const created = Date.parse(booking.events[0]?.time ?? "");
  const createdMs = Number.isNaN(created) ? Date.parse(booking.startAt ?? "") : created;
  return createdMs + BOOKING_SLA_EXPIRE_HOURS * 60 * 60 * 1000;
}

/** Result of one Request-SLA cron pass (both adapters return this shape). */
export interface RequestSlaRun {
  /** Workers nudged (request unanswered past the nudge window). */
  nudged: number;
  /** Requests auto-cancelled (unanswered past the expire window). */
  expired: number;
  /** REQUESTED bookings scanned this run. */
  scanned: number;
  /** Numbers of the bookings auto-expired this run (feed logging). */
  expiredNumbers: string[];
}

/**
 * M4 cancellation policy — should a cancelled booking's paid deposit be
 * refunded? A worker cancel refunds only when it lands more than
 * BOOKING_CANCEL_REFUND_WINDOW_MS before startAt (the strict `>` keeps the
 * deposit at exactly the window edge); customer and system cancels always
 * refund. Shared by both adapters — the single place the policy lives.
 */
export function bookingCancelRefundDue(
  booking: Pick<Booking, "startAt">,
  cancelledAt: Date,
  by: BookingCancelInput["by"]
): boolean {
  if (by !== "worker") return true;
  // Slot-less quote bids never hold a deposit refund decision — only the
  // winner (slot-bound) can be cancelled; the empty string keeps Date.parse
  // NaN-safe for the impossible call.
  return new Date(booking.startAt ?? "").getTime() - cancelledAt.getTime() > BOOKING_CANCEL_REFUND_WINDOW_MS;
}

/**
 * M3 invoice numbering — `WA-YYYY-NNNNN` (docs/PAYMENTS.md flow step 5): the
 * year, then a zero-padded 5-digit sequence that restarts per year. Shared by
 * the demo + prisma adapters so invoice numbers can never drift apart.
 */
export function formatInvoiceNumber(year: number, seq: number): string {
  return `WA-${year}-${String(seq).padStart(5, "0")}`;
}

/**
 * Multi-candidate quotes (docs/multi-candidate-quotes.md) — how many workers a
 * customer may invite to quote one job. The single source of truth both
 * adapters and the UI enforce.
 */
export const MAX_QUOTE_WORKERS = 3;

/**
 * Multi-candidate quotes — how long a quote request stays open before the SLA
 * cron auto-expires it (expiresAt = creation + QUOTE_SLA_MS; open bids are
 * DECLINED by the system). Shared by the demo + prisma adapters and the cron.
 */
export const QUOTE_SLA_MS = 48 * 60 * 60 * 1000;

/**
 * Quote-request numbering — `QR-YYYY-NNNNN` (docs/multi-candidate-quotes.md):
 * the year, then a zero-padded 5-digit sequence that restarts per year
 * (mirrors formatInvoiceNumber). Shared by the demo + prisma adapters so quote
 * numbers can never drift apart.
 */
export function formatQuoteNumber(year: number, seq: number): string {
  return `QR-${year}-${String(seq).padStart(5, "0")}`;
}

/** Lifecycle of a multi-candidate quote request (mirrors prisma `QuoteStatus`). */
export type QuoteStatus = "open" | "quoting" | "selected" | "expired" | "cancelled";

/**
 * A customer's job post that up to MAX_QUOTE_WORKERS workers bid on
 * (docs/multi-candidate-quotes.md). The invited workers ARE its `bookings` —
 * one Booking per worker, status quoting/quoted, slot-less until the winner
 * is picked. Mirrors the prisma `QuoteRequest` model.
 */
export interface QuoteRequest {
  id: string;
  number: string; // QR-YYYY-NNNNN
  /** The signed-in customer's user id — null for guest (phone-keyed) jobs. */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  jobTitle: string;
  note?: string;
  serviceItem?: ServiceItem;
  categorySlug: string;
  citySlug: string;
  status: QuoteStatus;
  /** QUOTE_SLA_MS after creation — the SLA cron clears it. */
  expiresAt?: string; // ISO
  createdAt: string; // ISO
  /** The invited workers' bookings (1..MAX_QUOTE_WORKERS) — the bids. */
  bookings: Booking[];
}

/** Customer-side input for creating a multi-candidate quote request. */
export interface QuoteRequestInput {
  /** The signed-in customer's user id — omit for guest (phone-keyed) jobs. */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  jobTitle: string;
  note?: string;
  serviceItem?: ServiceItem;
  categorySlug: string;
  citySlug: string;
}

/** Worker-side bid on a quote invite (docs/multi-candidate-quotes.md rule 3 —
 * bids are NOT commitments: no slot is claimed, no slot status flips). */
export interface QuoteBidInput {
  /** Price for the job — minor units. */
  quote: number;
  /** Optional required upfront payment — minor units. */
  deposit?: number;
}

/**
 * A booking's receipt (M3): created at payment-confirm time for signed-in
 * customers only (guest bookings have no account to attach it to). Mirrors
 * the prisma `Invoice` row for the booking case.
 */
export interface BookingInvoice {
  number: string; // WA-YYYY-NNNNN
  amount: number; // minor units
  currency: CurrencyCode;
  status: "paid"; // generated when the payment lands
  date: string; // ISO
}

export interface Category {
  slug: string;
  nameEn: string;
  nameAr: string;
  professionEn: string; // e.g. "plumber" (used in bios: "a plumber with…")
  professionAr: string; // e.g. "سباك"
  icon: string; // lucide icon name
  taglineEn: string;
  taglineAr: string;
  hue: number; // brand gradient hue for covers
  workerCount: number;
}

export interface Area {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export interface City {
  slug: string;
  nameEn: string;
  nameAr: string;
  countryEn: string;
  countryAr: string;
  currency: CurrencyCode;
  lat: number;
  lng: number;
  areas: Area[];
}

export interface ServiceItem {
  nameEn: string;
  nameAr: string;
  price: number;
  unit: "hour" | "job";
}

export interface Certification {
  nameEn: string;
  nameAr: string;
  issuerEn: string;
  issuerAr: string;
  year: number;
}

export interface WorkingDay {
  day: number; // 0 = Sunday … 6 = Saturday
  open: string;
  close: string;
  closed?: boolean;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  date: string; // ISO
  textEn: string;
  textAr: string;
  verifiedPurchase?: boolean;
}

export interface PortfolioItem {
  titleEn: string;
  titleAr: string;
  hue: number;
}

export type SubscriptionPlan = "basic" | "professional" | "premium" | "enterprise";

/** Billing period for worker subscriptions — annual = 10 paid months for 12. */
export type BillingPeriod = "monthly" | "annual";

export type SubscriptionStatus = "active" | "expiring" | "expired";

export interface Subscription {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: string; // ISO
  expiresAt: string; // ISO
  price: number; // USD — per the billing period (monthly or annual)
  invoiceNo: string;
  /** Billing period in force — undefined on seeded rows (treated as monthly). */
  period?: BillingPeriod;
}

export type VerificationStatus = "verified" | "pending" | "rejected";

/**
 * Booking lifecycle (mirrors the prisma `BookingStatus` enum, lowercased).
 * REQUESTED → worker responds → CONFIRMED (or PENDING_PAYMENT when a deposit
 * is required) → IN_PROGRESS → COMPLETED. Terminal: CANCELLED / DECLINED / NO_SHOW.
 */
export type BookingStatus =
  | "requested"
  | "quoting" // multi-candidate quotes — invited to quote, bid not submitted
  | "quoted" // multi-candidate quotes — the worker's bid is in, awaiting the pick
  | "pendingPayment"
  | "confirmed"
  | "inProgress"
  | "completionPending" // §2.3 — worker staged completion, awaiting customer confirmation
  | "completed"
  | "cancelled"
  | "declined"
  | "noShow"
  | "rescheduled" // audit-event only — the booking moved to a new slot (M4)
  | "message" // audit-event only — a chat message was sent on the booking's thread (§2.3)
  | "refunded"; // audit-event only — an admin refunded the paid deposit (the booking itself is unchanged)

/** Concrete slot state (mirrors the prisma `SlotStatus` enum, lowercased). */
export type SlotStatus = "available" | "reserved" | "booked" | "blocked";

/** Append-only audit trail entry per booking (mirrors prisma `BookingEvent`). */
export interface BookingEvent {
  status: BookingStatus;
  /** "customer" | "worker" | "system" | "admin" — who caused the transition. */
  actorType: string;
  /** Optional id of the acting user (customerId / worker id). */
  actorId?: string;
  reason?: string;
  time: string; // ISO
}

/**
 * One message in the customer ⇄ worker negotiation thread keyed on the booking
 * (docs/ENHANCEMENT-PLAN.md §2.3). Actor-stamped like an audit entry, so the
 * negotiation lives inside the booking's record — the same thread all three
 * surfaces (customer row, worker row, admin dispute view) render.
 */
export interface BookingMessage {
  id: string;
  bookingId: string;
  /** "customer" | "worker" | "admin" — who wrote it. */
  senderRole: string;
  /** Optional real user id of the sender (admin decisions stamp the FK). */
  senderId?: string;
  text: string;
  /** Optional in-thread quote — minor units (a price shared during negotiation). */
  quote?: number;
  /** Read receipt — when the OTHER party saw this message (null until then). */
  readAt?: string; // ISO
  time: string; // ISO
}

/** Worker-side input for appending a message to a booking thread. */
export interface BookingMessageInput {
  senderRole: "customer" | "worker" | "admin";
  senderId?: string;
  text: string;
  /** Minor units — the price the worker shares in-thread (quote sharing). */
  quote?: number;
}

/** A concrete, calendared time range (UTC) for a worker (mirrors BookingSlot). */
export interface BookingSlot {
  id: string;
  workerId: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: SlotStatus;
  note?: string;
  /** The booking that claims this slot (RESERVED/BOOKED only). */
  bookingId?: string;
}

/** A booking request + its lifecycle (mirrors the prisma `Booking` model). */
export interface Booking {
  id: string;
  number: string; // human-readable, e.g. "BK-1002"
  workerId: string;
  /** The signed-in customer's user id — null for guest (phone-keyed) bookings. */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  jobTitle: string;
  note?: string;
  serviceItem?: ServiceItem;
  /**
   * ISO start/end of the slot. UNDEFINED for slot-less multi-candidate quote
   * bids (status quoting/quoted — docs/multi-candidate-quotes.md): the winner
   * gets a slot when the customer picks, everyone else stays slot-less.
   */
  startAt?: string; // ISO
  endAt?: string; // ISO
  status: BookingStatus;
  quote?: number; // minor units
  deposit?: number; // minor units
  /** Multi-candidate quotes — the QuoteRequest this booking bids on (null for
   * single-candidate bookings). */
  quoteRequestId?: string;
  /**
   * M5 take rate (docs/booking-take-rate.md) — the platform-fee snapshot at
   * accept-with-quote (minor units). Set whenever a quoted accept lands;
   * NEVER recomputed from a later rate change. Exempt plans store 0 (with the
   * rate still recorded below) so the UI can show "fee waived".
   */
  platformFee?: number;
  /** The take-rate basis points in force when platformFee was set (audit). */
  platformFeeRateBps?: number;
  currency: CurrencyCode;
  /** Set once a deposit checkout exists (M3) — see BookingPayment. */
  paymentId?: string;
  /** M3 deposit payment state — mirrors the Payment row (demo store + prisma).
   * Lets the admin dispute view gate the Refund-deposit action. */
  paymentStatus?: BookingPayment["status"];
  /** M3 deposit payment method — set once a checkout was minted. The dispute
   * view gates the manual OMT/Whish Confirm-payment action on this. */
  paymentMethod?: PaymentMethod;
  /** Receipt created at payment-confirm for signed-in customers (M3). */
  invoice?: BookingInvoice;
  /** M1 recurring bookings (§7 #1) — set when this booking is an occurrence of a contract. */
  recurringId?: string;
  /** §2.2 request SLA — true once the cron has nudged the worker about this
   * unanswered request (demo reads the per-process nudge set; prisma reads
   * Booking.lastSlaNudgeAt). Surfaces on the worker dashboard + customer rows. */
  slaNudgeSent?: boolean;
  events: BookingEvent[];
}

/** Recurring cadence for maintenance contracts (ENHANCEMENT-PLAN §7 #1). */
export type RecurringFrequency = "weekly" | "biweekly" | "monthly";

/** Lifecycle of a recurring contract. */
export type RecurringStatus = "active" | "paused" | "cancelled";

/**
 * A maintenance contract: one customer request, auto-materialized occurrences.
 * The first occurrence is a normal REQUESTED booking (same slot claim); the
 * worker accepts the CONTRACT once, and the future occurrences are generated
 * from the anchor slot at the chosen cadence (M1 demo adapter — the prisma
 * wave materializes them as real slot claims).
 */
export interface RecurringBooking {
  id: string;
  number: string; // human-readable, e.g. "RC-1001"
  workerId: string;
  /** The signed-in customer's user id — null for guest (phone-keyed) requests. */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  serviceItem?: ServiceItem;
  jobTitle: string;
  note?: string;
  frequency: RecurringFrequency;
  /** The first occurrence's slot range — every occurrence reuses its time-of-day. */
  anchorStart: string; // ISO
  anchorEnd: string; // ISO
  status: RecurringStatus;
  /** Occurrences materialized so far, oldest first (the first is the request). */
  occurrences: Booking[];
  createdAt: string; // ISO
}

/** Customer-side input for creating a recurring request (M1). */
export interface RecurringRequestInput extends BookingRequestInput {
  frequency: RecurringFrequency;
}

/** Worker-side decision on a pending recurring contract (M1). */
export interface RecurringRespondInput {
  accept: boolean;
  /** Price per visit — minor units (only when accepting). */
  quote?: number;
  /** Required upfront payment — minor units (only when accepting). */
  deposit?: number;
  declineReason?: string;
}

/**
 * Structured booking context attached to outbound notification payloads so the
 * email channel can render a confirmation email with the booking number, slot,
 * quote and the admin dispute-view deep link (/admin/bookings/{number}) — the
 * same booking the Recent-activity feed and funnel reference. Quote/deposit
 * stay in minor units (×100); the template divides by 100 for display.
 */
export interface BookingEmailContext {
  number: string;
  startAt: string; // ISO
  endAt: string; // ISO
  quote?: number; // minor units
  deposit?: number; // minor units
  currency?: string;
  jobTitle?: string;
  /**
   * M5 — the platform-fee snapshot at accept-with-quote (minor units), so the
   * confirmation email can show the fee (or "fee waived" when 0 — the exempt
   * marker) exactly like the customer booking row.
   */
  platformFee?: number;
  /** M4 — deposit-refund context for the bookingRefund email (minor units). */
  refund?: { amount: number; reason?: string };
}

/**
 * Structured context attached to the campaignRefunded notification (mirrors
 * BookingEmailContext): lets the email channel render a refund card with the
 * campaign name, the refunded amount (minor units — the template divides by
 * 100) and the admin-stated reason — the same trail the activity feed and the
 * /admin campaign-payments table carry.
 */
export interface CampaignRefundContext {
  campaignName: string;
  amount: number; // minor units
  currency: string;
  reason?: string;
}

/**
 * The deposit/quote payment attached to a booking (M3). Minor units, mirror
 * of prisma `Payment` for the booking case.
 */
export interface BookingPayment {
  id: string;
  amount: number; // minor units
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  /** The chosen payment method — set when the checkout is minted ("stripe"
   * until then). Lets the dispute view gate the admin's manual confirm. */
  method?: PaymentMethod;
  providerRef?: string;
  /** Demo-store only — the minted checkout URL (prisma keeps it in metadata). */
  checkoutUrl?: string;
  paidAt?: string;
  refundedAt?: string;
}

/** Customer-side input for creating a booking request. */
export interface BookingRequestInput {
  workerId: string;
  /** The AVAILABLE slot being claimed. */
  slotId: string;
  /** The signed-in customer's user id — omit for guest (phone-keyed) bookings. */
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  jobTitle: string;
  note?: string;
  serviceItem?: ServiceItem;
}

/** Worker-side decision on a REQUESTED booking. */
export interface BookingRespondInput {
  accept: boolean;
  /** Price for the job — minor units (only when accepting). */
  quote?: number;
  /** Required upfront payment — minor units (only when accepting). */
  deposit?: number;
  declineReason?: string;
}

/** Worker-side lifecycle transitions (M4): which stage the job moves to. The
 * worker's `completed` flip is STAGED — the booking lands in completionPending
 * and only reaches `completed` once the customer confirms (or the grace cron
 * auto-confirms), so fake-COMPLETED noise can't pollute the funnel/ratings. */
export type BookingTransitionTarget = "inProgress" | "completed" | "noShow";

/**
 * §2.3 completion grace — how long a staged completion waits for the customer
 * before the cron auto-confirms it. Tune this single constant to change the
 * policy; shared by the demo + prisma adapters.
 */
export const BOOKING_COMPLETION_CONFIRM_GRACE_HOURS = 72;

/** §2.3 — has a staged completion sat unconfirmed past the grace window? */
export function completionGraceElapsed(stagedAtMs: number, nowMs: number): boolean {
  return nowMs - stagedAtMs >= BOOKING_COMPLETION_CONFIRM_GRACE_HOURS * 60 * 60 * 1000;
}

/** Who cancels a booking and why (M4 — stored in cancelledBy / cancelReason). */
export interface BookingCancelInput {
  by: "customer" | "worker" | "system" | "admin";
  reason?: string;
  /** §2.4 — the acting admin's name (logged when `by === "admin"`). */
  adminName?: string;
}

/**
 * M4 reschedule — who moves a scheduled booking to a new slot and why.
 * The booking keeps its status (confirmed/inProgress); the audit trail gets
 * a RESCHEDULED event and the OTHER party is notified.
 */
export interface BookingRescheduleInput {
  by: "customer" | "worker";
  reason?: string;
}

/** Statuses a booking can be rescheduled from (M4). */
export const BOOKING_RESCHEDULABLE_FROM: readonly BookingStatus[] = ["confirmed", "inProgress"];

/**
 * M4 state machine — the source statuses each worker transition may leave
 * from: confirmed/pendingPayment → inProgress → completed; noShow voids any
 * of the scheduled statuses. Shared by the demo + prisma adapters so they
 * can never drift. Anything else returns null (no-op).
 */
export const BOOKING_TRANSITION_FROM: Record<BookingTransitionTarget, BookingStatus[]> = {
  inProgress: ["confirmed", "pendingPayment"],
  completed: ["inProgress"], // the flip is staged → completionPending (§2.3)
  noShow: ["confirmed", "pendingPayment", "inProgress"],
};

/** Terminal statuses a booking can never be cancelled from (M4). */
export const BOOKING_TERMINAL_STATUSES: readonly BookingStatus[] = ["completed", "cancelled", "declined", "noShow"];

/**
 * Admin booking funnel (M4 — docs/booking-scheduling.md §7): counts of the
 * live booking population by status over a window, plus the REQUESTED→CONFIRMED
 * conversion rate. Mirrors VerificationFunnel. Computed by the demo + prisma
 * adapters from the same shared tally so they can never drift.
 */
export interface BookingFunnel {
  /** Booking count per status in the window — every BookingStatus key present. */
  counts: Record<BookingStatus, number>;
  /** Bookings created in the window (sum of counts). */
  total: number;
  /**
   * REQUESTED→CONFIRMED conversion, 0..100 rounded: bookings whose CURRENT
   * status means the worker accepted (confirmed / inProgress / completed) over
   * all bookings created in the window. Read as a lower bound — a request
   * accepted today still sits in confirmed, but a booking declined after a
   * deposit was paid is counted as declined, not confirmed.
   */
  conversionRate: number;
}

/** Zeroed per-status counters (the canonical BookingStatus key set). */
export function emptyBookingFunnelCounts(): Record<BookingStatus, number> {
  return {
    requested: 0,
    quoting: 0,
    quoted: 0,
    pendingPayment: 0,
    confirmed: 0,
    inProgress: 0,
    completionPending: 0,
    completed: 0,
    cancelled: 0,
    declined: 0,
    noShow: 0,
    rescheduled: 0,
    message: 0,
    refunded: 0,
  };
}

/**
 * REQUESTED→CONFIRMED conversion for a status tally, 0..100 rounded: bookings
 * whose CURRENT status means the worker accepted (confirmed / inProgress /
 * completed) over all counted bookings. Shared by both funnel adapters — the
 * single place the conversion math lives (prismaGetBookingFunnel reuses it
 * after its groupBy).
 */
export function bookingConversionRate(counts: Record<BookingStatus, number>): number {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  // Accepted = the worker took the job: confirmed, in progress, staged for
  // completion, or completed.
  const confirmed =
    counts.confirmed + counts.inProgress + counts.completionPending + counts.completed;
  return total > 0 ? Math.round((confirmed / total) * 100) : 0;
}

/**
 * Tally statuses from a booking list, respecting a creation cutoff. Creation
 * time is the booking's FIRST event (the demo store has no createdAt column;
 * prisma keys its groupBy on createdAt directly). Bookings with an unparsable
 * or missing first-event time are excluded (NaN-safe, like the activity
 * funnel). Shared by both adapters (the prisma adapter uses its groupBy + the
 * same bookingConversionRate for the conversion).
 */
export function tallyBookingFunnel(
  rows: Pick<Booking, "status" | "events">[],
  cutoffMs: number
): BookingFunnel {
  const counts = emptyBookingFunnelCounts();
  let total = 0;
  for (const b of rows) {
    const created = Date.parse(b.events[0]?.time ?? "");
    if (Number.isNaN(created) || created < cutoffMs) continue;
    counts[b.status] += 1;
    total += 1;
  }
  return {
    counts,
    total,
    conversionRate: bookingConversionRate(counts),
  };
}

/**
 * M5 admin revenue — platform take-rate fees over a creation window. Gross is
 * the sum of the fee snapshots stamped at quoted accepts; refunded is the fee
 * on bookings whose paid deposit was actually refunded (the fee went back with
 * the payment); net = gross − refunded. `avgFeeMinor` is the per-booking
 * average of gross; `currency` is the most common currency among the counted
 * rows (the seed is single-currency, so a mixed set is surfaced rather than
 * hidden). Minor units everywhere.
 */
export interface PlatformFeeStats {
  /** Sum of platformFee over accepted bookings in the window (minor units). */
  grossMinor: number;
  /** Sum of platformFee on bookings whose paid deposit was refunded. */
  refundedMinor: number;
  /** grossMinor − refundedMinor — what the platform keeps. */
  netMinor: number;
  /** Bookings with a fee in the window. */
  count: number;
  /** grossMinor / count, rounded to the minor unit. */
  avgFeeMinor: number;
  currency: CurrencyCode;
}

/** Zeroed fee stats — the empty state when no fee-carrying booking exists. */
export function emptyPlatformFeeStats(): PlatformFeeStats {
  return { grossMinor: 0, refundedMinor: 0, netMinor: 0, count: 0, avgFeeMinor: 0, currency: "USD" };
}

/**
 * Tally take-rate fees from booking rows, respecting a creation cutoff
 * (first-event time, mirroring tallyBookingFunnel). Shared by both adapters —
 * the demo maps its in-memory store, prisma maps live Booking rows — so the
 * admin card's numbers can never drift between demo and real mode.
 */
export function tallyPlatformFeeStats(
  rows: Array<{ platformFee?: number; refunded: boolean; createdMs: number; currency: CurrencyCode }>,
  cutoffMs: number
): PlatformFeeStats {
  const out = emptyPlatformFeeStats();
  const currencies = new Map<CurrencyCode, number>();
  for (const r of rows) {
    if (!r.platformFee || r.platformFee <= 0 || Number.isNaN(r.createdMs) || r.createdMs < cutoffMs) continue;
    out.grossMinor += r.platformFee;
    if (r.refunded) out.refundedMinor += r.platformFee;
    out.count += 1;
    currencies.set(r.currency, (currencies.get(r.currency) ?? 0) + 1);
  }
  if (out.count > 0) {
    out.netMinor = out.grossMinor - out.refundedMinor;
    out.avgFeeMinor = Math.round(out.grossMinor / out.count);
    let best: CurrencyCode = "USD";
    let bestN = -1;
    for (const [c, n] of currencies) {
      if (n > bestN) {
        best = c;
        bestN = n;
      }
    }
    out.currency = best;
  }
  return out;
}

/** Worker payout ledger (docs/payouts.md) — kinds and statuses. */
export type LedgerEntryKind = "earning" | "withdrawal" | "adjustment";
export type LedgerEntryStatus = "posted" | "pending" | "processed" | "rejected";

/**
 * One row of the worker earnings ledger. `amount` is SIGNED minor units
 * (earnings positive, withdrawals/adjustments negative); `balanceAfter`
 * snapshots the worker's running balance after this entry (audit trail).
 * Balance = Σ amount over entries whose status is posted/processed.
 */
export interface LedgerEntry {
  id: string;
  workerId: string;
  bookingId?: string;
  kind: LedgerEntryKind;
  status: LedgerEntryStatus;
  amount: number;
  balanceAfter: number;
  currency: CurrencyCode;
  reason?: string;
  time: string;
}

/**
 * A worker's spendable balance + what's reserved by withdrawals in review.
 * available = Σ posted earnings/adjustments − Σ processed withdrawals;
 * pending = Σ pending withdrawals (reserved — not spendable).
 */
export interface WorkerBalance {
  availableMinor: number;
  pendingMinor: number;
  currency: CurrencyCode;
}

/** Zeroed worker balance (no ledger activity yet). */
export function emptyWorkerBalance(currency: CurrencyCode = "USD"): WorkerBalance {
  return { availableMinor: 0, pendingMinor: 0, currency };
}

export interface Notification {
  id: string;
  type:
    | "subscription"
    | "verification"
    | "lead"
    | "review"
    | "system"
    | "campaign"
    | "bookingRequest"
    | "bookingRequestNudge"
    | "bookingRequestExpired"
    | "bookingCompletionPending"
    | "bookingCompletionConfirmed"
    | "bookingConfirmed"
    | "bookingDeclined"
    | "bookingCancelled"
    | "bookingReminder"
    | "bookingCompleted"
    | "bookingPaid"
    | "bookingRescheduled"
    | "bookingRefund"
    | "recurringVisitScheduled"
    | "campaignRefunded";
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  href?: string;
  time: string; // ISO
  read: boolean;
}

export interface Invoice {
  id: string;
  number: string;
  scope: "subscription" | "advertising";
  descriptionEn: string;
  descriptionAr: string;
  amount: number;
  currency: CurrencyCode;
  date: string; // ISO
  /**
   * "refunded" is the campaign credit note — a paid advertising invoice whose
   * purchase was refunded flips here (the company invoices list shows the
   * refunded amount + badge; prisma marks the equivalent with InvoiceStatus.VOID).
   */
  status: "paid" | "pending" | "refunded";
  /** Demo-store only — links an advertising invoice to its campaign so the
   * payment webhook can flip it to paid on confirm (prisma keeps the link in
   * Payment.advertisementId/metadata instead). */
  campaignId?: string;
}

export interface Worker {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  categorySlug: string;
  citySlug: string;
  areaSlug: string;
  taglineEn: string;
  taglineAr: string;
  bioEn: string;
  bioAr: string;
  rating: number;
  reviewCount: number;
  yearsExp: number;
  verified: boolean;
  verification: VerificationStatus;
  premium: boolean;
  featured: boolean;
  emergency: boolean;
  available: boolean;
  subscription: Subscription;
  priceMin: number;
  priceMax: number;
  currency: CurrencyCode;
  phone: string;
  whatsapp: string;
  email: string;
  website?: string;
  socials: { platform: string; url: string }[];
  languages: { code: string; nameEn: string; nameAr: string }[];
  services: ServiceItem[];
  certifications: Certification[];
  hours: WorkingDay[];
  gallery: PortfolioItem[];
  reviews: Review[];
  joinedYear: number;
  views: number;
  leads: number;
  completion: number;
  /**
   * W1 trust signals (docs/ENHANCEMENT-PLAN.md §2.1) — stamped by the read
   * adapters (demo + prisma) so customers can select on responsiveness and
   * availability:
   *   responseRate — 0–100 share of answered requests (anything past
   *     REQUESTED counts); null when the worker has no booking history yet.
   *   availableThisWeek — true when an AVAILABLE slot exists within the next
   *     7 days (hasFreeSlotsThisWeek in booking-ui.ts).
   */
  responseRate?: number | null;
  availableThisWeek?: boolean;
  hue: number;
  lat: number;
  lng: number;
}

export interface SearchFilters {
  query?: string;
  category?: string;
  city?: string;
  area?: string;
  minRating?: number;
  priceMin?: number;
  priceMax?: number;
  minExp?: number;
  verifiedOnly?: boolean;
  featuredOnly?: boolean;
  emergencyOnly?: boolean;
  openNowOnly?: boolean;
  availableNow?: boolean;
  /**
   * M5 — narrow to workers whose plan waives the platform fee (Enterprise), so
   * customers can shop the "no platform fee" perk as a first-class dimension.
   * Evaluated via isPlanFeeExempt (the single source of truth) in both
   * adapters; mirrors the W1 fee badge on the cards.
   */
  feeWaivedOnly?: boolean;
  sort?: SearchSort;
  page?: number;
  /** Admin-only: include workers whose subscription has expired. */
  includeExpired?: boolean;
}

export type SearchSort =
  | "relevance"
  | "rating"
  | "reviews"
  | "priceLow"
  | "priceHigh"
  | "experience"
  | "nearest";

export interface SearchResult {
  items: Worker[];
  total: number;
  tookMs: number;
}

export interface Suggestion {
  labelEn: string;
  labelAr: string;
  type: "category" | "worker" | "city";
  href: string;
}

export interface AnalyticsPoint {
  label: number;
  value: number;
}

export interface TopWorkerRow {
  id: string;
  nameEn: string;
  nameAr: string;
  categoryEn: string;
  categoryAr: string;
  cityEn: string;
  views: number;
  rating: number;
  hue: number;
}

/** Resolved identity of the acting user (ActivityLog.actorId → User). */
export interface ActivityActorUser {
  id: string;
  name: string;
  email: string;
  hue: number;
  image?: string | null;
}

/**
 * Verification workflow funnel over a window (default 30 days): worker-side
 * requests vs admin decisions, plus the request-to-approval conversion.
 * Computed from ActivityLog codes (see activity.ts → getVerificationFunnel).
 */
export interface VerificationFunnel {
  requests: number; // VERIFICATION_REQUEST_SUBMITTED
  approved: number; // WORKER_VERIFIED
  declined: number; // VERIFICATION_DECLINED
  /** approved / (approved + declined) — 0..100, 0 when no decisions. */
  approvalRate: number;
  /**
   * approved / requests — 0..100, 0 when no requests.
   * Fixed-window semantics: requests submitted late in the window may still
   * be awaiting a decision, so this undercounts the "true" eventual
   * conversion until decisions catch up. Read it as a lower bound.
   */
  conversionRate: number;
}

export interface ActivityEntry {
  id: string;
  actionEn: string;
  actionAr: string;
  /** Display name of the acting admin/actor (e.g. "Platform Admin"). */
  actor: string;
  /**
   * Optional real user id of the acting admin — the production FK reference
   * (ActivityLog.actorId → User.id). Demo file-mode entries store it as-is;
   * prisma mode writes it to the FK column. When absent (system events),
   * `actor` remains the only identity.
   */
  actorId?: string;
  /**
   * Resolved actor identity (name/email/hue from the User row via a JOIN in
   * prisma mode; from the demo actor map in file mode). Present when the
   * entry carries an actorId that resolves.
   */
  actorUser?: ActivityActorUser;
  time: string;
  type: "worker" | "company" | "review" | "payment" | "system" | "verification" | "booking";
  /** Structured machine code (ACTION_CODES) for the ActivityLog.action column. */
  code?: string;
  /**
   * The booking number (e.g. "BK-1002") this entry is about — when set, the
   * feed renders a deep link to the admin dispute view (/admin/bookings/[number]).
   */
  bookingNo?: string;
}

/** Audit trail entry for a worker-verification decision (approve / reject). */
export interface VerificationLog {
  id: string;
  workerSlug: string;
  workerNameEn: string;
  workerNameAr: string;
  action: "approved" | "rejected";
  adminName: string;
  /** Optional real user id of the deciding admin (FK reference). */
  adminId?: string;
  time: string; // ISO
}

export interface Campaign {
  id: string;
  nameEn: string;
  nameAr: string;
  placement: string;
  adType: "banner" | "slider" | "featuredCard" | "sponsoredSearch" | "sponsoredCategory" | "popup" | "native" | "video";
  impressions: number;
  clicks: number;
  ctr: number;
  budget: number;
  spent: number;
  /**
   * PENDING = created but not paid — the campaign does NOT serve ads until
   * the payment webhook flips it to ACTIVE (self-serve ad purchasing).
   */
  status: "active" | "paused" | "ended" | "pending";
  targetCategories?: string[];
  targetCities?: string[];
  created: string; // ISO
}

/**
 * A campaign purchase (self-serve ads) — mirrors the booking Payment row.
 * Amount is minor units; status rides the same lifecycle as a deposit.
 * Keyed by campaign id in the demo store; prisma persists it as a Payment
 * row with advertisementId/companyId + campaignId in metadata.
 */
export interface CampaignPayment {
  id: string;
  campaignId: string;
  amount: number; // minor units
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded" | "cancelled";
  /** The chosen payment method — set when the checkout is minted. */
  method?: PaymentMethod;
  providerRef?: string;
  /** Demo-store only — the minted checkout URL (prisma keeps it in metadata). */
  checkoutUrl?: string;
  paidAt?: string;
  refundedAt?: string;
  /**
   * Admin-stated reason captured at refund time — shown as the activity-feed
   * entry's reason and as a tooltip on the refunded badge in the /admin
   * campaign-payments table.
   */
  refundReason?: string;
}

/**
 * One PENDING manual (OMT/Whish) payment awaiting admin confirmation — the
 * unified row the /admin pending-payments card lists and the
 * confirmManualPaymentAction dispatches on (docs/PAYMENTS.md §manual
 * methods). A manual method has no webhook: the customer paid offline with
 * the reference, and the admin's confirm runs the SAME confirm path a
 * provider webhook would have (booking deposit → confirmBookingPayment,
 * campaign → confirmCampaignPayment, purchases → their confirm seams).
 */
export interface PendingManualPayment {
  /** The Payment row id. */
  id: string;
  /** What the payment completes: booking deposit, campaign purchase, or a
   * paid upgrade (subscription renewal / verification / featured / emergency). */
  scope: "booking" | "campaign" | PurchaseScope;
  /** The entity the confirm acts on — booking id, campaign id, or the payment
   * id itself for purchases. */
  entityId: string;
  labelEn: string;
  labelAr: string;
  amount: number; // minor units
  currency: string;
  method: "omt" | "whish";
  /** The customer's OMT/Whish transfer reference (providerRef). */
  reference: string;
  createdAt: string;
}

export interface AnalyticsOverview {
  totalWorkers: number;
  activeWorkers: number;
  inactiveWorkers: number;
  expiredSubs: number;
  revenue: number;
  monthlyRevenue: number;
  dailyRevenue: number;
  companies: number;
  activeAds: number;
  visitors: number;
  conversionRate: number;
  revenueSeries: AnalyticsPoint[];
  leadsSeries: AnalyticsPoint[];
  viewsSeries: AnalyticsPoint[];
  categoryCounts: { labelEn: string; labelAr: string; value: number }[];
  planDistribution: { labelEn: string; labelAr: string; value: number; hue: number }[];
  topWorkers: TopWorkerRow[];
  topCompanies: { name: string; value: number }[];
  searchTrends: { queryEn: string; queryAr: string; count: number }[];
  activities: ActivityEntry[];
  alerts: { type: "expired" | "verification" | "reviews"; count: number }[];
  /** Verification workflow funnel over the last 30 days. */
  verificationFunnel: VerificationFunnel;
  /** Booking funnel over the last 30 days (M4 admin card). */
  bookingFunnel: BookingFunnel;
}
