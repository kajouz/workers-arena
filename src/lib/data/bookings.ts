import { workerById, workerBySlug } from "./workers";
import {
  bookingNotification,
  type BookingNotificationOptions,
  type CustomerNotificationKind,
  type WorkerNotificationKind,
} from "./booking-notifications";
import { pushNotification } from "./notifications";
import { computePlatformFee, isPlanFeeExempt, PLATFORM_FEE_RATE_BPS } from "./booking-ui";
import { ACTION_CODES, logAdminActivity } from "./activity";
import {
  BOOKING_RESCHEDULABLE_FROM,
  BOOKING_TERMINAL_STATUSES,
  BOOKING_TRANSITION_FROM,
  bookingCancelRefundDue,
  formatInvoiceNumber,
  tallyBookingFunnel,
  tallyPlatformFeeStats,
  type Booking,
  type BookingFunnel,
  type LedgerEntry,
  type PlatformFeeStats,
  type WorkerBalance,
  type BookingCancelInput,
  type BookingEvent,
  type BookingRequestInput,
  type BookingRescheduleInput,
  type BookingRespondInput,
  type BookingSlot,
  type BookingStatus,
  type BookingPayment,
  type BookingTransitionTarget,
  type RecurringBooking,
  type RecurringRequestInput,
  type RecurringRespondInput,
  type SlotStatus,
} from "./types";
import { RECURRING_OCCURRENCE_COUNT, generateRecurringOccurrences } from "./recurring";
import { getPaymentProvider } from "@/lib/payments/registry";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * BOOKING & SCHEDULING — DEMO ADAPTER (M1)
 * ────────────────────────────────────────────────────────────────────────────
 * In-memory implementation of the booking seam (docs/booking-scheduling.md §4).
 * Mirrors the prisma/seed.ts booking rows exactly (3 slots — AVAILABLE /
 * RESERVED / BLOCKED — + REQUESTED booking BK-1001 for the demo worker), so
 * demo mode and the seeded database behave identically.
 *
 * Service-layer rules enforced here (single source of truth — the Prisma
 * adapter re-implements the same rules inside prisma.$transaction in W2):
 *   1. No double-booking — the slot must still be AVAILABLE when the request
 *      lands (demo re-checks; prisma row-locks inside the transaction).
 *   2. Overlap guard — reject a request whose [startAt, endAt) overlaps an
 *      existing RESERVED/BOOKED slot of the same worker.
 *   3. Cancellation/decline frees the slot — back to AVAILABLE.
 *   4. Money in minor units (quote/deposit ×100, same as Subscription.price).
 *   5. Audit — every transition appends a BookingEvent.
 *
 * Real mode (DEMO_MODE=false): NOT wired yet (W2) — repo.ts warns and no-ops,
 * exactly like addReview/addLead, so a real-mode UI can never silently write
 * to the demo store.
 * ────────────────────────────────────────────────────────────────────────────
 */

type DemoStore = {
  /** Next booking number — the seeded BK-1001 is the last used one. */
  counter: number;
  bookings: Booking[];
  slots: BookingSlot[];
  /** Demo payments keyed by booking id (M3 deposit checkouts). */
  payments: Map<string, BookingPayment>;
  /**
   * Demo invoice numbering (M3) — `WA-YYYY-NNNNN`, sequence restarting per
   * year (formatInvoiceNumber). Receipts live on their Booking.invoice; only
   * the counters are tracked here (reset with the store in seed()).
   */
  invoiceYear: number;
  invoiceSeq: number;
  /** Worker earnings ledger (docs/payouts.md) — the balance source of truth. */
  ledger: LedgerEntry[];
  ledgerSeq: number;
  /** Recurring contracts (M1 — ENHANCEMENT-PLAN §7 #1). */
  recurrings: RecurringBooking[];
  /** Next recurring-contract number — the seeded RC-1000 is the last used. */
  recurringSeq: number;
};

const GLOBAL_KEY = "__workersArenaDemoBookingStore";
const g = globalThis as Record<string, unknown>;

/** True only for the first module instance in this process — the only one
 * that seeds; later instances (Turbopack entry graphs in dev) must adopt the
 * existing store instead of resetting it. */
const FIRST_INSTANCE = g[GLOBAL_KEY] === undefined;

/**
 * The demo booking store — module-level state would be duplicated in dev:
 * Turbopack can load a module once PER ENTRY GRAPH (pages, server actions and
 * /api route handlers each get their own copy), so a deposit confirmed by the
 * simulated-checkout API route would never be visible to the /bookings page —
 * and vice versa. globalThis is shared across every graph in the same
 * dev-server process, so the store has exactly one home. Tests reset it via
 * resetBookingsStore().
 */
const STORE: DemoStore =
  (g[GLOBAL_KEY] as DemoStore | undefined) ??
  (g[GLOBAL_KEY] = {
    counter: 1001,
    bookings: [],
    slots: [],
    payments: new Map(),
    invoiceYear: 0,
    invoiceSeq: 0,
    ledger: [],
    ledgerSeq: 0,
    recurrings: [],
    recurringSeq: 1001,
  } as DemoStore);

function nextDemoInvoiceNumber(): string {
  const year = new Date().getFullYear();
  if (year !== STORE.invoiceYear) {
    STORE.invoiceYear = year;
    STORE.invoiceSeq = 0;
  }
  STORE.invoiceSeq += 1;
  return formatInvoiceNumber(year, STORE.invoiceSeq);
}

/** Id of the demo worker used by the seed (Khaled, plumbing). */
const demoWorkerId = workerBySlug("khaled-al-harbi-plumbing")?.id ?? "khaled-plum";

