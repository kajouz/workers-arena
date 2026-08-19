import { NextResponse } from "next/server";
import { isDemoMode, getWorkerBySlug } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/dev/seed-customer-booking — demo-mode-only test fixture.
 *
 * The e2e hydration smoke visits /bookings with the customer (Sara) session
 * and asserts the row's "Preview email" dialog renders the iframe copy in the
 * page locale. The Preview button only renders on a booking whose state
 * implies a customer email was sent (customerEmailKind non-null) — and Sara's
 * only seeded booking (BK-1001) is REQUESTED, so no preview can exist. This
 * route seeds a COMPLETED booking for Sara (idempotent on its fixed number),
 * whose system-actor completion is the auto-confirm path that emails the
 * customer the completion receipt — so the /bookings rows render the same
 * bilingual preview dialog the admin dispute view shows for BK-0990.
 *
 * The booking is created through the demo store's showcase seam
 * (demoSeedCompletedBookingForCustomer — the same pure-data construction the
 * seeded BK-0990 uses: no transitions, no ledger credit, no notifications),
 * and the worker resolves through the real getWorkerBySlug seam so the row's
 * worker display data is genuine. Guarded by demo mode: in production this
 * route is unreachable (404).
 */
export async function POST() {
  if (!isDemoMode) {
    return NextResponse.json({ error: "demo-only" }, { status: 404 });
  }

  const { demoSeedCompletedBookingForCustomer, demoGetBookingByNumber } = await import("@/lib/data/bookings");

  // Idempotent: the seeded booking (fixed number) already exists → no-op.
  const existing = demoGetBookingByNumber("BK-0991");
  if (existing) {
    return NextResponse.json({ ok: true, id: existing.id, alreadySeeded: true });
  }

  const worker = await getWorkerBySlug("khaled-al-harbi-plumbing");
  if (!worker) {
    return NextResponse.json({ error: "worker not found" }, { status: 500 });
  }

  const booking = demoSeedCompletedBookingForCustomer({
    id: "bk-0991",
    number: "BK-0991",
    workerId: worker.id,
    customerId: "u-customer",
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    // Catalog plumbing item — the AR receipt email's "Service" row renders
    // the Arabic name end-to-end in the preview.
    serviceItem: { nameEn: "Fix leaking pipe", nameAr: "إصلاح تسريب ماسورة", price: 120, unit: "job" },
  });
  if (!booking) {
    return NextResponse.json({ error: "seed failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: booking.id, number: booking.number, status: booking.status });
}
