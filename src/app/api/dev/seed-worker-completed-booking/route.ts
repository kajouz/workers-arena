import { NextResponse } from "next/server";
import { isDemoMode, getWorkerBySlug } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/seed-worker-completed-booking — demo-mode-only test fixture.
 *
 * The worker dashboard's "Preview email" button renders only on a booking
 * whose state implies a WORKER email was sent (workerEmailKind non-null) —
 * and every seeded completed booking (BK-0990, BK-0991) was completed by the
 * SYSTEM (the grace-cron auto-confirm, which emails the CUSTOMER), so the
 * worker side never had a previewable row. This route seeds a COMPLETED
 * booking for the demo worker (Khaled) whose completion was confirmed by the
 * CUSTOMER (completionActor: "customer" — the demoConfirmBookingCompletion
 * path, which emails the WORKER the payout-on-its-way receipt), so the
 * /dashboard Past rows render the same bilingual preview dialog the customer
 * and admin surfaces show.
 *
 * The booking is created through the demo store's showcase seam
 * (demoSeedCompletedBookingForCustomer — the same pure-data construction the
 * seeded BK-0990/BK-0991 use, idempotent on its fixed number). Guarded by
 * demo mode: in production this route is unreachable (404).
 */
export async function POST() {
  if (!isDemoMode) {
    return NextResponse.json({ error: "demo-only" }, { status: 404 });
  }

  const { demoSeedCompletedBookingForCustomer, demoGetBookingByNumber } = await import("@/lib/data/bookings");

  // Idempotent: the seeded booking (fixed number) already exists → no-op.
  const existing = demoGetBookingByNumber("BK-0992");
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, alreadySeeded: true });
  }

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) {
    return NextResponse.json({ error: "worker not found" }, { status: 500 });
  }

  const booking = demoSeedCompletedBookingForCustomer({
    id: "bk-0992",
    number: "BK-0992",
    workerId: worker.id,
    customerId: "u-customer",
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Bathroom tiles re-grouting",
    // Catalog plumbing item (closest match to the free-text title) — the AR
    // worker-receipt email's "Service" row renders the Arabic name.
    serviceItem: { nameEn: "Bathroom renovation", nameAr: "تجديد حمام", price: 900, unit: "job" },
    completionActor: "customer",
  });
  if (!booking) {
    return NextResponse.json({ error: "seed failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: booking.id, number: booking.number, status: booking.status });
}