function slotAt(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1); // always "tomorrow" so seeded data looks upcoming
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/**
 * Seed the store once per process, mirroring prisma/seed.ts: 3 slots for the
 * demo worker (9 AVAILABLE · 10 RESERVED by BK-1001 · 14 BLOCKED) + the
 * REQUESTED booking with Sara. Resettable via resetBookingsStore() for tests.
 */
function seed(): void {
  STORE.counter = 1001;
  STORE.bookings.length = 0;
  STORE.slots.length = 0;
  STORE.payments.clear();
  STORE.invoiceYear = 0;
  STORE.invoiceSeq = 0;
  STORE.ledger.length = 0;
  STORE.ledgerSeq = 0;
  STORE.recurrings.length = 0;
  STORE.recurringSeq = 1001;

  const worker = workerById(demoWorkerId);
  // Every slot is a 1-hour range: start at the top of the hour, end +60 min.
  const hourSlot = (hour: number) => {
    const start = slotAt(hour);
    return { start, end: new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString() };
  };
  const s9 = hourSlot(9);
  const s10 = hourSlot(10);
  const s14 = hourSlot(14);

  STORE.slots.push(
    { id: "slot-khaled-9", workerId: demoWorkerId, startAt: s9.start, endAt: s9.end, status: "available" },
    { id: "slot-khaled-10", workerId: demoWorkerId, startAt: s10.start, endAt: s10.end, status: "reserved", bookingId: "bk-1001" },
    { id: "slot-khaled-14", workerId: demoWorkerId, startAt: s14.start, endAt: s14.end, status: "blocked", note: "Site visit" }
  );
  const reserved = STORE.slots[1]!;

  const event: BookingEvent = {
    status: "requested",
    actorType: "customer",
    time: s10.start,
  };
  STORE.bookings.push({
    id: "bk-1001",
    number: "BK-1001",
    workerId: demoWorkerId,
    customerId: "u-customer", // Sara's demo user id — signed-in bookings get a receipt
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    note: "Sink under the kitchen window has been leaking for two days.",
    startAt: reserved.startAt,
    endAt: reserved.endAt,
    status: "requested",
    currency: worker?.currency ?? "SAR",
    events: [event],
  });

  // ────────────────────────────────────────────────────────────────────────────
  // W1 showcase (docs/ENHANCEMENT-PLAN.md §2.1) — a few more workers carry
  // availability + booking history so the trust chips (response rate · free
  // this week) render across EVERY card grid in demo mode (search, favorites,
  // related, home featured), not just khaled's. Constraints that keep the
  // existing tests honest:
  //   • historical bookings use numbers BELOW the counter (BK-099x) — the next
  //     request still starts at BK-1002;
  //   • their first audit event is >30 days old, so the admin funnel (keyed
  //     on creation time) still counts exactly the seeded BK-1001;
  //   • seeded COMPLETED bookings bypass the transition (no ledger credit,
  //     no fee, no notifications) — they are pure showcase history.
  // ────────────────────────────────────────────────────────────────────────────
  const ali = workerBySlug("ali-hassan-carpentry");
  const omar = workerBySlug("omar-al-mutairi-ac-technician");
  const ahmed = workerBySlug("ahmed-el-sayed-masonry");

  const availableSlot = (id: string, workerId: string, hour: number) => {
    const t = hourSlot(hour);
    STORE.slots.push({ id, workerId, startAt: t.start, endAt: t.end, status: "available" });
  };
  if (ali) availableSlot("slot-ali-9", ali.id, 9);
  if (omar) availableSlot("slot-omar-11", omar.id, 11);
  if (ahmed) availableSlot("slot-ahmed-13", ahmed.id, 13);

  // Ali's completed job (45 days ago) → responseRate 100% + available.
  if (ali) {
    const past = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    past.setHours(10, 0, 0, 0);
    const startAt = past.toISOString();
    const endAt = new Date(past.getTime() + 60 * 60 * 1000).toISOString();
    const created = new Date(past.getTime() - 60 * 60 * 1000).toISOString(); // >30 days ago
    STORE.slots.push({
      id: "slot-ali-10",
      workerId: ali.id,
      startAt,
      endAt,
      status: "booked",
      bookingId: "bk-0990",
    });
    STORE.bookings.push({
      id: "bk-0990",
      number: "BK-0990",
      workerId: ali.id,
      customerName: "Noor E.",
      customerPhone: "+966 55 123 4871",
      customerEmail: "noor@example.com",
      jobTitle: "Custom wardrobe install",
      startAt,
      endAt,
      status: "completed",
      currency: worker?.currency ?? "SAR",
      events: [
        { status: "requested", actorType: "customer", time: created },
        { status: "confirmed", actorType: "worker", time: startAt },
        { status: "completed", actorType: "system", time: startAt },
      ],
    });
  }
}

// Seed once per process — a later module instance (another Turbopack entry
// graph in dev) must find the store already populated, not reset it.
if (FIRST_INSTANCE) {
  seed();
}

/** Reset the demo store to its seeded state (used by tests). */
export function resetBookingsStore(): void {
  seed();
}

/** Preferred notification locale from a worker's first listed language. */
function workerLocale(workerId: string): "en" | "ar" {
  return workerById(workerId)?.languages[0]?.code === "ar" ? "ar" : "en";
}

/**
 * Notify the worker about a booking event (request landed, customer cancelled).
 * The payload — copy + structured booking context — comes from the shared
 * bookingNotification builder, the same one the admin dispute view previews,
 * so an email always shows exactly what the recipient received.
 */
