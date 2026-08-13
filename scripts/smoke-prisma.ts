/*
 * Smoke test for the Prisma repository layer (W1 catalog + W2 bookings).
 *
 *   npm run db:smoke        # requires a reachable, migrated DATABASE_URL
 *
 * Exercises the production data layer (prisma-repo.ts) directly against the
 * database: categories, worker profile mapping, search (filters + Arabic
 * query), featured + related reads — plus the W2 booking seam: reads,
 * createBookingRequest (AVAILABLE→RESERVED atomic claim), the double-booking
 * rejection, respondToBooking accept (→ CONFIRMED, slot BOOKED) — and the M2
 * availability editor: generateSlots (weekly template materialization,
 * idempotency, past-hour guard, 24/7 emergency marker) + setSlotBlocked
 * (block/unblock, RESERVED refusal) — and a concurrency race: N parallel
 * createBookingRequest calls on one slot must yield exactly one winner (the
 * atomic AVAILABLE→RESERVED claim) with no double-booking and no orphaned
 * RESERVED slots. M4 covers the booking reminder cron: a CONFIRMED booking
 * starting within 24h gets exactly one "job starts tomorrow" notification and
 * its Booking.lastReminderSent stamp; a second engine run dispatches nothing.
 * M4 ops covers the lifecycle: confirmed → inProgress → completed (illegal
 * transitions rejected), no-show voiding, cancellation — reason/actor
 * stored, slot freed — and reschedule (CONFIRMED → new AVAILABLE slot: old
 * freed, target claimed, RESCHEDULED event + customer notification). The M4
 * cancellation policy window (BOOKING_CANCEL_REFUND_WINDOW_MS) is exercised
 * live: a worker cancel 30h out refunds the paid deposit (→ REFUNDED), a
 * worker cancel 2h out keeps it (stays PAID). M3 invoice rows: the guest
 * deposit booking gets NO invoice on confirm, while a signed-in variant
 * (customerId = seeded Sara) gets a WA-YYYY-NNNNN Invoice tied to the payment
 * that the customer lookup maps onto the booking.
 * The customer-side lookup (prismaGetCustomerBookings)
 * is checked for email (case-insensitive) + phone (separators stripped on
 * both sides) + stranger exclusion. W2 campaigns run the self-serve ad
 * purchase circle through the prisma adapters against the seeded company:
 * prismaCreateCampaign (PENDING AdCampaign + primary creative + PENDING
 * payment + checkout) → prismaConfirmCampaignPayment (ACTIVE + PAID + the
 * purchase's PAID WA-YYYY-NNNNN Invoice + "Campaign is live" notification)
 * → prismaRefundCampaignPayment (campaign ENDED + payment REFUNDED + the
 * credit-note VOID on the minted invoice + campaignRefunded notification),
 * with the refund email rendered from the SAME shared builder the /admin
 * preview uses. A cleanup restores the seeded rows so
 * the smoke is idempotent. Exits non-zero on any failure.
 */
// This smoke IS the production data layer — force the prisma notification path
// (DEMO_MODE=false) so the reminder engine persists to the DB instead of the
// demo in-memory inbox. .env defaults DEMO_MODE to true. Note: static imports
// hoist, so this assignment runs after module evaluation — but every adapter
// gate reads process.env per call, so it takes effect before any data call.
process.env.DEMO_MODE = "false";

import { getPrisma } from "../src/lib/server/prisma";
import type { SubscriptionPlan } from "@prisma/client";
import { FEE_EXEMPT_PLANS } from "../src/lib/data/booking-ui";
import { runBookingReminderEngine } from "../src/lib/notifications/reminders";
import {
  prismaCancelBooking,
  prismaChangeWorkerPlan,
  prismaConfirmBookingPayment,
  prismaConfirmCampaignPayment,
  prismaCreateBookingCheckout,
  prismaCreateBookingRequest,
  prismaCreateCampaign,
  prismaCreateCampaignCheckout,
  prismaGenerateSlots,
  prismaGetBookingFunnel,
  prismaGetPlatformFeeStats,
  prismaGetWorkerBalance,
  prismaRequestPayout,
  prismaDecidePayout,
  prismaGetCampaigns,
  prismaRescheduleBooking,
  prismaGetCategories,
  prismaGetCustomerBookings,
  prismaGetFeaturedWorkers,
  prismaGetRelated,
  prismaGetWorkerBookings,
  prismaGetWorkerBySlug,
  prismaGetWorkerSlots,
  prismaCancelRecurringContract,
  prismaCreateRecurringRequest,
  prismaGenerateRecurringOccurrences,
  prismaGetCustomerRecurrings,
  prismaGetWorkerRecurrings,
  prismaRespondToRecurring,
  prismaRefundCampaignPayment,
  prismaRespondToBooking,
  prismaSearchWorkers,
  prismaSetSlotBlocked,
  prismaTransitionBooking,
} from "../src/lib/data/prisma-repo";
import { campaignRefundNotification } from "../src/lib/data/campaign-notifications";
import { renderCampaignRefundEmail } from "../src/lib/notifications/templates";

/** Notification types the smoke may create — never part of the seed. PROMO is
 * the "Campaign is live" push (app type `campaign` → DB PROMO), CAMPAIGN_REFUNDED
 * the refund push — both from the W2 campaign section. */
const SMOKE_NOTIFICATION_TYPES = [
  "BOOKING_REQUEST",
  "BOOKING_CONFIRMED",
  "BOOKING_DECLINED",
  "BOOKING_REMINDER",
  "BOOKING_CANCELLED",
  "BOOKING_COMPLETED",
  "BOOKING_PAID",
  "BOOKING_RESCHEDULED",
  "BOOKING_REFUND",
  "PROMO",
  "CAMPAIGN_REFUNDED",
] as const;

function assert(cond: unknown, label: string): asserts cond {
  if (!cond) throw new Error(`SMOKE ASSERT FAILED: ${label}`);
}