async function notifyWorker(
  booking: Booking,
  kind: WorkerNotificationKind,
  opts?: BookingNotificationOptions
): Promise<void> {
  const worker = workerById(booking.workerId);
  await pushNotification(
    bookingNotification(booking, kind, opts),
    worker ? { name: worker.nameEn, email: worker.email, phone: worker.phone, locale: workerLocale(worker.id) } : undefined
  );
}

/** Notify the customer about a worker's decision (email known → addressed). */
async function notifyCustomer(
  booking: Booking,
  kind: CustomerNotificationKind,
  opts?: BookingNotificationOptions
): Promise<void> {
  await pushNotification(
    bookingNotification(booking, kind, opts),
    booking.customerEmail
      ? { name: booking.customerName, email: booking.customerEmail, phone: booking.customerPhone, locale: "en" }
      : undefined
  );
}

/**
 * Add a slot to the demo store (used by tests and, in M2, the availability
 * editor). Returns the created slot. Rejects nothing — callers validate.
 */
export function demoAddSlot(
  workerId: string,
  startAt: string,
  endAt: string,
  status: SlotStatus = "available",
  note?: string
): BookingSlot {
  const slot: BookingSlot = {
    id: `slot-${workerId}-${STORE.slots.length + 1}-${startAt}`,
    workerId,
    startAt,
    endAt,
    status,
    note,
  };
  STORE.slots.push(slot);
  return slot;
}

/* ─────────────────────────────── Reads ─────────────────────────────── */

/** A worker's slots within a window, oldest first. */
export function demoGetWorkerSlots(workerId: string, range: { from?: string; to?: string } = {}): BookingSlot[] {
  return STORE.slots.filter((s) => {
    if (s.workerId !== workerId) return false;
    if (range.from && s.endAt < range.from) return false;
    if (range.to && s.startAt > range.to) return false;
    return true;
  }).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/** A worker's bookings, newest first, with optional status filter + limit. */
export function demoGetWorkerBookings(workerId: string, opts: { status?: BookingStatus; limit?: number } = {}): Booking[] {
  const list = STORE.bookings.filter(
    (b) => b.workerId === workerId && (!opts.status || b.status === opts.status)
  ).sort((a, b) => b.startAt.localeCompare(a.startAt));
  return opts.limit ? list.slice(0, opts.limit) : list;
}

/** Every booking in the demo store, oldest first (cron reminder scan). */
export function demoGetAllBookings(): Booking[] {
  return [...STORE.bookings].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

/**
 * M4 admin funnel — booking counts by status + REQUESTED→CONFIRMED conversion
 * over the last `days` (mirrors getVerificationFunnel). Creation time is the
 * booking's first audit event (the demo store has no createdAt column); the
 * shared tallyBookingFunnel keeps the conversion math identical to the prisma
 * adapter's (which keys its groupBy on Booking.createdAt).
 */
export function demoGetBookingFunnel(days = 30): BookingFunnel {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  return tallyBookingFunnel(demoGetAllBookings(), cutoffMs);
}

/**
 * M5 admin revenue — platform take-rate fees over the last `days` (the booking
 * funnel's money twin). Mirrors demoGetBookingFunnel: creation = first audit
 * event, and the shared tallyPlatformFeeStats keeps the math identical to the
 * prisma adapter. Gross = the fee snapshots stamped at quoted accepts;
 * refunded = fees on bookings whose paid deposit was refunded (the fee went
 * back with the payment); net = gross − refunded.
 */
export function demoGetPlatformFeeStats(days = 30): PlatformFeeStats {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  return tallyPlatformFeeStats(
    STORE.bookings.map((b) => ({
      platformFee: b.platformFee,
      refunded: STORE.payments.get(b.id)?.status === "refunded",
      createdMs: Date.parse(b.events[0]?.time ?? ""),
      currency: b.currency,
    })),
    cutoffMs
  );
}

/* ─────────────────────────────── Worker payouts (docs/payouts.md) ─────────────────────────────── */

/**
 * The worker's spendable balance from the ledger: available = Σ posted
 * earnings/adjustments − Σ processed withdrawals; pending = Σ pending
 * withdrawals (reserved while in review, not spendable).
 */
export function demoGetWorkerBalance(workerId: string): WorkerBalance {
  const worker = workerById(workerId);
  let available = 0;
  let pending = 0;
  for (const e of STORE.ledger) {
    if (e.workerId !== workerId) continue;
    if (e.status === "posted" || e.status === "processed") available += e.amount;
    else if (e.status === "pending") pending += Math.abs(e.amount);
  }
  return { availableMinor: available, pendingMinor: pending, currency: worker?.currency ?? "USD" };
}

/**
 * Credit a completed booking's net earnings (quote − platform fee) to the
 * worker's ledger — idempotent, one EARNING per booking (mirrors the prisma
 * adapter's @@unique([bookingId])). Quote-less or fee-0-exempt bookings whose
 * net is 0 get no entry.
 */
function creditEarnings(booking: Booking): void {
  const net = (booking.quote ?? 0) - (booking.platformFee ?? 0);
  if (net <= 0) return;
  if (STORE.ledger.some((e) => e.bookingId === booking.id)) return;
  const before = demoGetWorkerBalance(booking.workerId);
  STORE.ledgerSeq += 1;
  STORE.ledger.push({
    id: `led-${STORE.ledgerSeq}`,
    workerId: booking.workerId,
    bookingId: booking.id,
    kind: "earning",
    status: "posted",
    amount: net,
    balanceAfter: before.availableMinor + net,
    currency: booking.currency,
    time: new Date().toISOString(),
  });
}

/**
 * Worker requests a withdrawal of part of the available balance. Validates
 * the amount against available − pending (pending reserves its amount, so a
 * worker can't double-spend while a request is in review). Creates a PENDING
 * WITHDRAWAL — balance unchanged until an admin decides it.
 */
export function demoRequestPayout(
  workerId: string,
  amountMinor: number,
  reason?: string
): LedgerEntry | { error: "invalid" | "insufficient" } {
  const worker = workerById(workerId);
  if (!worker || !Number.isFinite(amountMinor) || amountMinor <= 0) return { error: "invalid" };
  const balance = demoGetWorkerBalance(workerId);
  if (amountMinor > balance.availableMinor - balance.pendingMinor) return { error: "insufficient" };
  STORE.ledgerSeq += 1;
  const entry: LedgerEntry = {
    id: `led-${STORE.ledgerSeq}`,
    workerId,
    kind: "withdrawal",
    status: "pending",
    amount: -amountMinor,
    balanceAfter: balance.availableMinor, // unchanged while pending
    currency: balance.currency,
    reason,
    time: new Date().toISOString(),
  };
  STORE.ledger.push(entry);
  return entry;
}

/**
 * Admin decides a PENDING payout: approve → PROCESSED (now counts as a
 * debit — the balance drops); reject → REJECTED (dead, never counts).
 * Returns null for unknown/already-decided payouts (CAS — one decision only).
 */
export function demoDecidePayout(payoutId: string, approve: boolean, reason?: string): LedgerEntry | null {
  const entry = STORE.ledger.find(
    (e) => e.id === payoutId && e.kind === "withdrawal" && e.status === "pending"
  );
  if (!entry) return null;
  if (approve) {
    const before = demoGetWorkerBalance(entry.workerId); // pending excluded
    entry.status = "processed";
    entry.balanceAfter = before.availableMinor + entry.amount;
  } else {
    entry.status = "rejected";
  }
  entry.reason = reason ?? entry.reason;
  return entry;
}

/** A worker's payout history — withdrawals newest first. */
export function demoGetWorkerPayouts(workerId: string): LedgerEntry[] {
  return STORE.ledger
    .filter((e) => e.workerId === workerId && e.kind === "withdrawal")
    .sort((a, b) => b.time.localeCompare(a.time));
}

/** Admin queue — every WITHDRAWAL still in review, oldest first. */
export function demoGetPendingPayouts(): LedgerEntry[] {
  return STORE.ledger
    .filter((e) => e.kind === "withdrawal" && e.status === "pending")
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * A single booking by its human-readable number (BK-…), or null — powers the
 * admin dispute view (/admin/bookings/[number]), which the activity feed's
 * booking entries deep-link to.
 */
export function demoGetBookingByNumber(number: string): Booking | null {
  return STORE.bookings.find((b) => b.number === number) ?? null;
}

/** A customer's bookings, matched by email or normalized phone. */
export function demoGetCustomerBookings(identifier: { email?: string; phone?: string } = {}): Booking[] {
  const phone = identifier.phone?.replace(/[\s\-()]/g, "");
  return STORE.bookings.filter((b) => {
    if (identifier.email && b.customerEmail?.toLowerCase() === identifier.email.toLowerCase()) return true;
    if (phone && b.customerPhone.replace(/[\s\-()]/g, "") === phone) return true;
    return false;
  }).sort((a, b) => b.startAt.localeCompare(a.startAt));
}

/* ─────────────────────────────── Availability (M2) ─────────────────────────────── */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Generate AVAILABLE slots for a worker from their weekly `WorkingHour`
 * template (docs/booking-scheduling.md §6 AvailabilityPanel): every non-closed
 * day in [from, to] gets 1-hour slots across open→close. Idempotent — any
 * hour that already overlaps an existing slot (seeded, generated, or blocked)
 * is skipped, so repeated generation never double-books. Returns the number
 * of slots created.
 */
export function demoGenerateSlots(
  workerId: string,
  range: { from?: string; to?: string } = {},
  now = new Date()
): number {
  const worker = workerById(workerId);
  if (!worker) return 0;

  const from = range.from ? new Date(range.from) : new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = range.to ? new Date(range.to) : new Date(from.getTime() + 13 * DAY_MS);

  let created = 0;
  const walk = new Date(from);
  while (walk.getTime() <= to.getTime()) {
    const dayHours = worker.hours.find((h) => h.day === walk.getDay());
    if (dayHours && !dayHours.closed) {
      created += generateDaySlots(workerId, walk, dayHours, now);
    }
    walk.setDate(walk.getDate() + 1);
  }
  return created;
}

/** Create the 1-hour slots of one day; skip hours already covered by a slot. */
function generateDaySlots(
  workerId: string,
  day: Date,
  wh: { open: string; close: string },
  now: Date
): number {
  const [oh, om] = wh.open.split(":").map(Number);
  const [ch, cm] = wh.close.split(":").map(Number);
  // "00:00"–"00:00" with closed:false is the 24/7 emergency marker (see
  // isOpenNow) — generate the full day so emergency workers stay bookable.
  const fullDay = oh === 0 && om === 0 && ch === 0 && cm === 0;
  const startMin = fullDay ? 0 : oh * 60 + om;
  const endMin = fullDay ? 24 * 60 : ch * 60 + cm;

  let created = 0;
  for (let m = startMin; m + 60 <= endMin; m += 60) {
    const start = new Date(day);
    start.setHours(Math.floor(m / 60), m % 60, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Never create a slot in the past — a customer must not be able to
    // request a time that has already passed (generation starts at midnight,
    // so later hours of today get skipped once their start is in the past).
    if (start.getTime() < now.getTime()) continue;

    // Idempotency: skip any hour that overlaps an existing slot (of any
    // status) — seeded, previously generated, or blocked.
    const overlap = STORE.slots.some((s) => {
      if (s.workerId !== workerId) return false;
      return new Date(s.startAt).getTime() < end.getTime() && start.getTime() < new Date(s.endAt).getTime();
    });
    if (overlap) continue;

    STORE.slots.push({
      id: `slot-${workerId}-gen-${startIso}`,
      workerId,
      startAt: startIso,
      endAt: endIso,
      status: "available",
    });
    created += 1;
  }
  return created;
}

/**
 * Block/unblock an AVAILABLE or BLOCKED slot (availability editor). A slot
 * claimed by a booking (RESERVED/BOOKED) cannot be blocked — it is tied to a
 * customer's pending/confirmed booking. Unblocking clears the note and
 * returns the slot to AVAILABLE. Returns null for unknown slots or refusals.
 */
export function demoSetSlotBlocked(
  workerId: string,
  slotId: string,
  blocked: boolean,
  note?: string
): BookingSlot | null {
  const slot = STORE.slots.find((s) => s.id === slotId && s.workerId === workerId);
  if (!slot) return null;
  if (slot.status === "reserved" || slot.status === "booked") return null;

  if (blocked) {
    slot.status = "blocked";
    slot.note = note;
  } else {
    slot.status = "available";
    slot.note = undefined;
  }
  return slot;
}

/* ─────────────────────────────── Mutations ─────────────────────────────── */

/**
 * Worker side: transition a scheduled booking to inProgress / completed /
 * noShow (M4, docs/booking-scheduling.md §5). The move must respect the
 * shared state machine (BOOKING_TRANSITION_FROM): confirmed/pendingPayment →
 * inProgress → completed; noShow voids any scheduled status. Returns null for
 * unknown bookings or illegal transitions. The slot stays BOOKED for every
 * transition (only cancellation frees it — rule 3); each move appends a
 * BookingEvent (rule 5) and only `completed` notifies the customer (the
 * doc's recipient list: CONFIRMED/DECLINED/REMINDER/COMPLETED).
 */
export async function demoTransitionBooking(
  bookingId: string,
  to: BookingTransitionTarget
): Promise<Booking | null> {
  const booking = STORE.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  if (!BOOKING_TRANSITION_FROM[to].includes(booking.status)) return null;

  booking.status = to;
  booking.events.push({ status: to, actorType: "worker", time: new Date().toISOString() });
  if (to === "completed") {
    // Payouts (docs/payouts.md) — the job is done, so the net earnings
    // (quote − platform fee) credit the worker's ledger in the SAME step as
    // the completed flip (the prisma adapter does it inside the tx).
    creditEarnings(booking);
    await notifyCustomer(booking, "customer-completed");
  }
  return booking;
}

/**
 * Worker/customer side: cancel a booking (M4). Allowed from any non-terminal
 * status; terminal bookings (completed/cancelled/declined/noShow) return
 * null. Rule 3 — cancellation frees the slot back to AVAILABLE (unless it
 * was a no-show, which voids without freeing). The reason + actor ride the
 * audit event (rule 5), and the OTHER party is notified (worker when the
 * customer cancels, customer when the worker cancels).
 */
export async function demoCancelBooking(
  bookingId: string,
  input: BookingCancelInput
): Promise<Booking | null> {
  const booking = STORE.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  if (BOOKING_TERMINAL_STATUSES.includes(booking.status)) return null;

  booking.status = "cancelled";
  const slot = STORE.slots.find((s) => s.bookingId === bookingId);
  if (slot) {
    slot.status = "available";
    slot.bookingId = undefined;
  }
  booking.events.push({
    status: "cancelled",
    actorType: input.by,
    reason: input.reason,
    time: new Date().toISOString(),
  });

  // M3 + M4 policy — a paid deposit is refunded only when the policy says so
  // (bookingCancelRefundDue: worker cancels > BOOKING_CANCEL_REFUND_WINDOW_MS
  // before start refund; customer/system always refund; a worker cancel within
  // the window KEEPS the deposit — the slot couldn't be re-sold in time). The
  // provider refund call is async; the simulated provider returns instantly.
  // An unpaid PENDING deposit row is voided (parity with prismaCancelBooking).
  const payment = STORE.payments.get(bookingId);
  let refunded = false;
  if (payment?.status === "paid") {
    if (bookingCancelRefundDue(booking, new Date(), input.by)) {
      await getPaymentProvider().refund(payment.providerRef ?? payment.id, payment.amount);
      payment.status = "refunded";
      payment.refundedAt = new Date().toISOString();
      refunded = true;
    }
    // else — the deposit is kept (payment stays PAID).
  } else if (payment?.status === "pending") {
    payment.status = "cancelled";
  }

  if (input.by === "customer") {
    await notifyWorker(booking, "worker-cancelled");
  } else {
    await notifyCustomer(booking, "customer-cancelled");
  }
  // M4 refund email — the customer is told the amount + reason whenever a
  // deposit actually lands back (worker cancel outside the window, or a
  // customer/system cancel which always refunds).
  if (refunded && payment) {
    await notifyCustomer(booking, "customer-refund", {
      refund: { amount: payment.amount, reason: input.reason },
    });
  }
  return booking;
}

/**
 * M4 — move a scheduled booking to another AVAILABLE slot of the same worker
 * (the doc's "new slot swap"). Rules: the booking must be confirmed or
 * inProgress; the target slot must exist, belong to the same worker, be
 * AVAILABLE, and not overlap another RESERVED/BOOKED/BLOCKED slot. On success
 * the OLD slot returns to AVAILABLE, the target flips to BOOKED + links the
 * booking, the booking's times are updated, a RESCHEDULED audit event is
 * appended, and the OTHER party is notified. Returns null on any violation.
 */
export async function demoRescheduleBooking(
  bookingId: string,
  targetSlotId: string,
  input: BookingRescheduleInput
): Promise<Booking | null> {
  const booking = STORE.bookings.find((b) => b.id === bookingId);
  if (!booking || !BOOKING_RESCHEDULABLE_FROM.includes(booking.status)) return null;

  const target = STORE.slots.find((s) => s.id === targetSlotId && s.workerId === booking.workerId);
  if (!target || target.status !== "available") return null;

  // Overlap guard — the target window must not overlap any other
  // RESERVED/BOOKED/BLOCKED slot of the worker (mirrors demoCreateBookingRequest).
  const start = new Date(target.startAt).getTime();
  const end = new Date(target.endAt).getTime();
  const clash = STORE.slots.some((s) => {
    if (s.workerId !== booking.workerId || s.id === target.id) return false;
    if (s.status !== "reserved" && s.status !== "booked" && s.status !== "blocked") return false;
    const sStart = new Date(s.startAt).getTime();
    const sEnd = new Date(s.endAt).getTime();
    return start < sEnd && end > sStart; // half-open overlap
  });
  if (clash) return null;

  // Swap: free the old slot, claim the new one, move the booking's times.
  const oldSlot = STORE.slots.find((s) => s.bookingId === bookingId);
  if (oldSlot) {
    oldSlot.status = "available";
    oldSlot.bookingId = undefined;
  }
  target.status = "booked";
  target.bookingId = bookingId;
  booking.startAt = target.startAt;
  booking.endAt = target.endAt;
  booking.events.push({
    status: "rescheduled",
    actorType: input.by,
    reason: input.reason,
    time: new Date().toISOString(),
  });

  if (input.by === "customer") {
    await notifyWorker(booking, "worker-rescheduled");
  } else {
    await notifyCustomer(booking, "customer-rescheduled");
  }
  return booking;
}

/**
 * M3 — create the deposit checkout for a PENDING_PAYMENT booking (demo
 * adapter). Delegates to the payment provider seam so demo mode exercises the
 * same simulated checkout flow a keyless real mode does. Returns the URL the
 * customer is redirected to, or null when the booking isn't awaiting payment.
 */
export async function demoCreateBookingCheckout(
  bookingId: string
): Promise<{ url: string } | null> {
  const booking = STORE.bookings.find((b) => b.id === bookingId);
  const payment = STORE.payments.get(bookingId);
  if (!booking || booking.status !== "pendingPayment" || !payment) return null;
  // Idempotent (parity with prismaCreateBookingCheckout): a re-click returns
  // the already-minted checkout URL.
  if (payment.providerRef && payment.checkoutUrl) return { url: payment.checkoutUrl };

  const base = typeof window === "undefined" ? "" : window.location.origin;
  const result = await getPaymentProvider().createCheckout({
    paymentId: payment.id,
    bookingId: booking.id,
    amountMinor: payment.amount,
    currency: payment.currency,
    customerEmail: booking.customerEmail,
    description: `${booking.number} — ${booking.jobTitle}`,
    successUrl: `${base}/bookings?paid=1`,
    cancelUrl: `${base}/bookings`,
  });
  payment.providerRef = result.providerRef;
  payment.checkoutUrl = result.url;
  return { url: result.url };
}

/**
 * M3 — the webhook/checkout callback landed: PENDING_PAYMENT → CONFIRMED,
 * payment → PAID. Idempotent (a provider may deliver the webhook twice).
 */
export async function demoConfirmBookingPayment(
  bookingId: string,
  providerRef: string
): Promise<Booking | null> {
  const booking = STORE.bookings.find((b) => b.id === bookingId);
  const payment = STORE.payments.get(bookingId);
  // Already confirmed by an earlier webhook delivery — no-op success.
  if (booking?.status === "confirmed" && payment?.status === "paid") return booking;
  if (!booking || booking.status !== "pendingPayment" || !payment) return null;

  booking.status = "confirmed";
  payment.status = "paid";
  payment.providerRef = providerRef;
  payment.paidAt = new Date().toISOString();
  booking.events.push({ status: "confirmed", actorType: "system", time: new Date().toISOString() });

  // M4 activity feed — the deposit path reaches CONFIRMED here (not at the
  // respond step, which left it PENDING_PAYMENT). Logged inside the adapter so
  // an idempotent webhook redelivery (early-returns above) never re-logs.
  const workerName = workerById(booking.workerId)?.nameEn ?? "Worker";
  await logAdminActivity({
    code: ACTION_CODES.BOOKING_CONFIRMED,
    actionEn: `${workerName} confirmed ${booking.number}`,
    actionAr: `${workerName} أكّد الحجز ${booking.number}`,
    actor: workerName,
    type: "booking",
    bookingNo: booking.number,
  });

  // M3 — signed-in customers get a receipt (WA-YYYY-NNNNN) at confirm time;
  // guest (phone-keyed) bookings have no account to attach it to and skip it
  // (parity with prismaConfirmBookingPayment, which writes an Invoice row
  // only when Booking.customerId is set).
  if (booking.customerId) {
    booking.invoice = {
      number: nextDemoInvoiceNumber(),
      amount: payment.amount, // minor units, as-is
      currency: booking.currency,
      status: "paid",
      date: new Date().toISOString(),
    };
  }

  await notifyCustomer(booking, "customer-paid");
  return booking;
}

/**
 * Customer side: request a booking on an AVAILABLE slot.
 * Rules: slot must exist for the worker and be AVAILABLE; must not overlap a
 * RESERVED/BOOKED slot. On success the slot flips to RESERVED, the booking is
 * created as REQUESTED with its audit event, and the worker is notified.
 */
export async function demoCreateBookingRequest(
  input: BookingRequestInput
): Promise<Booking | { error: "slot-taken" | "invalid" }> {
  const worker = workerById(input.workerId);
  const slot = STORE.slots.find((s) => s.id === input.slotId && s.workerId === input.workerId);
  // Rule 1 — unknown worker/slot, or the slot is no longer free.
  if (!worker || !slot) return { error: "invalid" };
  if (slot.status !== "available") return { error: "slot-taken" };

  // Rule 2 — overlap guard against RESERVED/BOOKED/BLOCKED slots of the same
  // worker. BLOCKED is included: a worker's explicit off-time (e.g. "Site
  // visit") must not be bookable by overlap either.
  const start = new Date(slot.startAt).getTime();
  const end = new Date(slot.endAt).getTime();
  const clash = STORE.slots.some((s) => {
    if (s.workerId !== input.workerId || s.id === slot.id) return false;
    if (s.status !== "reserved" && s.status !== "booked" && s.status !== "blocked") return false;
    const sStart = new Date(s.startAt).getTime();
    const sEnd = new Date(s.endAt).getTime();
    return start < sEnd && end > sStart; // half-open overlap
  });
  if (clash) return { error: "slot-taken" };

  // Ordering invariant: the slot is flipped to RESERVED *before* the booking
  // is created and linked (slot.bookingId below), and nothing throws between
  // the two — so a RESERVED slot always has a booking. The W2 Prisma adapter
  // preserves this inside prisma.$transaction (row lock on the slot row).
  slot.status = "reserved";
  STORE.counter += 1;
  const booking: Booking = {
    id: `bk-${STORE.counter}`,
    number: `BK-${STORE.counter}`,
    workerId: input.workerId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    jobTitle: input.jobTitle,
    note: input.note,
    serviceItem: input.serviceItem,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: "requested",
    currency: worker.currency,
    events: [{ status: "requested", actorType: "customer", time: new Date().toISOString() }],
  };
  slot.bookingId = booking.id;
  STORE.bookings.push(booking);

  await notifyWorker(booking, "worker-request");
  return booking;
}

/**
 * Worker side: accept (with optional quote/deposit) or decline a REQUESTED
 * booking. Accept → CONFIRMED (or PENDING_PAYMENT when a deposit is required)
 * and the slot becomes BOOKED. Decline → DECLINED and the slot returns to
 * AVAILABLE (rule 3). Every transition appends an audit event (rule 5).
 */
export async function demoRespondToBooking(
  bookingId: string,
  input: BookingRespondInput
): Promise<Booking | null> {
  const booking = STORE.bookings.find((b) => b.id === bookingId);
  if (!booking || booking.status !== "requested") return null;
  const slot = STORE.slots.find((s) => s.bookingId === bookingId);

  if (input.accept) {
    // Rule 4 — deposit required → PENDING_PAYMENT until the paymentId lands.
    booking.status = input.deposit ? "pendingPayment" : "confirmed";
    booking.quote = input.quote;
    booking.deposit = input.deposit;
    // M5 take rate (docs/booking-take-rate.md) — the fee is a snapshot of the
    // quote (minor units), computed from the worker's CURRENT plan so an
    // Enterprise subscription waives it. The same computePlatformFee the
    // RespondDialog previews — no drift. Accept-without-quote stays fee-free.
    if (input.quote) {
      booking.platformFee = computePlatformFee(input.quote, {
        exempt: isPlanFeeExempt(workerById(booking.workerId)?.subscription.plan),
      });
      booking.platformFeeRateBps = PLATFORM_FEE_RATE_BPS;
    }
    if (input.deposit) {
      // M3 — every deposit gets a Payment row so the checkout can attach to it.
      const payment: BookingPayment = {
        id: `pay-${booking.id}`,
        amount: input.deposit,
        currency: booking.currency,
        status: "pending",
      };
      STORE.payments.set(booking.id, payment);
      booking.paymentId = payment.id;
    }
    if (slot) slot.status = "booked";
    booking.events.push({ status: booking.status, actorType: "worker", time: new Date().toISOString() });
    await notifyCustomer(booking, "customer-confirmed");
  } else {
    // Rule 3 — decline frees the slot.
    booking.status = "declined";
    if (slot) {
      slot.status = "available";
      slot.bookingId = undefined;
    }
    booking.events.push({
      status: "declined",
      actorType: "worker",
      reason: input.declineReason,
      time: new Date().toISOString(),
    });
    await notifyCustomer(booking, "customer-declined");
  }
  return booking;
}

/**
 * M1 recurring bookings (ENHANCEMENT-PLAN §7 #1) — worker's active contracts.
 */
export function demoGetWorkerRecurrings(workerId: string): RecurringBooking[] {
  return STORE.recurrings
    .filter((r) => r.workerId === workerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * M1 — customer asks for a repeat service (weekly/biweekly/monthly). The first
 * occurrence goes through the exact one-shot claim (slot AVAILABLE, overlap
 * guard, RESERVED, REQUESTED booking + worker notification), then a contract
 * wraps it. The worker's single accept confirms the whole cadence.
 */
export async function demoCreateRecurringRequest(
  input: RecurringRequestInput
): Promise<{ recurring: RecurringBooking; booking: Booking } | { error: "slot-taken" | "invalid" }> {
  // Rule 1+2 — the same claim + overlap guard as a one-shot request.
  const booking = await demoCreateBookingRequest(input);
  if ("error" in booking) return booking;

  const recurring: RecurringBooking = {
    id: `rc-${STORE.recurringSeq}`,
    number: `RC-${STORE.recurringSeq}`,
    workerId: input.workerId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    serviceItem: input.serviceItem,
    jobTitle: input.jobTitle,
    note: input.note,
    frequency: input.frequency,
    anchorStart: booking.startAt,
    anchorEnd: booking.endAt,
    status: "active",
    occurrences: [booking],
    createdAt: new Date().toISOString(),
  };
  STORE.recurringSeq += 1;
  booking.recurringId = recurring.id;
  STORE.recurrings.push(recurring);
  return { recurring, booking };
}

/**
 * M1 — worker accepts (quote/deposit) or declines the whole contract. Accept
 * confirms the first occurrence through the normal respond path (slot → BOOKED,
 * take-rate stamp, customer notification) and materializes the next
 * RECURRING_OCCURRENCE_COUNT occurrences as confirmed bookings with the same
 * terms — each on its cadence time, slot-less in the demo adapter (the prisma
 * wave claims real slots via the CAS). Decline cancels the contract and frees
 * the first occurrence's slot.
 */
export async function demoRespondToRecurring(
  recurringId: string,
  input: RecurringRespondInput
): Promise<RecurringBooking | null> {
  const recurring = STORE.recurrings.find((r) => r.id === recurringId);
  if (!recurring || recurring.status !== "active") return null;
  const first = recurring.occurrences[0];
  if (!first) return null;

  if (input.accept) {
    const responded = await demoRespondToBooking(first.id, {
      accept: true,
      quote: input.quote,
      deposit: input.deposit,
    });
    if (!responded) return null;

    // Materialize the cadence — same terms, each occurrence keeps the anchor's
    // time-of-day. Slot-less in the demo adapter; the prisma wave generates
    // real AVAILABLE slots and claims them via the same CAS.
    const nextStarts = generateRecurringOccurrences(
      recurring.anchorStart,
      recurring.frequency,
      RECURRING_OCCURRENCE_COUNT
    );
    const duration = new Date(recurring.anchorEnd).getTime() - new Date(recurring.anchorStart).getTime();
    const worker = workerById(recurring.workerId);
    for (const startAt of nextStarts) {
      STORE.counter += 1;
      const occ: Booking = {
        id: `bk-${STORE.counter}`,
        number: `BK-${STORE.counter}`,
        workerId: recurring.workerId,
        customerId: recurring.customerId,
        customerName: recurring.customerName,
        customerPhone: recurring.customerPhone,
        customerEmail: recurring.customerEmail,
        serviceItem: recurring.serviceItem,
        jobTitle: recurring.jobTitle,
        note: recurring.note,
        startAt,
        endAt: new Date(new Date(startAt).getTime() + duration).toISOString(),
        status: "confirmed",
        quote: responded.quote,
        deposit: responded.deposit,
        platformFee: responded.platformFee,
        platformFeeRateBps: responded.platformFeeRateBps,
        currency: worker?.currency ?? responded.currency,
        recurringId: recurring.id,
        events: [
          {
            status: "confirmed",
            actorType: "system",
            reason: `recurring ${recurring.frequency}`,
            time: new Date().toISOString(),
          },
        ],
      };
      recurring.occurrences.push(occ);
      STORE.bookings.push(occ);
    }
  } else {
    // Decline the contract = decline the first occurrence (frees the slot);
    // the normal respond path already notifies the customer.
    await demoRespondToBooking(first.id, { accept: false, declineReason: input.declineReason });
    recurring.status = "cancelled";
  }
  return recurring;
}

/** A customer's contracts, matched by email or normalized phone (mirrors
 * demoGetCustomerBookings). */
export function demoGetCustomerRecurrings(identifier: { email?: string; phone?: string } = {}): RecurringBooking[] {
  const phone = identifier.phone?.replace(/[\s\-()]/g, "");
  return STORE.recurrings
    .filter((r) => {
      if (identifier.email && r.customerEmail?.toLowerCase() === identifier.email.toLowerCase()) return true;
      if (phone && r.customerPhone.replace(/[\s\-()]/g, "") === phone) return true;
      return false;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Customer cancels an active contract: the anchor occurrence goes through the
 * normal cancel path (frees the slot + notifies), every future occurrence is
 * cancelled in place (slot-less), and the contract flips to CANCELLED.
 */
export async function demoCancelRecurringContract(
  recurringId: string,
  reason?: string
): Promise<RecurringBooking | null> {
  const recurring = STORE.recurrings.find((r) => r.id === recurringId);
  if (!recurring || recurring.status !== "active") return null;

  for (const occ of recurring.occurrences.slice(1)) {
    if (BOOKING_TERMINAL_STATUSES.includes(occ.status)) continue;
    occ.status = "cancelled";
    occ.events.push({
      status: "cancelled",
      actorType: "customer",
      reason,
      time: new Date().toISOString(),
    });
  }
  const first = recurring.occurrences[0];
  if (first && !BOOKING_TERMINAL_STATUSES.includes(first.status)) {
    await demoCancelBooking(first.id, { by: "customer", reason });
  }
  recurring.status = "cancelled";
  return recurring;
}