async function main() {
  const prisma = getPrisma();
  const workersInDb = await prisma.worker.count();
  console.log("workers in DB:", workersInDb);
  assert(workersInDb > 0, "database is seeded (run npm run db:seed)");

  const cats = await prismaGetCategories();
  console.log("categories:", cats.length, "| first:", cats[0]?.slug, cats[0]?.workerCount, cats[0]?.professionEn);
  assert(cats.length > 0, "categories returned");
  assert(cats[0]?.workerCount >= 0, "category workerCount present");

  const khaled = await prismaGetWorkerBySlug("khaled-al-harbi-plumbing");
  console.log(
    "khaled:", khaled?.nameEn, "| verification:", khaled?.verification,
    "| plan:", khaled?.subscription.plan, khaled?.subscription.status,
    "| reviews:", khaled?.reviews.length, "| rating:", khaled?.rating
  );
  assert(khaled !== null, "khaled profile maps");
  assert(khaled!.reviews.length > 0, "khaled reviews mapped");
  // Worker prices divide back from minor units (×100) to major for the UI.
  assert(khaled!.priceMin > 0 && khaled!.priceMax > khaled!.priceMin, "worker prices map to major units");
  assert(typeof khaled!.subscription.plan === "string", "khaled subscription mapped");

  const byCat = await prismaSearchWorkers({ category: "plumbing", sort: "rating" });
  console.log("search category=plumbing:", byCat.total, "| top:", byCat.items[0]?.nameEn, "|", byCat.tookMs, "ms");
  assert(byCat.total > 0, "category search returns rows");
  assert(byCat.items.every((w) => w.categorySlug === "plumbing"), "category filter applied");

  const byQ = await prismaSearchWorkers({ query: "سباك" });
  console.log("search 'سباك':", byQ.total, "|", byQ.items.slice(0, 3).map((w) => w.nameEn));
  assert(byQ.total > 0, "Arabic query matches");

  const featured = await prismaGetFeaturedWorkers(3);
  console.log("featured:", featured.length, featured.map((w) => w.nameEn));
  assert(featured.length > 0 && featured.length <= 3, "featured workers returned");

  const related = await prismaGetRelated(khaled!, 2);
  console.log("related to khaled:", related.map((w) => w.nameEn));
  assert(related.length <= 2, "related workers capped");

  const all = await prisma.worker.count({ where: { subscription: { is: { status: { not: "EXPIRED" } } } } });
  console.log("workers with non-expired subscription (public search):", all);
  assert(all > 0, "public search population present");

  // Self-healing (crash-safety): a previous run that died mid-way (assert
  // throw before cleanup) leaves a smoke booking + its BOOKED slot behind,
  // which would break the "an AVAILABLE slot exists" assert below. Restore the
  // slot FIRST (while the booking still exists to match bookingId), then drop
  // the booking + its events. Only our smoke bookings are touched.
  const smokeBookings = await prisma.booking.findMany({ where: { customerEmail: "smoke@workersarena.test" } });
  for (const b of smokeBookings) {
    await prisma.bookingSlot.updateMany({ where: { bookingId: b.id }, data: { status: "AVAILABLE", bookingId: null } });
    await prisma.bookingEvent.deleteMany({ where: { bookingId: b.id } });
    // Payouts (docs/payouts.md) — the completion credit's ledger row has no
    // cascade from the booking (SetNull would orphan it), so the sweep drops
    // it explicitly alongside the booking.
    await prisma.workerLedgerEntry.deleteMany({ where: { bookingId: b.id } });
    await prisma.booking.delete({ where: { id: b.id } });
  }
  if (smokeBookings.length > 0) console.log("self-heal: removed", smokeBookings.length, "leftover smoke booking(s)");

  // M4 self-heal — a crashed run's reminder booking + its dedicated slot (the
  // booking links the slot via bookingId; delete the booking first, then the
  // now-unlinked slot) plus every booking notification row the smoke may have
  // created. The seed creates NO Notification rows, so this always restores it
  // (caveat: with DEMO_MODE=false the smoke persists its own notification rows
  // and wipes the BOOKING_* types — any manually-created booking
  // notifications in the local dev DB are removed too).
  const reminderLeftovers = await prisma.booking.findMany({ where: { customerEmail: "reminder@workersarena.test" } });
  for (const b of reminderLeftovers) {
    const linkedSlots = await prisma.bookingSlot.findMany({ where: { bookingId: b.id } });
    await prisma.bookingEvent.deleteMany({ where: { bookingId: b.id } });
    await prisma.booking.delete({ where: { id: b.id } });
    if (linkedSlots.length > 0) {
      await prisma.bookingSlot.deleteMany({ where: { id: { in: linkedSlots.map((s) => s.id) } } });
    }
  }
  await prisma.notification.deleteMany({ where: { type: { in: [...SMOKE_NOTIFICATION_TYPES] } } });
  if (reminderLeftovers.length > 0) console.log("self-heal: cleared", reminderLeftovers.length, "leftover reminder booking(s)");

  // M4 ops self-heal — a crashed run's transition/cancel bookings (ops@…).
  const opsLeftovers = await prisma.booking.findMany({ where: { customerEmail: "ops@workersarena.test" } });
  for (const b of opsLeftovers) {
    const linkedSlots = await prisma.bookingSlot.findMany({ where: { bookingId: b.id } });
    await prisma.bookingEvent.deleteMany({ where: { bookingId: b.id } });
    await prisma.booking.delete({ where: { id: b.id } });
    if (linkedSlots.length > 0) {
      await prisma.bookingSlot.deleteMany({ where: { id: { in: linkedSlots.map((s) => s.id) } } });
    }
  }
  if (opsLeftovers.length > 0) console.log("self-heal: cleared", opsLeftovers.length, "leftover ops booking(s)");

  // W2 recurring self-heal — a crashed run's contracts (recurring@…): drop
  // the occurrences (Bookings — their events cascade), the contract rows, and
  // the dedicated slots (the note sweep below picks up any orphaned AVAILABLE
  // slot too).
  const recLeftovers = await prisma.recurringBooking.findMany({ where: { customerEmail: "recurring@workersarena.test" } });
  for (const rc of recLeftovers) {
    await prisma.booking.deleteMany({ where: { recurringBookingId: rc.id } });
    await prisma.recurringBooking.delete({ where: { id: rc.id } });
  }
  if (recLeftovers.length > 0) console.log("self-heal: removed", recLeftovers.length, "leftover smoke recurring contract(s)");

  // Dedicated-slot sweep — every smoke section marks its dedicated slots with
  // a note (smoke-m3 / smoke-reschedule / smoke-reminder / smoke-ops) so a
  // crashed run's slots are always findable even when unlinked (a crash
  // between slot-create and booking-create leaves an orphaned AVAILABLE
  // slot). Run the sweep BEFORE the sections create fresh slots. The
  // deposit/reschedule leftovers also carry a Payment row + events + the
  // linked slot — restore the linked slot first (while the booking still
  // exists to match bookingId), drop payment + events + booking.
  const m3rsLeftovers = await prisma.booking.findMany({
    where: {
      customerEmail: {
        in: [
          "deposit@workersarena.test",
          "reschedule@workersarena.test",
          "depositu@workersarena.test",
          "activity@workersarena.test",
          "payout@workersarena.test",
        ],
      },
    },
  });
  for (const b of m3rsLeftovers) {
    // The signed-in variant mints an Invoice linked to the payment — delete it
    // while the payment still exists (Invoice.paymentId SetNulls on payment
    // delete, which would orphan the receipt row).
    const payIds = await prisma.payment.findMany({
      where: { metadata: { path: ["bookingId"], equals: b.id } },
      select: { id: true },
    });
    await prisma.invoice.deleteMany({ where: { paymentId: { in: payIds.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { metadata: { path: ["bookingId"], equals: b.id } } });
    await prisma.bookingSlot.updateMany({ where: { bookingId: b.id }, data: { status: "AVAILABLE", bookingId: null } });
    await prisma.bookingEvent.deleteMany({ where: { bookingId: b.id } });
    // Payouts (docs/payouts.md) — the completion credit's ledger row has no
    // cascade from the booking (SetNull would orphan it), so the sweep drops
    // it explicitly alongside the booking.
    await prisma.workerLedgerEntry.deleteMany({ where: { bookingId: b.id } });
    await prisma.booking.delete({ where: { id: b.id } });
  }
  await prisma.bookingSlot.deleteMany({
    where: {
      note: { in: ["smoke-m3", "smoke-reschedule", "smoke-reminder", "smoke-ops", "smoke-activity", "smoke-recurring-anchor", "smoke-recurring-7d", "smoke-recurring-14d", "smoke-recurring-decline"] },
    },
  });
  if (m3rsLeftovers.length > 0) console.log("self-heal: cleared", m3rsLeftovers.length, "leftover deposit/reschedule booking(s)");

  // M4 activity self-heal — booking lifecycle feed entries (ActivityLog rows
  // keyed by the bookingNo in meta, written by the seam/adapter logging
  // sites) must never outlive their booking: a crashed run (or a booking
  // deleted outside the smoke) leaves BOOKING_* entries pointing at nothing,
  // and the live admin feed would accumulate them — the funnel's counts and
  // Recent activity would stop telling one story. This orphan sweep runs
  // AFTER the leftover-booking deletes above (a still-existing booking keeps
  // its entries via NOT EXISTS; real dev bookings are never touched) and
  // BEFORE the sections create fresh bookings.
  await prisma.$executeRaw`
    DELETE FROM "ActivityLog" a
    WHERE a.meta->>'bookingNo' LIKE 'BK-%'
      AND NOT EXISTS (SELECT 1 FROM "Booking" b WHERE b.number = a.meta->>'bookingNo')
  `;

  // ── W2 — bookings & scheduling (read + mutate + cleanup) ───────────────────
  const slots = await prismaGetWorkerSlots(khaled!.id);
  console.log("khaled slots:", slots.length, slots.map((s) => `${s.status}@${s.startAt.slice(11, 16)}`));
  assert(slots.length >= 3, "seeded booking slots present");

  const bookingsBefore = await prismaGetWorkerBookings(khaled!.id);
  console.log("khaled bookings:", bookingsBefore.length, bookingsBefore.map((b) => `${b.number}:${b.status}`));
  assert(bookingsBefore.some((b) => b.number === "BK-1001"), "seeded booking BK-1001 present");

  // W1 trust signals (docs/ENHANCEMENT-PLAN.md §2.1) — the read adapters stamp
  // responseRate + availableThisWeek. The seeded AVAILABLE slot (tomorrow) is
  // within the 7-day window, and the seeded BK-1001 is still REQUESTED → 0%
  // answered. expectedFree is computed from the SAME slots read above so a
  // stale DB (seeded more than 7 days ago) can't flake the assert — the window
  // check mirrors hasFreeSlotsThisWeek in booking-ui.ts.
  const signalWorker = await prismaGetWorkerBySlug(khaled!.slug);
  const expectedFree = slots.some(
    (s) =>
      s.status === "available" &&
      Date.parse(s.startAt) >= Date.now() &&
      Date.parse(s.startAt) <= Date.now() + 7 * 24 * 60 * 60 * 1000
  );
  assert(signalWorker?.availableThisWeek === expectedFree, "availableThisWeek mirrors the AVAILABLE-slot window");
  // The seed now owns TWO bookings for Khaled: BK-1001 (REQUESTED, unanswered)
  // + the recurring contract's BK-1002 (CONFIRMED, answered) → 1 of 2 = 50%.
  assert(signalWorker?.responseRate === 50, "response rate computed from the seeded bookings (BK-1001 requested + BK-1002 confirmed → 50%)");
  console.log("W1 trust signals: responseRate", signalWorker?.responseRate, "| availableThisWeek", signalWorker?.availableThisWeek);

  // ── M5 — fee-waived search filter (real mode, live DB) ────────────────────
  // The /search sidebar toggle + hero chip narrow to Enterprise (fee-waived)
  // workers (docs/booking-take-rate.md). Self-referential: the expected exempt
  // set is read straight from the live Subscription rows, so a seed with extra
  // Enterprise workers can't flake the assert.
  const exemptWorkerIds = new Set(
    (
      await prisma.subscription.findMany({
        where: { plan: { in: FEE_EXEMPT_PLANS.map((p) => p.toUpperCase()) as SubscriptionPlan[] } },
        select: { workerId: true },
      })
    ).map((s) => s.workerId)
  );
  const waived = await prismaSearchWorkers({ feeWaivedOnly: true });
  assert(waived.items.length > 0, "fee-waived filter returns results");
  assert(
    waived.items.every((w) => exemptWorkerIds.has(w.id)),
    "fee-waived filter returns ONLY exempt-plan workers"
  );
  const bilal = await prismaGetWorkerBySlug("bilal-mansour-cleaning");
  assert(bilal?.subscription.plan === "enterprise", "seeded Enterprise worker (bilal) is Enterprise in the DB");
  assert(
    waived.items.some((w) => w.slug === "bilal-mansour-cleaning"),
    "fee-waived filter includes the seeded Enterprise worker"
  );
  const unfiltered = await prismaSearchWorkers({});
  assert(
    unfiltered.items.some((w) => w.slug === "khaled-al-harbi-plumbing"),
    "unfiltered search still surfaces non-exempt workers (khaled)"
  );
  console.log(
    `M5 fee-waived filter: ${waived.items.length} Enterprise-only result(s); unfiltered search unaffected`
  );

  // ── M5 — admin inline plan change (worker-management audit table) ─────────
  // The audit table's inline plan select reaches the prisma adapter
  // (prismaChangeWorkerPlan — the real-mode side of the changeWorkerPlan
  // seam, with the acting admin's identity): swap a worker's tier directly,
  // REACTIVATING an expired subscription so the correction takes effect in
  // public search (the expired status hides the worker), and log an
  // ADMIN_PLAN_CHANGED entry to the activity feed (admin + worker + from → to
  // — identical copy to the demo seam). Self-healing — the seeded rows AND
  // the audit entries are restored afterwards.
  const preBilal = await prismaGetWorkerBySlug("bilal-mansour-cleaning");
  assert(preBilal?.subscription.plan === "enterprise", "bilal starts Enterprise (seeded)");
  const preTariq = await prismaGetWorkerBySlug("tariq-al-shammari-roofing");
  assert(
    preTariq?.subscription.plan === "basic" && preTariq.subscription.status === "expired",
    "tariq starts Basic + expired (hidden from public search)"
  );
  // The acting admin's REAL user id (ActivityLog.actorId is an FK to User.id —
  // the same id the action threads from session.id; demo session ids like
  // "u-admin" have no user row and would violate the constraint).
  const adminUser = await prisma.user.findUnique({ where: { email: "admin@workersarena.com" } });
  assert(adminUser, "seeded admin user exists");

  const bilalChanged = await prismaChangeWorkerPlan(preBilal!.id, "premium", {
    actor: "Platform Admin",
    actorId: adminUser!.id,
  });
  assert(bilalChanged?.subscription.plan === "premium", "prismaChangeWorkerPlan swaps the tier");
  const bilalRow = await prisma.subscription.findUnique({ where: { workerId: preBilal!.id } });
  assert(
    bilalRow?.plan === "PREMIUM" && bilalRow.price === 11900,
    "DB row flipped to PREMIUM at the premium price (119 × 100 minor)"
  );
  // The audit trail — the same entry the demo seam writes: code + type worker +
  // actor + real admin FK + from → to copy.
  const planLog = await prisma.activityLog.findFirst({
    where: { action: "ADMIN_PLAN_CHANGED", actorId: adminUser!.id },
    orderBy: { createdAt: "desc" },
  });
  assert(planLog, "plan change logged to the activity feed");
  const planMeta = (planLog!.meta ?? {}) as { actor?: string; type?: string; actionEn?: string };
  assert(planMeta.actor === "Platform Admin", "feed entry carries the acting admin");
  assert(planMeta.type === "worker", "feed entry typed worker");
  assert(
    planMeta.actionEn?.includes("Bilal Mansour") && planMeta.actionEn.includes("Enterprise → Premium"),
    "feed copy carries worker + from → to plan"
  );

  const tariqChanged = await prismaChangeWorkerPlan(preTariq!.id, "professional");
  assert(
    tariqChanged?.subscription.plan === "professional" && tariqChanged.subscription.status === "active",
    "expired subscription reactivated by the plan change"
  );
  assert(
    Date.parse(tariqChanged!.subscription.expiresAt) > Date.now() + 27 * 86400000,
    "reactivation extends the expiry ~1 month"
  );
  const tariqSearchable = await prismaSearchWorkers({ query: "Tariq" });
  assert(
    tariqSearchable.items.some((w) => w.slug === "tariq-al-shammari-roofing"),
    "reactivated worker visible in public search"
  );

  // Restore the seeded rows AND the audit entry so the smoke stays idempotent.
  await prisma.subscription.update({
    where: { workerId: preBilal!.id },
    data: { plan: "ENTERPRISE", price: 29900, status: "ACTIVE" },
  });
  await prisma.subscription.update({
    where: { workerId: preTariq!.id },
    data: {
      plan: "BASIC",
      price: 2900,
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 6 * 86400000),
    },
  });
  // Audit entries are keyed by their copy (no workerId in meta) — scope the
  // sweep by the seeded worker names the section's copy always references, so
  // a crashed run's leftovers are healed without touching real entries.
  await prisma.activityLog.deleteMany({
    where: {
      action: "ADMIN_PLAN_CHANGED",
      OR: [
        { meta: { path: ["actionEn"], string_contains: "Bilal Mansour" } },
        { meta: { path: ["actionEn"], string_contains: "Tariq Al-Shammari" } },
      ],
    },
  });
  console.log(
    "M5 admin plan change: tier swap + expired reactivation + ADMIN_PLAN_CHANGED feed entry verified, seeded rows restored"
  );

  const free = slots.find((s) => s.status === "available");
  assert(free, "an AVAILABLE slot exists for the request flow");

  const created = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: free!.id,
    customerName: "Smoke Tester",
    customerPhone: "+966 50 999 9999",
    customerEmail: "smoke@workersarena.test",
    jobTitle: "Smoke test booking",
  });
  if ("error" in created) throw new Error(`SMOKE ASSERT FAILED: createBookingRequest → ${created.error}`);
  console.log("created:", created.number, created.status, "| slot now:", (await prismaGetWorkerSlots(khaled!.id)).find((s) => s.id === free!.id)?.status);
  // Seed bookings: BK-1001 (request) + BK-1002 (recurring occurrence) → next is BK-1003.
  assert(created.number === "BK-1003", "booking number continues from the seed (BK-1001 + recurring BK-1002)");
  assert(created.status === "requested", "new booking is REQUESTED");
  assert(created.events[0]?.status === "requested", "REQUESTED audit event appended");

  // Rule 1 — a second request on the same slot must lose the atomic claim.
  const again = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: free!.id,
    customerName: "Smoke Tester 2",
    customerPhone: "+966 50 888 8888",
    jobTitle: "Double-book attempt",
  });
  console.log("second request on same slot:", JSON.stringify(again));
  assert(!("error" in again) ? false : again.error === "slot-taken", "double-booking rejected (slot-taken)");

  // Rule 2 — a request OVERLAPPING the seeded RESERVED slot (BK-1001's 10:00)
  // must be rejected AND leave the attempted slot AVAILABLE (the overlap guard
  // runs before the claim, so no orphaned RESERVED slot is left behind).
  const reserved = (await prismaGetWorkerSlots(khaled!.id)).find((s) => s.status === "reserved");
  assert(reserved, "a RESERVED slot exists for the overlap test");
  const overlapStart = new Date(new Date(reserved!.startAt).getTime() + 30 * 60 * 1000); // 10:30
  const overlapSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: overlapStart,
      endAt: new Date(overlapStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
    },
  });
  const overlapAttempt = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: overlapSlot.id,
    customerName: "Smoke Tester 3",
    customerPhone: "+966 50 777 7777",
    jobTitle: "Overlap attempt",
  });
  const overlapSlotAfter = await prisma.bookingSlot.findUnique({ where: { id: overlapSlot.id } });
  console.log("overlap attempt:", JSON.stringify(overlapAttempt), "| attempted slot now:", overlapSlotAfter?.status);
  assert(!("error" in overlapAttempt) ? false : overlapAttempt.error === "slot-taken", "overlapping request rejected (slot-taken)");
  assert(overlapSlotAfter?.status === "AVAILABLE", "overlap rejection leaves the attempted slot AVAILABLE (no orphan)");
  await prisma.bookingSlot.delete({ where: { id: overlapSlot.id } });

  // Worker accepts with a quote → CONFIRMED, slot BOOKED.
  const accepted = await prismaRespondToBooking(created.id, { accept: true, quote: 8000 });
  assert(accepted !== null, "respondToBooking returns the booking");
  assert(accepted!.status === "confirmed", "accept → CONFIRMED");
  assert(accepted!.quote === 8000, "quote stored in minor units");
  // M5 take rate (docs/booking-take-rate.md) — the fee snapshot stamps inside
  // the same tx, from the seeded Khaled (premium — not exempt): 7% of 8000 = 560.
  assert(
    accepted!.platformFee === 560 && accepted!.platformFeeRateBps === 700,
    "M5 platform fee + audit rate stamped at accept-with-quote"
  );
  assert(accepted!.events.at(-1)?.status === "confirmed", "CONFIRMED audit event appended");
  const slotAfterAccept = (await prismaGetWorkerSlots(khaled!.id)).find((s) => s.id === free!.id);
  assert(slotAfterAccept?.status === "booked", "accepted slot is BOOKED");
  console.log("accepted:", accepted!.number, accepted!.status, "| quote:", accepted!.quote, "| slot:", slotAfterAccept?.status);

  // ── Concurrency — N parallel requests on ONE slot, exactly one winner ─────
  // Fire 8 createBookingRequest calls at the same AVAILABLE slot at once. The
  // rule-1 atomic claim (updateMany WHERE status=AVAILABLE inside each
  // $transaction) is the Postgres row-lock + re-check in one statement: exactly
  // one CAS matches 0→1, the other 7 match 0 rows and get "slot-taken" with
  // their whole transaction rolled back (no partial bookings, no orphaned
  // RESERVED slot). The dedicated startAt (2026-08-30) can never collide with
  // the seeded Aug-11 slots, the M2 2027 window, or the UI's 14-day generate
  // range (ends Aug-24) — so a leftover here is always ours to clean.
  // Self-healing: a mid-race crash would leave a race booking + the dedicated
  // slot behind, and the create below would then hit the (workerId, startAt)
  // unique violation. Clear leftovers first — restore the linked slot, drop
  // the booking, then remove the stale dedicated slot.
  const raceLeftovers = await prisma.booking.findMany({ where: { customerEmail: { startsWith: "race" } } });
  for (const b of raceLeftovers) {
    await prisma.bookingSlot.updateMany({ where: { bookingId: b.id }, data: { status: "AVAILABLE", bookingId: null } });
    await prisma.bookingEvent.deleteMany({ where: { bookingId: b.id } });
    // Payouts (docs/payouts.md) — the completion credit's ledger row has no
    // cascade from the booking (SetNull would orphan it), so the sweep drops
    // it explicitly alongside the booking.
    await prisma.workerLedgerEntry.deleteMany({ where: { bookingId: b.id } });
    await prisma.booking.delete({ where: { id: b.id } });
  }
  await prisma.bookingSlot.deleteMany({
    where: { workerId: khaled!.id, startAt: new Date("2026-08-30T10:00:00.000Z") },
  });
  if (raceLeftovers.length > 0) console.log("self-heal: cleared", raceLeftovers.length, "leftover race booking(s)");

  const concSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: new Date("2026-08-30T10:00:00.000Z"),
      endAt: new Date("2026-08-30T11:00:00.000Z"),
      status: "AVAILABLE",
    },
  });
  const RACE_N = 8;
  const results = await Promise.all(
    Array.from({ length: RACE_N }, (_, i) =>
      prismaCreateBookingRequest({
        workerId: khaled!.id,
        slotId: concSlot.id,
        customerName: `Race Tester ${i}`,
        customerPhone: `+966 50 00${String(i).padStart(2, "0")} 00`,
        customerEmail: `race${i}@workersarena.test`,
        jobTitle: `Concurrent booking attempt ${i}`,
      })
    )
  );
  let winner: (typeof results)[number] | null = null;
  const rejected: string[] = [];
  for (const r of results) {
    if ("error" in r) rejected.push(r.error);
    else winner = r;
  }
  console.log(
    "race:", RACE_N, "parallel requests →", winner ? `1 winner (${winner.number})` : "0 winners?!",
    "| rejected:", rejected.join(",")
  );
  assert(winner !== null, "exactly one parallel request wins the slot");
  assert(rejected.length === RACE_N - 1, "all other parallel requests rejected");
  assert(rejected.every((e) => e === "slot-taken"), "losers rejected with slot-taken (not invalid)");

  const racedSlot = await prisma.bookingSlot.findUnique({ where: { id: concSlot.id } });
  assert(racedSlot?.status === "RESERVED", "contended slot ends RESERVED");
  assert(racedSlot.bookingId === winner!.id, "contended slot is claimed by the winner's booking");
  const slotBookingCount = await prisma.booking.count({ where: { slot: { is: { id: concSlot.id } } } });
  assert(slotBookingCount === 1, "exactly one booking exists for the contended slot");
  // The RESERVED-without-booking invariant, worker-wide: no orphaned RESERVED
  // slots after the race (the seeded 10:00 is RESERVED but IS linked to BK-1001).
  const orphanedReserved = await prisma.bookingSlot.count({
    where: { workerId: khaled!.id, status: "RESERVED", bookingId: null },
  });
  assert(orphanedReserved === 0, "no RESERVED slot is left without a linked booking");

  // Race cleanup — drop the winner's booking (slot.bookingId auto-clears via
  // onDelete SetNull), then remove the dedicated slot itself.
  await prisma.bookingEvent.deleteMany({ where: { bookingId: winner!.id } });
  await prisma.booking.delete({ where: { id: winner!.id } });
  await prisma.bookingSlot.delete({ where: { id: concSlot.id } });

  // ── M2 — availability editor (generate + block, live DB) ───────────────────
  // Far-future deterministic window (local-time constructor, like the unit
  // tests): Mon 2027-01-04 → Sun 2027-01-10. Khaled's template: Sun–Thu
  // (08:00–18:00) × 10, Fri (09:00–14:00) × 5, Sat = 24/7 marker × 24 = 79.
  // No seeded rows exist in 2027, so every slot created here is ours to clean.
  const GEN_FROM = new Date(2027, 0, 4); // Monday
  const GEN_TO = new Date(2027, 0, 10); // Sunday — generation includes this whole day
  // Read-back/cleanup bound: generation's `to` is day-INCLUSIVE while the
  // slot read is `startAt <= to` — extend to end-of-Sunday so the full day
  // (Sunday's 10 slots) round-trips and gets cleaned.
  const GEN_READ_TO = new Date(2027, 0, 10, 23, 59, 59, 999);
  const GEN_NOW = new Date(2027, 0, 1); // before the window → no past-hour skips

  // Self-healing: a previously crashed run (assert throw before cleanup) would
  // leave generated slots behind and poison the counts below. Every slot in
  // this 2027 window is definitionally ours (no seed rows exist there), so
  // clear it before generating.
  await prisma.bookingSlot.deleteMany({ where: { workerId: khaled!.id, startAt: { gte: GEN_FROM, lte: GEN_READ_TO } } });

  const generated = await prismaGenerateSlots(
    khaled!.id,
    { from: GEN_FROM.toISOString(), to: GEN_TO.toISOString() },
    GEN_NOW
  );
  console.log("generateSlots (2027-01-04→10):", generated);
  assert(generated === 5 * 10 + 5 + 24, "weekly template materializes 79 slots");

  const genSlots = await prismaGetWorkerSlots(khaled!.id, { from: GEN_FROM.toISOString(), to: GEN_READ_TO.toISOString() });
  assert(genSlots.length === 79, "79 slots persisted and readable");
  assert(genSlots.every((s) => s.status === "available"), "generated slots are AVAILABLE");

  const regenerated = await prismaGenerateSlots(
    khaled!.id,
    { from: GEN_FROM.toISOString(), to: GEN_TO.toISOString() },
    GEN_NOW
  );
  console.log("generateSlots again (idempotency):", regenerated);
  assert(regenerated === 0, "re-generating the same window creates nothing");

  // Past-hour guard: `now` after the window → every start is in the past.
  const stale = await prismaGenerateSlots(
    khaled!.id,
    { from: GEN_FROM.toISOString(), to: GEN_TO.toISOString() },
    new Date(2027, 0, 11)
  );
  assert(stale === 0, "past-hour guard skips every already-started hour");

  // Block/unblock a generated slot, and refuse the seeded RESERVED one.
  const blockTarget = genSlots[0]!;
  const blocked = await prismaSetSlotBlocked(khaled!.id, blockTarget.id, true, "Smoke off-day");
  console.log("blocked:", blocked?.id, blocked?.status, blocked?.note);
  assert(blocked?.status === "blocked" && blocked.note === "Smoke off-day", "AVAILABLE → BLOCKED with note");

  // Re-fetch: the earlier `reserved` reference now points at BK-1002's slot,
  // which the accept flipped to BOOKED — the seeded 10:00 (BK-1001) is the
  // one still RESERVED and must refuse a block.
  const reservedNow = (await prismaGetWorkerSlots(khaled!.id)).find((s) => s.status === "reserved");
  assert(reservedNow, "the seeded RESERVED slot (BK-1001) still exists");
  const refuse = await prismaSetSlotBlocked(khaled!.id, reservedNow!.id, true);
  assert(refuse === null, "RESERVED slot cannot be blocked");
  const reservedAfter = (await prismaGetWorkerSlots(khaled!.id)).find((s) => s.id === reservedNow!.id);
  assert(reservedAfter?.status === "reserved", "RESERVED slot unchanged after refusal");

  const unblocked = await prismaSetSlotBlocked(khaled!.id, blockTarget.id, false);
  console.log("unblocked:", unblocked?.id, unblocked?.status, unblocked?.note);
  assert(unblocked?.status === "available" && unblocked.note === undefined, "BLOCKED → AVAILABLE, note cleared");

  // M2 cleanup — delete the generated window (every slot there is ours).
  await prisma.bookingSlot.deleteMany({ where: { workerId: khaled!.id, startAt: { gte: GEN_FROM, lte: GEN_READ_TO } } });

  // ── M4 — booking reminder cron (CONFIRMED within 24h, idempotent) ─────────
  // A dedicated slot → request → accept → CONFIRMED. The engine must dispatch
  // exactly one "job starts tomorrow" notification, persist it as a
  // BOOKING_REMINDER row, and stamp Booking.lastReminderSent; a second engine
  // run must dispatch nothing (the CAS on the null column wins once). The slot
  // starts no earlier than now+3h but walks forward hour by hour past any
  // RESERVED/BOOKED/BLOCKED slot — the seeded 14:00-local BLOCKED slot would
  // otherwise collide whenever the smoke runs mid-morning (time-of-day
  // dependent, pre-existing flake). Always <24h away, so the engine's due
  // window still applies.
  const remSlotStart = await (async (): Promise<Date> => {
    // The sibling smoke sections own these hour offsets (m3b +1h, ops +5h/+6h,
    // reschedule +8h/+9h, m3 +30h/31h, activity +32h) — the walk must skip them
    // so the reminder can't land on a window another section will claim later
    // in the run (the walk only sees slots created so far).
    const SIBLING_HOURS = new Set([1, 5, 6, 8, 9, 30, 31, 32]);
    for (let h = 3; h < 24; h++) {
      // Skip the sibling hours themselves AND the hour right after one: the
      // sibling windows are derived from their OWN Date.now() calls, so a
      // reminder window at h = sibling+1 half-overlaps the sibling's window by
      // the seconds of drift between the two calls — the exact ops2
      // → slot-taken flake seen live (reminder +7h butted against ops2 +6h).
      if (SIBLING_HOURS.has(h) || SIBLING_HOURS.has(h - 1)) continue;
      const start = new Date(Date.now() + h * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const clash = await prisma.bookingSlot.count({
        where: {
          workerId: khaled!.id,
          status: { in: ["RESERVED", "BOOKED", "BLOCKED"] },
          startAt: { lt: end },
          endAt: { gt: start },
        },
      });
      if (clash === 0) return start;
    }
    throw new Error("SMOKE ASSERT FAILED: no free reminder-slot window within 24h");
  })();
  const remSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: remSlotStart,
      endAt: new Date(remSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-reminder",
    },
  });
  const remCreated = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: remSlot.id,
    customerName: "Reminder Tester",
    customerPhone: "+966 50 777 1234",
    customerEmail: "reminder@workersarena.test",
    jobTitle: "Smoke reminder booking",
  });
  if ("error" in remCreated) throw new Error(`SMOKE ASSERT FAILED: reminder create → ${remCreated.error}`);
  const remAccepted = await prismaRespondToBooking(remCreated.id, { accept: true, quote: 8000 });
  assert(remAccepted?.status === "confirmed", "reminder booking accepted → CONFIRMED");
  const remBefore = await prisma.booking.findUnique({ where: { id: remCreated.id } });
  assert(remBefore?.lastReminderSent === null, "lastReminderSent unset before the engine runs");

  // The reminder booking is ALWAYS due (start < 24h away); the W2 `created` booking may
  // also be due when the seed is fresh (its slot is tomorrow) — so the count
  // is environment-dependent. Assert the deterministic parts: the engine
  // dispatched our booking (stamped + notified), and a re-run re-sends nothing.
  const reminderRowsBefore = await prisma.notification.findMany({ where: { type: "BOOKING_REMINDER" } });
  const reminderRun = await runBookingReminderEngine();
  console.log("reminder engine:", JSON.stringify(reminderRun));
  assert(reminderRun.dispatched >= 1, "at least the reminder booking is dispatched");
  assert(reminderRun.alreadySent === 0, "first run in a fresh process re-sends nothing");
  assert(reminderRun.total === reminderRun.dispatched, "first run totals consistent");
  const remAfter = await prisma.booking.findUnique({ where: { id: remCreated.id } });
  assert(remAfter?.lastReminderSent !== null, "lastReminderSent stamped after dispatch");
  const reminderRowsAfter = await prisma.notification.findMany({ where: { type: "BOOKING_REMINDER" } });
  assert(reminderRowsAfter.length > reminderRowsBefore.length, "BOOKING_REMINDER notification rows persisted");
  assert(
    reminderRowsAfter.some((r) => (r.bodyEn ?? "").includes(remCreated.number)),
    "a reminder row references the reminder booking number"
  );

  // Idempotency — a second cron tick within the window dispatches nothing.
  const reminderAgain = await runBookingReminderEngine();
  console.log("reminder engine again:", JSON.stringify(reminderAgain));
  assert(reminderAgain.dispatched === 0, "second engine run dispatches nothing");
  // The persisted stamp removes the bookings from the due set entirely — a
  // stronger guarantee than the per-process dedupe.
  assert(reminderAgain.total === 0, "stamped bookings leave the due set (no double-send)");

  // ── M4 ops — transitions + cancellation (live DB) ─────────────────────────
  // Strict state machine: confirmed → inProgress → completed (completed from
  // confirmed is illegal), noShow voids a scheduled status, cancellation is
  // allowed from any non-terminal status and FREES the slot (rule 3).
  const opsSlotStart = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const opsSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: opsSlotStart,
      endAt: new Date(opsSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-ops",
    },
  });
  const opsCreated = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: opsSlot.id,
    customerName: "Ops Tester",
    customerPhone: "+966 50 666 0000",
    customerEmail: "ops@workersarena.test",
    jobTitle: "Smoke ops booking",
  });
  if ("error" in opsCreated) throw new Error(`SMOKE ASSERT FAILED: ops create → ${opsCreated.error}`);
  await prismaRespondToBooking(opsCreated.id, { accept: true, quote: 8000 });

  const started = await prismaTransitionBooking(opsCreated.id, "inProgress");
  assert(started?.status === "inProgress", "confirmed → IN_PROGRESS");
  assert(started!.events.at(-1)?.status === "inProgress", "IN_PROGRESS audit event appended");
  const opsSlotDuring = await prisma.bookingSlot.findUnique({ where: { id: opsSlot.id } });
  assert(opsSlotDuring?.status === "BOOKED", "slot stays BOOKED through transitions");

  const completed = await prismaTransitionBooking(opsCreated.id, "completed");
  assert(completed?.status === "completed", "IN_PROGRESS → COMPLETED");
  const illegalFromCompleted = await prismaTransitionBooking(opsCreated.id, "noShow");
  assert(illegalFromCompleted === null, "terminal COMPLETED rejects further transitions");
  const completedEarly = await prismaTransitionBooking(opsCreated.id, "inProgress");
  assert(completedEarly === null, "COMPLETED → inProgress rejected");

  // Cancel flow — a second booking: accept → cancel by worker with a reason.
  const opsSlot2Start = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const opsSlot2 = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: opsSlot2Start,
      endAt: new Date(opsSlot2Start.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-ops",
    },
  });
  const opsCreated2 = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: opsSlot2.id,
    customerName: "Ops Tester 2",
    customerPhone: "+966 50 666 1111",
    customerEmail: "ops@workersarena.test",
    jobTitle: "Smoke ops cancel",
  });
  if ("error" in opsCreated2) throw new Error(`SMOKE ASSERT FAILED: ops2 create → ${opsCreated2.error}`);
  await prismaRespondToBooking(opsCreated2.id, { accept: true, quote: 8000 });

  const cancelled = await prismaCancelBooking(opsCreated2.id, { by: "worker", reason: "Smoke cancel" });
  assert(cancelled?.status === "cancelled", "confirmed → CANCELLED");
  assert(cancelled!.events.at(-1)?.reason === "Smoke cancel", "cancel reason on the audit event");
  const cancelledRow = await prisma.booking.findUnique({ where: { id: opsCreated2.id } });
  assert(cancelledRow?.cancelledBy === "worker" && cancelledRow.cancelReason === "Smoke cancel", "cancelledBy + cancelReason columns stored");
  const freedSlot = await prisma.bookingSlot.findUnique({ where: { id: opsSlot2.id } });
  assert(freedSlot?.status === "AVAILABLE" && freedSlot.bookingId === null, "cancellation frees the slot (rule 3)");
  const cancelAgain = await prismaCancelBooking(opsCreated2.id, { by: "worker" });
  assert(cancelAgain === null, "terminal CANCELLED cannot be cancelled again");
  console.log("M4 ops: inProgress → completed ok, illegal transitions rejected, cancel freed the slot");

  // ── W2 — customer-side booking lookup (prismaGetCustomerBookings) ─────────
  // The `created` booking (smoke@workersarena.test / +966 50 999 9999) is
  // still live. Email must match case-insensitively, phone must match with
  // separators stripped on BOTH sides (guest typing +966509999999 finds the
  // formatted stored value), and a stranger's identifier must return nothing.
  const byEmail = await prismaGetCustomerBookings({ email: "SMOKE@WORKERSARENA.TEST" });
  console.log("customer lookup by email (uppercase):", byEmail.map((b) => `${b.number}:${b.status}`));
  assert(byEmail.length === 1 && byEmail[0]!.id === created.id, "email lookup is case-insensitive and finds exactly the smoke booking");

  const byPhone = await prismaGetCustomerBookings({ phone: "+966509999999" });
  console.log("customer lookup by phone (no separators):", byPhone.map((b) => `${b.number}:${b.status}`));
  assert(byPhone.some((b) => b.id === created.id), "normalized phone lookup finds the smoke booking");

  const byFormattedPhone = await prismaGetCustomerBookings({ phone: "+966 50 999 9999" });
  assert(byFormattedPhone.some((b) => b.id === created.id), "formatted phone input matches too (both sides normalized)");

  const noMatch = await prismaGetCustomerBookings({ phone: "+966 00 000 0000" });
  assert(noMatch.length === 0, "unknown phone returns no bookings");
  const emptyIdentifier = await prismaGetCustomerBookings({});
  assert(emptyIdentifier.length === 0, "empty identifier returns no bookings");
  console.log("W2 customer lookup: email + phone (normalized & formatted) match, strangers excluded");

  // ── M3 — deposit checkout (Payment row + webhook confirm + refund) ───────
  // accept-with-deposit → PENDING_PAYMENT + a PENDING Payment row linked by
  // booking.paymentId; createBookingCheckout mints a provider session (the
  // simulated provider, no keys) and stamps providerRef; the webhook confirm
  // flips booking → CONFIRMED + payment → PAID (idempotent). M4 policy: a
  // worker cancel 30h out (outside the 24h BOOKING_CANCEL_REFUND_WINDOW_MS)
  // refunds the deposit (payment → REFUNDED) while freeing the slot; a second
  // paid booking 2h out cancelled by the worker KEEPS the deposit (stays
  // PAID).
  const m3SlotStart = new Date(Date.now() + 30 * 60 * 60 * 1000); // outside the refund window
  const m3Slot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: m3SlotStart,
      endAt: new Date(m3SlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-m3",
    },
  });
  const m3Created = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: m3Slot.id,
    customerName: "Deposit Tester",
    customerPhone: "+966 50 555 0000",
    customerEmail: "deposit@workersarena.test",
    jobTitle: "Smoke deposit booking",
  });
  if ("error" in m3Created) throw new Error(`SMOKE ASSERT FAILED: m3 create → ${m3Created.error}`);

  const m3Accepted = await prismaRespondToBooking(m3Created.id, {
    accept: true,
    quote: 25000,
    deposit: 5000,
  });
  assert(m3Accepted?.status === "pendingPayment", "accept-with-deposit → PENDING_PAYMENT");
  const m3Row = await prisma.booking.findUnique({
    where: { id: m3Created.id },
    include: { payment: true },
  });
  assert(m3Row?.paymentId, "accept-with-deposit links a Payment row via booking.paymentId");
  assert(m3Row!.payment?.status === "PENDING" && m3Row!.payment!.amount === 5000, "Payment row is PENDING with the deposit in minor units");

  const m3Checkout = await prismaCreateBookingCheckout(m3Created.id);
  assert(m3Checkout?.url.includes("/api/payments/simulate"), "checkout returns the simulated provider URL");
  const m3RowWithRef = await prisma.booking.findUnique({
    where: { id: m3Created.id },
    include: { payment: true },
  });
  assert(m3RowWithRef?.payment?.providerRef, "providerRef stamped on the Payment row");
  assert(m3Checkout !== null, "checkout returned a url");
  const m3CheckoutAgain = await prismaCreateBookingCheckout(m3Created.id);
  assert(m3CheckoutAgain?.url === m3Checkout.url, "second checkout returns the SAME url (idempotent — no duplicate sessions)");

  const m3Confirmed = await prismaConfirmBookingPayment(m3Created.id, m3RowWithRef!.payment!.providerRef!);
  assert(m3Confirmed?.status === "confirmed", "webhook confirm → CONFIRMED");
  const m3Paid = await prisma.booking.findUnique({
    where: { id: m3Created.id },
    include: { payment: true },
  });
  assert(m3Paid?.payment?.status === "PAID" && m3Paid!.payment!.paidAt !== null, "payment → PAID with paidAt");
  // Guest bookings (no customerId) get NO invoice on confirm — the receipt is
  // for signed-in customers only.
  const m3GuestInvoice = await prisma.booking.findUnique({
    where: { id: m3Created.id },
    include: { payment: { include: { invoice: true } } },
  });
  assert(m3GuestInvoice?.payment?.invoice === null, "guest booking gets NO Invoice row on confirm");
  const m3SlotAfter = await prisma.bookingSlot.findUnique({ where: { id: m3Slot.id } });
  assert(m3SlotAfter?.status === "BOOKED", "slot stays BOOKED through payment confirm");
  const m3Again = await prismaConfirmBookingPayment(m3Created.id, m3RowWithRef!.payment!.providerRef!);
  assert(m3Again !== null && m3Again.status === "confirmed", "webhook redelivery is idempotent");

  const m3Cancelled = await prismaCancelBooking(m3Created.id, { by: "worker", reason: "Smoke deposit refund" });
  assert(m3Cancelled?.status === "cancelled", "paid booking cancelled by worker");
  const m3Refunded = await prisma.booking.findUnique({
    where: { id: m3Created.id },
    include: { payment: true },
  });
  assert(
    m3Refunded?.payment?.status === "REFUNDED" && m3Refunded!.payment!.refundedAt !== null,
    "worker cancel refunds the deposit (payment → REFUNDED)"
  );
  const m3SlotFreed = await prisma.bookingSlot.findUnique({ where: { id: m3Slot.id } });
  assert(m3SlotFreed?.status === "AVAILABLE" && m3SlotFreed.bookingId === null, "cancel frees the slot (rule 3)");
  // The M4 refund email — a refunded deposit dispatches a BOOKING_REFUND
  // notification to the customer with the amount + reason.
  const m3RefundNotifs = await prisma.notification.findMany({ where: { type: "BOOKING_REFUND" } });
  assert(
    m3RefundNotifs.some((r) => (r.bodyEn ?? "").includes(m3Created.number)),
    "worker-cancel refund dispatches a BOOKING_REFUND notification for the booking"
  );
  console.log("M3: deposit → Payment row → checkout → PAID confirm → worker-cancel refund (BOOKING_REFUND email), slot freed");

  // M4 policy — the keep branch live: a PAID booking cancelled WITHIN the
  // 24h window must NOT refund (payment stays PAID, no refundRef). The slot
  // sits at now+1h: inside the window AND clear of the reminder slot (+3h)
  // — the two are computed from Date.now() milliseconds apart, so a +2h slot
  // (ending at ~now+3h) would half-open-overlap the reminder's start.
  const m3bSlotStart = new Date(Date.now() + 60 * 60 * 1000); // inside the refund window
  const m3bSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: m3bSlotStart,
      endAt: new Date(m3bSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-m3",
    },
  });
  const m3bCreated = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: m3bSlot.id,
    customerName: "Deposit Tester B",
    customerPhone: "+966 50 555 1111",
    customerEmail: "deposit@workersarena.test",
    jobTitle: "Smoke deposit keep-branch",
  });
  if ("error" in m3bCreated) throw new Error(`SMOKE ASSERT FAILED: m3b create → ${m3bCreated.error}`);
  await prismaRespondToBooking(m3bCreated.id, { accept: true, quote: 12000, deposit: 3000 });
  const m3bCheckout = await prismaCreateBookingCheckout(m3bCreated.id);
  assert(m3bCheckout !== null, "keep-branch checkout minted");
  const m3bRow = await prisma.booking.findUnique({ where: { id: m3bCreated.id }, include: { payment: true } });
  await prismaConfirmBookingPayment(m3bCreated.id, m3bRow!.payment!.providerRef!);
  const m3bCancelled = await prismaCancelBooking(m3bCreated.id, { by: "worker", reason: "Smoke keep-branch" });
  assert(m3bCancelled?.status === "cancelled", "keep-branch booking cancelled");
  const m3bAfter = await prisma.booking.findUnique({ where: { id: m3bCreated.id }, include: { payment: true } });
  assert(
    m3bAfter?.payment?.status === "PAID" && m3bAfter!.payment!.refundRef === null && m3bAfter!.payment!.refundedAt === null,
    "worker cancel within the window keeps the deposit (payment stays PAID, no refund)"
  );
  const m3bSlotFreed = await prisma.bookingSlot.findUnique({ where: { id: m3bSlot.id } });
  assert(m3bSlotFreed?.status === "AVAILABLE", "keep-branch cancel still frees the slot");
  console.log("M4 policy: worker cancel within 24h keeps the deposit (payment stays PAID); slot freed");

  // ── M5 — take-rate revenue stats (prismaGetPlatformFeeStats) ─────────────
  // The adapter's gross/refunded/net must equal a DIRECT sum over the live
  // Booking rows with the same 30-day cutoff — a self-referential cross-check
  // that can't drift with leftover rows. The two smoke bookings in play: m3
  // (quote 25000 → fee 1750, refunded → its fee returns) and m3b (quote 12000
  // → fee 840, deposit kept → its fee stays collected).
  const feeCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const feeRows = await prisma.booking.findMany({
    where: { platformFee: { not: null }, createdAt: { gte: feeCutoff } },
    select: { platformFee: true, payment: { select: { status: true } } },
  });
  const grossMinor = feeRows.reduce((s, r) => s + (r.platformFee ?? 0), 0);
  const refundedMinor = feeRows.reduce(
    (s, r) => s + (r.payment?.status === "REFUNDED" ? (r.platformFee ?? 0) : 0),
    0
  );
  const feeStats = await prismaGetPlatformFeeStats(30);
  assert(feeStats.grossMinor === grossMinor, `fee gross matches live rows (${feeStats.grossMinor} === ${grossMinor})`);
  assert(
    feeStats.refundedMinor === refundedMinor,
    `fee refunded matches live rows (${feeStats.refundedMinor} === ${refundedMinor})`
  );
  assert(feeStats.netMinor === grossMinor - refundedMinor, "fee net = gross − refunded");
  assert(feeStats.count === feeRows.length, "fee count = fee-carrying bookings");
  assert(feeStats.grossMinor > 0 && feeStats.refundedMinor > 0, "both smoke fees landed (refunded + kept)");
  console.log("M5 take-rate: gross/refunded/net/avg match a direct sum over live Booking rows");

  // ── Payouts — earnings credit at completion + withdrawal lifecycle ───────
  // docs/payouts.md: completing a quoted job credits net = quote − platformFee
  // to the worker's ledger INSIDE the transition tx; the worker withdraws part
  // of the available balance (PENDING reserves it); an admin approval settles
  // it (the debit drops the balance). Assertions are delta-based so any
  // pre-existing ledger state can't flake them.
  const poBefore = await prismaGetWorkerBalance(khaled!.id);
  const poSlotStart = new Date(Date.now() + 40 * 60 * 60 * 1000);
  const poSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: poSlotStart,
      endAt: new Date(poSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-payout",
    },
  });
  const poCreated = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: poSlot.id,
    customerName: "Payout Tester",
    customerPhone: "+966 50 777 0000",
    customerEmail: "payout@workersarena.test",
    jobTitle: "Smoke payout booking",
  });
  if ("error" in poCreated) throw new Error(`SMOKE ASSERT FAILED: payout create → ${poCreated.error}`);
  await prismaRespondToBooking(poCreated.id, { accept: true, quote: 10000 }); // fee 700 → net 9300
  assert((await prismaTransitionBooking(poCreated.id, "inProgress")) !== null, "payout booking → inProgress");
  assert((await prismaTransitionBooking(poCreated.id, "completed")) !== null, "payout booking → completed");

  const poBalance = await prismaGetWorkerBalance(khaled!.id);
  assert(
    poBalance.availableMinor === poBefore.availableMinor + 9300,
    `completion credits net earnings (available +9300, got ${poBalance.availableMinor - poBefore.availableMinor})`
  );
  assert(poBalance.pendingMinor === 0, "no pending before a withdrawal");

  const poPayout = await prismaRequestPayout(khaled!.id, 5000, "Smoke withdrawal");
  assert(!("error" in poPayout), "payout request succeeds");
  assert(
    poPayout.kind === "withdrawal" && poPayout.status === "pending" && poPayout.amount === -5000,
    "payout is a signed PENDING withdrawal"
  );
  const poPending = await prismaGetWorkerBalance(khaled!.id);
  assert(poPending.pendingMinor === 5000, "pending withdrawal reserves 5000");

  const poDecided = await prismaDecidePayout(poPayout.id, true, "Approved by smoke", "u-admin");
  assert(poDecided?.status === "processed", "approval settles the payout");
  const poAfter = await prismaGetWorkerBalance(khaled!.id);
  assert(poAfter.pendingMinor === 0, "settled payout no longer pending");
  assert(poAfter.availableMinor === poBefore.availableMinor + 4300, "approval debits the balance (9300 − 5000)");

  // Cleanup — restore the seed: drop the smoke's ledger rows + booking + slot.
  await prisma.workerLedgerEntry.deleteMany({ where: { bookingId: poCreated.id } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: poCreated.id } });
  await prisma.booking.delete({ where: { id: poCreated.id } }).catch(() => {});
  await prisma.bookingSlot.delete({ where: { id: poSlot.id } }).catch(() => {});
  console.log("Payouts: completion credits net earnings; withdrawal reserved → approved → debited");

  // ── M3 invoice — signed-in customer gets a WA-YYYY-NNNNN receipt ──────────
  // The same deposit flow with customerId = the seeded Sara user: confirm must
  // mint an Invoice row linked to the payment (amount minor, PAID), and the
  // customer lookup must map it onto the booking for the /bookings page.
  const sara = await prisma.user.findUnique({ where: { email: "sara@example.com" } });
  assert(sara !== null, "seed user sara exists for the signed-in invoice check");
  const m3cSlotStart = new Date(Date.now() + 31 * 60 * 60 * 1000); // clear of m3 (30h)
  const m3cSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: m3cSlotStart,
      endAt: new Date(m3cSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-m3",
    },
  });
  const m3cCreated = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: m3cSlot.id,
    customerId: sara.id,
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "depositu@workersarena.test",
    jobTitle: "Smoke signed-in deposit",
  });
  if ("error" in m3cCreated) throw new Error(`SMOKE ASSERT FAILED: m3c create → ${m3cCreated.error}`);
  await prismaRespondToBooking(m3cCreated.id, { accept: true, quote: 20000, deposit: 4000 });
  const m3cCheckout = await prismaCreateBookingCheckout(m3cCreated.id);
  assert(m3cCheckout !== null, "signed-in checkout minted");
  const m3cRow = await prisma.booking.findUnique({
    where: { id: m3cCreated.id },
    include: { payment: true },
  });
  await prismaConfirmBookingPayment(m3cCreated.id, m3cRow!.payment!.providerRef!);
  const m3cInvoice = await prisma.invoice.findUnique({ where: { paymentId: m3cRow!.payment!.id } });
  assert(m3cInvoice !== null, "signed-in customer gets an Invoice row on confirm");
  assert(/^WA-\d{4}-\d{5}$/.test(m3cInvoice!.number), "invoice number is WA-YYYY-NNNNN");
  // The per-year count query is what derives the sequence — the minted number
  // must be unique across the DB (self-heal + cleanup keep the smoke's own
  // invoices out of the count, so the first one is WA-<year>-00001).
  const m3cInvoiceCount = await prisma.invoice.count({ where: { number: m3cInvoice!.number } });
  assert(m3cInvoiceCount === 1, "invoice number is unique in the DB");
  assert(m3cInvoice!.amount === 4000 && m3cInvoice!.status === "PAID", "invoice amount (minor) + status PAID");
  assert(m3cInvoice!.userId === sara!.id, "invoice attached to the signed-in user");
  const m3cLookup = await prismaGetCustomerBookings({ email: "depositu@workersarena.test" });
  assert(
    m3cLookup.some((b) => b.invoice?.number === m3cInvoice!.number),
    "customer lookup maps the invoice onto the booking"
  );
  console.log("M3 invoice: signed-in confirm mints WA-YYYY-NNNNN (amount minor, PAID, linked to the user); guest gets none");

  // ── M4 activity feed — booking lifecycle events land in ActivityLog ───────
  // The seam-level logger (repo.ts logBookingLifecycle) writes the REQUESTED /
  // CONFIRMED / CANCELLED codes with the booking number (the dispute-view deep
  // link) into the SAME ActivityLog table the admin dashboard reads. With
  // DEMO_MODE=false + DATABASE_URL set, logAdminActivity → prismaLog, so this
  // proves the real-mode path end-to-end: every booking the funnel counts has
  // a matching feed entry. Drive it through the repo seam (not the prisma
  // adapter directly) so the logging site is exercised.
  const { createBookingRequest, respondToBooking, cancelBooking, rescheduleBooking, transitionBooking } = await import(
    "../src/lib/data/repo"
  );
  const { listActivityEntries } = await import("../src/lib/data/activity");
  const actSlotStart = new Date(Date.now() + 32 * 60 * 60 * 1000); // clear of m3c (31h)
  const actSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: actSlotStart,
      endAt: new Date(actSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-activity",
    },
  });
  const actCreated = await createBookingRequest({
    workerId: khaled!.id,
    slotId: actSlot.id,
    customerName: "Activity Tester",
    customerPhone: "+966 50 333 0000",
    customerEmail: "activity@workersarena.test",
    jobTitle: "Smoke activity booking",
  });
  if ("error" in actCreated) throw new Error(`SMOKE ASSERT FAILED: activity create → ${actCreated.error}`);
  const actRequested = await listActivityEntries({ code: "BOOKING_REQUESTED" });
  assert(
    actRequested.items.some((e) => e.bookingNo === actCreated.number && e.type === "booking"),
    "createBookingRequest logs BOOKING_REQUESTED with the booking number"
  );

  const actAccepted = await respondToBooking(actCreated.id, { accept: true, quote: 8000 });
  assert(actAccepted?.status === "confirmed", "activity booking accepted → CONFIRMED");
  const actConfirmed = await listActivityEntries({ code: "BOOKING_CONFIRMED" });
  assert(
    actConfirmed.items.some((e) => e.bookingNo === actCreated.number),
    "accept-without-deposit logs BOOKING_CONFIRMED with the booking number"
  );

  const actCancelled = await cancelBooking(actCreated.id, { by: "customer", reason: "Smoke activity cancel" });
  assert(actCancelled?.status === "cancelled", "activity booking cancelled");
  const actCancelledFeed = await listActivityEntries({ code: "BOOKING_CANCELLED" });
  const actCancelEntry = actCancelledFeed.items.find((e) => e.bookingNo === actCreated.number);
  assert(actCancelEntry !== undefined, "cancel logs BOOKING_CANCELLED with the booking number");
  assert(
    (actCancelEntry!.actionEn ?? "").includes("Smoke activity cancel"),
    "cancel reason rides the feed entry (dispute context)"
  );
  // The booking-number deep link resolves: the dispute view's lookup finds the
  // booking by the SAME number the feed entry carries.
  const actByNumber = await (await import("../src/lib/data/repo")).getBookingByNumber(actCreated.number);
  assert(actByNumber?.id === actCreated.id, "getBookingByNumber resolves the feed's deep link");
  console.log("M4 activity feed: REQUESTED → CONFIRMED → CANCELLED logged with booking number (dispute deep link resolves)");

  // ── M4 activity feed — RESCHEDULED + NO_SHOW (seam, live DB) ─────────────
  // The same logBookingLifecycle seam must log BOOKING_RESCHEDULED (a confirmed
  // booking moved to a new slot) and BOOKING_NO_SHOW (a worker voiding a
  // no-show) — completing the lifecycle codes so the dispute timeline and the
  // feed stay in full lockstep. Driven through the repo seam (not the prisma
  // adapters) so the logging sites are exercised. The slots sit at +33h/+34h/
  // +35h — beyond the reminder walk's <24h range, so no sibling-hour
  // bookkeeping is needed.
  const rs2SlotStart = new Date(Date.now() + 33 * 60 * 60 * 1000);
  const rs2Slot = await prisma.bookingSlot.create({
    data: { workerId: khaled!.id, startAt: rs2SlotStart, endAt: new Date(rs2SlotStart.getTime() + 60 * 60 * 1000), status: "AVAILABLE", note: "smoke-activity" },
  });
  const rs2TargetStart = new Date(Date.now() + 34 * 60 * 60 * 1000);
  const rs2Target = await prisma.bookingSlot.create({
    data: { workerId: khaled!.id, startAt: rs2TargetStart, endAt: new Date(rs2TargetStart.getTime() + 60 * 60 * 1000), status: "AVAILABLE", note: "smoke-activity" },
  });
  const nsSlotStart = new Date(Date.now() + 35 * 60 * 60 * 1000);
  const nsSlot = await prisma.bookingSlot.create({
    data: { workerId: khaled!.id, startAt: nsSlotStart, endAt: new Date(nsSlotStart.getTime() + 60 * 60 * 1000), status: "AVAILABLE", note: "smoke-activity" },
  });

  const rs2Created = await createBookingRequest({
    workerId: khaled!.id,
    slotId: rs2Slot.id,
    customerName: "Activity Reschedule Tester",
    customerPhone: "+966 50 333 1111",
    customerEmail: "activity@workersarena.test",
    jobTitle: "Smoke feed reschedule",
  });
  if ("error" in rs2Created) throw new Error(`SMOKE ASSERT FAILED: feed-reschedule create → ${rs2Created.error}`);
  await respondToBooking(rs2Created.id, { accept: true, quote: 8000 });
  const rs2Moved = await rescheduleBooking(rs2Created.id, rs2Target.id, { by: "worker" });
  assert(rs2Moved?.status === "confirmed", "feed-reschedule booking moved → still CONFIRMED");
  const rs2Feed = await listActivityEntries({ code: "BOOKING_RESCHEDULED" });
  assert(
    rs2Feed.items.some((e) => e.bookingNo === rs2Created.number && e.type === "booking"),
    "rescheduleBooking logs BOOKING_RESCHEDULED with the booking number"
  );

  const nsCreated = await createBookingRequest({
    workerId: khaled!.id,
    slotId: nsSlot.id,
    customerName: "Activity NoShow Tester",
    customerPhone: "+966 50 333 2222",
    customerEmail: "activity@workersarena.test",
    jobTitle: "Smoke feed no-show",
  });
  if ("error" in nsCreated) throw new Error(`SMOKE ASSERT FAILED: feed-noshow create → ${nsCreated.error}`);
  await respondToBooking(nsCreated.id, { accept: true, quote: 8000 });
  const nsVoided = await transitionBooking(nsCreated.id, "noShow");
  assert(nsVoided?.status === "noShow", "feed no-show booking voided → NO_SHOW");
  const nsFeed = await listActivityEntries({ code: "BOOKING_NO_SHOW" });
  assert(
    nsFeed.items.some((e) => e.bookingNo === nsCreated.number),
    "transitionBooking(noShow) logs BOOKING_NO_SHOW with the booking number"
  );
  console.log("M4 activity feed: RESCHEDULED + NO_SHOW logged with booking numbers (dispute deep links resolve)");

  // ── M4 — reschedule (new slot swap, live DB) ──────────────────────────────
  // A CONFIRMED booking moves to another AVAILABLE slot: the target is claimed
  // (AVAILABLE → BOOKED + bookingId), the old slot returns to AVAILABLE with
  // bookingId cleared, the booking's times follow the target, a RESCHEDULED
  // audit event is appended, and the customer is notified. The same guard
  // logic rejects an already-claimed target.
  const rsSlotStart = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const rsSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: rsSlotStart,
      endAt: new Date(rsSlotStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-reschedule",
    },
  });
  const rsTargetStart = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const rsTarget = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: rsTargetStart,
      endAt: new Date(rsTargetStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-reschedule",
    },
  });
  const rsCreated = await prismaCreateBookingRequest({
    workerId: khaled!.id,
    slotId: rsSlot.id,
    customerName: "Reschedule Tester",
    customerPhone: "+966 50 444 0000",
    customerEmail: "reschedule@workersarena.test",
    jobTitle: "Smoke reschedule booking",
  });
  if ("error" in rsCreated) throw new Error(`SMOKE ASSERT FAILED: reschedule create → ${rsCreated.error}`);
  const rsAccepted = await prismaRespondToBooking(rsCreated.id, { accept: true, quote: 8000 });
  assert(rsAccepted?.status === "confirmed", "reschedule booking accepted → CONFIRMED");
  const rsSlotBooked = await prisma.bookingSlot.findUnique({ where: { id: rsSlot.id } });
  assert(rsSlotBooked?.status === "BOOKED" && rsSlotBooked.bookingId === rsCreated.id, "pre-move slot is BOOKED + linked");

  const rsMoved = await prismaRescheduleBooking(rsCreated.id, rsTarget.id, { by: "worker" });
  assert(rsMoved?.status === "confirmed", "reschedule keeps the booking CONFIRMED");
  assert(new Date(rsMoved!.startAt).getTime() === rsTargetStart.getTime(), "booking startAt follows the new slot");
  assert(rsMoved!.events.at(-1)?.status === "rescheduled", "RESCHEDULED audit event appended");
  assert(rsMoved!.events.at(-1)?.actorType === "worker", "reschedule event actor = worker");
  const rsOldAfter = await prisma.bookingSlot.findUnique({ where: { id: rsSlot.id } });
  assert(rsOldAfter?.status === "AVAILABLE" && rsOldAfter.bookingId === null, "old slot freed + unlinked (rule 3)");
  const rsTargetAfter = await prisma.bookingSlot.findUnique({ where: { id: rsTarget.id } });
  assert(rsTargetAfter?.status === "BOOKED" && rsTargetAfter.bookingId === rsCreated.id, "target slot claimed + linked");
  const rsNotified = await prisma.notification.findMany({ where: { type: "BOOKING_RESCHEDULED" } });
  assert(rsNotified.length > 0, "customer notified about the reschedule");

  // An already-claimed target (the old slot is now AVAILABLE, so use a THIRD
  // slot and claim it first via a second reschedule attempt against a booked
  // slot) — simplest: rescheduling onto the OLD slot is legal, but onto a
  // slot that got BOOKED by something else is not. Claim rsTarget's window is
  // already taken by the move itself; attempt a move to a slot of ANOTHER
  // worker (must be rejected).
  const foreignSlot = await prisma.bookingSlot.create({
    data: {
      workerId: (await prisma.worker.findFirst({ where: { id: { not: khaled!.id } } }))!.id,
      startAt: rsTargetStart,
      endAt: new Date(rsTargetStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
    },
  });
  const rsForeign = await prismaRescheduleBooking(rsCreated.id, foreignSlot.id, { by: "worker" });
  assert(rsForeign === null, "reschedule to another worker's slot rejected");
  await prisma.bookingSlot.delete({ where: { id: foreignSlot.id } });
  console.log("M4 reschedule: confirmed → new slot claimed, old freed, RESCHEDULED event + customer notified");

  // ── M4 admin funnel — booking counts by status + REQUESTED→CONFIRMED ─────
  // Every live booking is within the 30-day window (seed BK-1001 + the 8 smoke
  // bookings above: 4 confirmed, 1 completed, 3 cancelled, 1 requested). The
  // counts map through the shared per-status zeroing so every key is present,
  // and the conversion derives from confirmed/inProgress/completed over total.
  const funnel = await prismaGetBookingFunnel(30);
  assert(funnel.total >= 9, "funnel counts the seed + smoke bookings");
  assert(funnel.counts.requested >= 1, "seed BK-1001 still counted as requested");
  assert(funnel.counts.confirmed >= 4, "accepted bookings counted as confirmed");
  assert(funnel.counts.completed >= 1, "transitioned booking counted as completed");
  assert(funnel.counts.cancelled >= 3, "cancelled bookings counted");
  const sum = Object.values(funnel.counts).reduce((s, n) => s + n, 0);
  assert(sum === funnel.total, "funnel counts sum to total");
  const expectedConversion = Math.round(
    ((funnel.counts.confirmed + funnel.counts.inProgress + funnel.counts.completed) / funnel.total) * 100
  );
  assert(funnel.conversionRate === expectedConversion, "conversion = confirmed-ish / total (rounded)");
  console.log(
    "M4 admin funnel: total", funnel.total,
    "| requested", funnel.counts.requested,
    "| confirmed", funnel.counts.confirmed,
    "| completed", funnel.counts.completed,
    "| cancelled", funnel.counts.cancelled,
    "| conversion", funnel.conversionRate + "%"
  );

  // ── W2 — campaign purchase + refund (self-serve ads, live DB) ─────────────
  // The full ad-purchase circle through the prisma adapters against the
  // seeded company: prismaCreateCampaign mints the PENDING AdCampaign +
  // primary creative + PENDING purchase row (advertisementId → campaign) +
  // the hosted checkout; prismaConfirmCampaignPayment flips ACTIVE + PAID and
  // mints the purchase's PAID WA-YYYY-NNNNN Invoice + the "Campaign is live"
  // notification; prismaRefundCampaignPayment refunds the charge (payment →
  // REFUNDED), ends the campaign, VOIDs the minted invoice (the credit note)
  // and dispatches the campaignRefunded notification. The refund email is
  // rendered from the SAME shared campaignRefundNotification builder the
  // /admin preview uses — proving the preview email lands for a real
  // refunded payment. The seeded company row is required (npm run db:seed
  // creates BuildCo Ltd for ads@buildco.sa).
  // Self-healing: a crashed run (assert throw before cleanup) leaves the
  // AdCampaign + ad + payment + any minted invoice behind. Our smoke
  // campaigns are findable by the deterministic nameEn prefix; delete in
  // dependency order (invoice → payment → ad → campaign). The notification
  // types ride the early/final SMOKE_NOTIFICATION_TYPES wipes; the feed's
  // CAMPAIGN_REFUNDED entries are scoped surgically to OUR campaign (the
  // human copy with the campaign name lives in meta.actionEn — the `action`
  // column only holds the code), so a dev's manual admin refunds in the UI
  // are never touched.
  const smokeCampaigns = await prisma.adCampaign.findMany({
    where: { nameEn: { startsWith: "SMOKE CAMPAIGN" } },
  });
  for (const c of smokeCampaigns) {
    const pays = await prisma.payment.findMany({ where: { advertisementId: c.id }, select: { id: true } });
    await prisma.invoice.deleteMany({ where: { paymentId: { in: pays.map((p) => p.id) } } });
    await prisma.payment.deleteMany({ where: { advertisementId: c.id } });
    await prisma.advertisement.deleteMany({ where: { campaignId: c.id } });
    await prisma.adCampaign.deleteMany({ where: { id: c.id } });
  }
  await prisma.activityLog.deleteMany({
    where: { action: "CAMPAIGN_REFUNDED", meta: { path: ["actionEn"], string_contains: "SMOKE CAMPAIGN" } },
  });
  if (smokeCampaigns.length > 0) console.log("self-heal: removed", smokeCampaigns.length, "leftover smoke campaign(s)");

  const companyUser = await prisma.user.findUnique({ where: { email: "ads@buildco.sa" } });
  assert(companyUser !== null, "seed user ads@buildco.sa exists for the campaign purchase check");
  const seededCompany = await prisma.company.findUnique({ where: { userId: companyUser!.id } });
  assert(seededCompany !== null, "seed company row exists (BuildCo Ltd) — re-run npm run db:seed");

  const camCreated = await prismaCreateCampaign({
    nameEn: "SMOKE CAMPAIGN — plumbing ads",
    nameAr: "حملة سميك — إعلانات السباكة",
    placement: "homepage",
    adType: "banner",
    budget: 250,
    companyId: companyUser!.id,
  });
  assert(camCreated !== null, "prismaCreateCampaign returns the PENDING campaign + checkout");
  const camId = camCreated!.campaign.id;
  console.log(
    "campaign created:", camId, camCreated!.campaign.status,
    "| checkout:", camCreated!.checkoutUrl.slice(0, 52) + "…"
  );
  assert(camCreated!.campaign.status === "pending", "created campaign is PENDING (not serving ads yet)");
  assert(camCreated!.checkoutUrl.includes("/api/payments/simulate"), "checkout URL is the simulated provider's");
  const camPayment = await prisma.payment.findFirst({ where: { advertisementId: camId } });
  assert(
    camPayment?.status === "PENDING" && camPayment!.amount === 25000 && camPayment!.companyId === seededCompany!.id,
    "PENDING purchase row in minor units, keyed by advertisementId, owned by the company"
  );
  const camCheckoutAgain = await prismaCreateCampaignCheckout(camId);
  assert(camCheckoutAgain?.url === camCreated!.checkoutUrl, "checkout re-mint is idempotent (Pay-now reuses the URL)");

  const camConfirmed = await prismaConfirmCampaignPayment(camId, "sim_pay-smoke-campaign");
  assert(camConfirmed?.status === "active", "webhook confirm → ACTIVE");
  const camPaid = await prisma.payment.findFirst({ where: { advertisementId: camId } });
  assert(camPaid?.status === "PAID" && camPaid!.paidAt !== null, "payment → PAID with paidAt");
  const camInvoice = await prisma.invoice.findUnique({ where: { paymentId: camPaid!.id } });
  assert(camInvoice !== null, "confirm mints the purchase's Invoice");
  assert(
    camInvoice!.status === "PAID" && /^WA-\d{4}-\d{5}$/.test(camInvoice!.number),
    "invoice PAID with a WA-YYYY-NNNNN number"
  );
  const camLiveNotifs = await prisma.notification.findMany({ where: { type: "PROMO" } });
  assert(
    camLiveNotifs.some((r) => (r.bodyEn ?? "").includes("SMOKE CAMPAIGN")),
    "company notified 'Campaign is live'"
  );

  const camRefunded = await prismaRefundCampaignPayment(camId, {
    by: "Platform Admin",
    reason: "Smoke duplicate purchase",
  });
  assert(camRefunded?.status === "refunded", "refund flips the payment REFUNDED");
  assert(camRefunded!.refundReason === "Smoke duplicate purchase", "refund reason recorded on the payment");
  const camAfter = (await prismaGetCampaigns()).find((c) => c.id === camId);
  assert(camAfter?.status === "ended", "refund ends the campaign (stops serving)");
  const camInvAfter = await prisma.invoice.findUnique({ where: { id: camInvoice!.id } });
  assert(camInvAfter?.status === "VOID", "credit note — the minted invoice VOIDs on refund");
  const camRefundNotifs = await prisma.notification.findMany({ where: { type: "CAMPAIGN_REFUNDED" } });
  assert(
    camRefundNotifs.some((r) => (r.bodyEn ?? "").includes("SMOKE CAMPAIGN")),
    "company notified campaignRefunded (amount + reason)"
  );
  const camFeed = await prisma.activityLog.count({ where: { action: "CAMPAIGN_REFUNDED" } });
  assert(camFeed > 0, "refund audited to the admin activity feed");
  // The refund email — rendered from the SAME shared builder the /admin
  // preview uses, so the preview card provably renders for a real refund.
  // (The builder's payload is what pushNotification dispatches; the preview
  // supplies the id/time/recipient the renderer's ChannelPayload carries.)
  const camPreviewPayload: import("../src/lib/notifications/types").ChannelPayload = {
    ...campaignRefundNotification(
      camAfter ?? { nameEn: "SMOKE CAMPAIGN — plumbing ads", nameAr: "حملة سميك — إعلانات السباكة" },
      camRefunded!
    ),
    id: "smoke-campaign-refund-preview",
    time: new Date().toISOString(),
    recipient: { name: seededCompany!.nameEn, email: companyUser!.email, locale: "en" },
  };
  const camEmail = renderCampaignRefundEmail(camPreviewPayload, "en");
  assert(camEmail.subject.includes("Campaign refunded"), "refund email subject");
  assert(
    camEmail.html.includes("SMOKE CAMPAIGN") && camEmail.html.includes("$250"),
    "refund email card shows the campaign name + refunded amount"
  );
  assert(camEmail.html.includes("Smoke duplicate purchase"), "refund email card shows the reason row");
  console.log(
    "W2 campaigns: create → checkout (idempotent) → confirm (ACTIVE + PAID + WA- Invoice + live notif) → refund (ENDED + REFUNDED + VOID + feed + refund email)"
  );

  // Campaign cleanup — the purchase rows (invoice first: deleting the payment
  // SetNulls Invoice.paymentId and would orphan the receipt row), plus the
  // feed entry scoped to OUR campaign (see the self-heal comment above).
  await prisma.invoice.deleteMany({ where: { paymentId: camPaid!.id } });
  await prisma.payment.deleteMany({ where: { advertisementId: camId } });
  await prisma.advertisement.deleteMany({ where: { campaignId: camId } });
  await prisma.adCampaign.deleteMany({ where: { id: camId } });
  await prisma.activityLog.deleteMany({
    where: { action: "CAMPAIGN_REFUNDED", meta: { path: ["actionEn"], string_contains: "SMOKE CAMPAIGN" } },
  });

  // ── W2 — recurring bookings (maintenance contracts, live DB) ─────────────
  // prismaCreateRecurringRequest claims the anchor slot through the one-shot
  // CAS path and mints the contract row (RC-NNNNN) in the SAME tx; a duplicate
  // request for the same slot is rejected (slot-taken); prismaRespondToRecurring
  // accept confirms the first occurrence (quote + take-rate stamp, slot →
  // BOOKED) and materializes the cadence into covering AVAILABLE slots (the
  // +7d one — the rest have no availability yet); the generation cron
  // (prismaGenerateRecurringOccurrences) rolls the cadence forward
  // idempotently (nothing due → 0; +14d slot appears → 1; re-run → 0);
  // decline cancels the contract + frees the slot (rule 3);
  // prismaCancelRecurringContract cancels the cadence and frees every
  // occurrence's slot. Dedicated slots at +48h/+57h/+65h/+49h — day-granular,
  // clear of the sibling sections' hour windows.
  const recAnchorStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const recSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: recAnchorStart,
      endAt: new Date(recAnchorStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-recurring-anchor",
    },
  });
  const recReq = await prismaCreateRecurringRequest({
    workerId: khaled!.id,
    slotId: recSlot.id,
    customerName: "Recurring Tester",
    customerPhone: "+966 50 888 1234",
    customerEmail: "recurring@workersarena.test",
    jobTitle: "Smoke weekly maintenance",
    frequency: "weekly",
  });
  assert(!("error" in recReq), "recurring request created");
  assert(recReq.recurring.status === "active" && recReq.recurring.occurrences.length === 1, "contract ACTIVE with the anchor occurrence");
  assert(recReq.booking.status === "requested", "anchor occurrence REQUESTED");
  const recAnchorAfter = await prisma.bookingSlot.findUnique({ where: { id: recSlot.id } });
  assert(recAnchorAfter?.status === "RESERVED" && recAnchorAfter.bookingId === recReq.booking.id, "anchor slot RESERVED + linked");

  const recDup = await prismaCreateRecurringRequest({
    workerId: khaled!.id,
    slotId: recSlot.id,
    customerName: "Recurring Tester",
    customerPhone: "+966 50 888 1234",
    customerEmail: "recurring@workersarena.test",
    jobTitle: "Smoke weekly maintenance",
    frequency: "weekly",
  });
  assert("error" in recDup && recDup.error === "slot-taken", "second request on the same slot rejected (slot-taken)");

  // A covering slot for the +7d cadence time — the only occurrence that can
  // materialize at accept (the +14d/+21d/+28d have no AVAILABLE slot yet).
  const recSlot7 = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: new Date(recAnchorStart.getTime() + 7 * 24 * 60 * 60 * 1000),
      endAt: new Date(recAnchorStart.getTime() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-recurring-7d",
    },
  });
  const recAccepted = await prismaRespondToRecurring(recReq.recurring.id, { accept: true, quote: 10000 });
  assert(recAccepted !== null, "recurring accept returns the contract");
  assert(recAccepted!.occurrences[0]?.status === "confirmed", "anchor occurrence CONFIRMED");
  // 7% take rate (PLATFORM_FEE_RATE_BPS = 700) on the 10000 quote → 700 minor.
  assert(
    recAccepted!.occurrences[0]?.quote === 10000 && recAccepted!.occurrences[0]?.platformFee === 700,
    "quote + take-rate stamped (10000 × 7% = 700 minor)"
  );
  const recAnchorAfter2 = await prisma.bookingSlot.findUnique({ where: { id: recSlot.id } });
  assert(recAnchorAfter2?.status === "BOOKED", "anchor slot BOOKED after accept");
  assert(recAccepted!.occurrences.length === 2, "exactly one future occurrence materialized (+7d)");
  assert(
    recAccepted!.occurrences[1]?.status === "confirmed" && recAccepted!.occurrences[1]?.recurringId === recReq.recurring.id,
    "materialized occurrence CONFIRMED + linked to the contract"
  );
  const recSlot7After = await prisma.bookingSlot.findUnique({ where: { id: recSlot7.id } });
  assert(recSlot7After?.status === "BOOKED" && recSlot7After.bookingId === recAccepted!.occurrences[1]!.id, "+7d slot claimed by the occurrence");

  // Generation cron — +14d has no slot yet: run → 0; give +14d a slot: run →
  // 1; re-run → 0 (idempotent).
  const gen1 = await prismaGenerateRecurringOccurrences();
  assert(gen1.materialized === 0, "cron run before +14d availability materializes nothing");
  const recSlot14 = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: new Date(recAnchorStart.getTime() + 14 * 24 * 60 * 60 * 1000),
      endAt: new Date(recAnchorStart.getTime() + 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-recurring-14d",
    },
  });
  // contracts >= 1: the SEEDED RC-1001 is also an active accepted contract the
  // engine considers (its future occurrences have no covering slots, so it
  // never contributes to materialized).
  const gen2 = await prismaGenerateRecurringOccurrences();
  assert(gen2.materialized === 1 && gen2.contracts >= 1, "cron materializes the +14d occurrence once availability covers it");
  const gen3 = await prismaGenerateRecurringOccurrences();
  assert(gen3.materialized === 0, "cron re-run materializes nothing (idempotent)");

  // Reads — customer lookup (email) + worker list both see the contract.
  const custRec = await prismaGetCustomerRecurrings({ email: "recurring@workersarena.test" });
  assert(
    custRec.some((r) => r.id === recReq.recurring.id && r.occurrences.length === 3),
    "customer lookup finds the contract with 3 occurrences"
  );
  const workerRec = await prismaGetWorkerRecurrings(khaled!.id);
  assert(workerRec.some((r) => r.id === recReq.recurring.id), "worker list finds the contract");

  // Decline path — a second contract, declined: CANCELLED + first DECLINED +
  // slot freed (rule 3).
  const recDeclStart = new Date(Date.now() + 49 * 60 * 60 * 1000);
  const recDeclSlot = await prisma.bookingSlot.create({
    data: {
      workerId: khaled!.id,
      startAt: recDeclStart,
      endAt: new Date(recDeclStart.getTime() + 60 * 60 * 1000),
      status: "AVAILABLE",
      note: "smoke-recurring-decline",
    },
  });
  const recDecl = await prismaCreateRecurringRequest({
    workerId: khaled!.id,
    slotId: recDeclSlot.id,
    customerName: "Recurring Tester",
    customerPhone: "+966 50 888 1234",
    customerEmail: "recurring@workersarena.test",
    jobTitle: "Smoke weekly maintenance (decline)",
    frequency: "monthly",
  });
  assert(!("error" in recDecl), "decline-path contract created");
  const recDeclined = await prismaRespondToRecurring(recDecl.recurring.id, { accept: false, declineReason: "not available" });
  assert(recDeclined?.status === "cancelled", "declined contract CANCELLED");
  assert(recDeclined!.occurrences[0]?.status === "declined", "declined first occurrence DECLINED");
  const recDeclSlotAfter = await prisma.bookingSlot.findUnique({ where: { id: recDeclSlot.id } });
  assert(recDeclSlotAfter?.status === "AVAILABLE" && recDeclSlotAfter.bookingId === null, "decline frees the slot (rule 3)");

  // Customer cancel — the accepted contract: cadence cancelled, slots freed.
  const recCancelled = await prismaCancelRecurringContract(recReq.recurring.id, "smoke teardown");
  assert(recCancelled?.status === "cancelled", "customer cancel flips the contract to CANCELLED");
  assert(recCancelled!.occurrences.every((o) => o.status === "cancelled"), "all occurrences cancelled");
  const recAnchorAfter3 = await prisma.bookingSlot.findUnique({ where: { id: recSlot.id } });
  const recSlot7After2 = await prisma.bookingSlot.findUnique({ where: { id: recSlot7.id } });
  const recSlot14After2 = await prisma.bookingSlot.findUnique({ where: { id: recSlot14.id } });
  assert(
    recAnchorAfter3?.status === "AVAILABLE" && recSlot7After2?.status === "AVAILABLE" && recSlot14After2?.status === "AVAILABLE",
    "customer cancel frees every occurrence's slot"
  );
  console.log(
    "W2 recurring: request → slot-taken dup rejected → accept (quote + take-rate, +7d materialized) → cron (+14d, idempotent) → decline frees slot → customer cancel frees all slots"
  );

  // Cleanup — restore the seeded rows so the smoke stays idempotent.
  // W2 recurring — the smoke contracts' occurrences (Bookings, events
  // cascade), the contract rows, then the dedicated slots (the freed slots
  // are unlinked but ours to drop). Notifications ride the
  // SMOKE_NOTIFICATION_TYPES sweep below.
  await prisma.booking.deleteMany({ where: { recurringBookingId: { in: [recReq.recurring.id, recDecl.recurring.id] } } });
  await prisma.recurringBooking.deleteMany({ where: { id: { in: [recReq.recurring.id, recDecl.recurring.id] } } });
  await prisma.bookingSlot.deleteMany({ where: { id: { in: [recSlot.id, recSlot7.id, recSlot14.id, recDeclSlot.id] } } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: created.id } });
  await prisma.booking.delete({ where: { id: created.id } });
  await prisma.bookingSlot.update({ where: { id: free!.id }, data: { status: "AVAILABLE", bookingId: null } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: remCreated.id } });
  await prisma.booking.delete({ where: { id: remCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: remSlot.id } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: opsCreated.id } });
  await prisma.booking.delete({ where: { id: opsCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: opsSlot.id } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: opsCreated2.id } });
  await prisma.booking.delete({ where: { id: opsCreated2.id } });
  await prisma.bookingSlot.delete({ where: { id: opsSlot2.id } });
  // M3 — the deposit bookings' Payment rows (booking delete SetNulls the links).
  await prisma.payment.deleteMany({ where: { metadata: { path: ["bookingId"], equals: m3Created.id } } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: m3Created.id } });
  await prisma.booking.delete({ where: { id: m3Created.id } });
  await prisma.bookingSlot.delete({ where: { id: m3Slot.id } });
  await prisma.payment.deleteMany({ where: { metadata: { path: ["bookingId"], equals: m3bCreated.id } } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: m3bCreated.id } });
  await prisma.booking.delete({ where: { id: m3bCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: m3bSlot.id } });
  // M3 invoice — drop the receipt (invoice first: deleting the payment
  // SetNulls Invoice.paymentId and would orphan the row).
  await prisma.invoice.deleteMany({ where: { paymentId: m3cRow!.payment!.id } });
  await prisma.payment.deleteMany({ where: { metadata: { path: ["bookingId"], equals: m3cCreated.id } } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: m3cCreated.id } });
  await prisma.booking.delete({ where: { id: m3cCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: m3cSlot.id } });
  // M4 reschedule — the moved booking's events + both dedicated slots.
  await prisma.bookingEvent.deleteMany({ where: { bookingId: rsCreated.id } });
  await prisma.booking.delete({ where: { id: rsCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: rsSlot.id } });
  await prisma.bookingSlot.delete({ where: { id: rsTarget.id } });
  // M4 activity — the feed entries (ActivityLog rows) for EVERY smoke booking
  // created this run, keyed by the bookingNo in meta (the seam logs REQUESTED /
  // CONFIRMED / CANCELLED / RESCHEDULED / NO_SHOW for the activity sections;
  // the M3 deposit confirms log BOOKING_CONFIRMED inside the adapters — all
  // must go); then the bookings + their dedicated slots.
  // (JsonFilter has no `in` on a path — OR the equals filters.)
  await prisma.activityLog.deleteMany({
    where: {
      OR: [
        { meta: { path: ["bookingNo"], equals: actCreated.number } },
        { meta: { path: ["bookingNo"], equals: rs2Created.number } },
        { meta: { path: ["bookingNo"], equals: nsCreated.number } },
        { meta: { path: ["bookingNo"], equals: m3Created.number } },
        { meta: { path: ["bookingNo"], equals: m3bCreated.number } },
        { meta: { path: ["bookingNo"], equals: m3cCreated.number } },
      ],
    },
  });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: actCreated.id } });
  await prisma.booking.delete({ where: { id: actCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: actSlot.id } });
  // Feed reschedule + no-show bookings + their dedicated slots.
  await prisma.bookingEvent.deleteMany({ where: { bookingId: rs2Created.id } });
  await prisma.booking.delete({ where: { id: rs2Created.id } });
  await prisma.bookingSlot.delete({ where: { id: rs2Slot.id } });
  await prisma.bookingSlot.delete({ where: { id: rs2Target.id } });
  await prisma.bookingEvent.deleteMany({ where: { bookingId: nsCreated.id } });
  await prisma.booking.delete({ where: { id: nsCreated.id } });
  await prisma.bookingSlot.delete({ where: { id: nsSlot.id } });
  // The smoke may have persisted notification rows (create/accept/reminder
  // pushes with DEMO_MODE=false) — the seed has none, so dropping the booking
  // types restores it exactly.
  await prisma.notification.deleteMany({ where: { type: { in: [...SMOKE_NOTIFICATION_TYPES] } } });
  console.log("cleanup: generated slots + demo/reminder/activity bookings removed, ActivityLog feed entries cleared, seeded slot restored to AVAILABLE");

  await prisma.$disconnect();
  console.log("✅ SMOKE OK");
}

main().catch((e) => {
  console.error("❌ SMOKE FAIL:", e);
  process.exit(1);
});
