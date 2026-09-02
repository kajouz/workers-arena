import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getBookingById } from "@/lib/data/repo";

/**
 * GET /api/calling/contact-details?bookingId=xxx
 *
 * Returns the real contact details for a booking IF:
 * 1. The booking status is "inProgress" or "completionPending" or "completed"
 * 2. The requestor is the booking's worker or customer (or admin)
 * 3. The contactDetailsReleasedAt timestamp is set
 *
 * For emergency bookings, contact details are available immediately.
 * For non-emergency bookings, contact details are only available after
 * the worker arrives (inProgress) or the job is completion-pending/completed.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const bookingId = url.searchParams.get("bookingId");

  if (!bookingId) {
    return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booking = await getBookingById(bookingId);
  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  // Permission check: only the booking's worker, customer, or admin
  const { getWorkerById } = await import("@/lib/data/repo");
  const worker = await getWorkerById(booking.workerId);
  const isAdmin = session.role === "admin";
  const isWorker =
    session.role === "worker" &&
    Boolean((worker && worker.id === session.id) || (worker?.email && worker.email === session.email));
  const isCustomer =
    session.role === "customer" &&
    Boolean(
      (booking.customerId && booking.customerId === session.id) ||
        (booking.customerEmail && booking.customerEmail === session.email)
    );

  if (!isAdmin && !isWorker && !isCustomer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Emergency bookings: contact details available immediately
  const isEmergency = booking.isEmergency;

  // Non-emergency: only available when booking is inProgress, completionPending, or completed
  const releasableStatuses = ["inProgress", "completionPending", "completed"];
  const contactReleased = booking.contactDetailsReleasedAt || isEmergency;
  const statusAllows = releasableStatuses.includes(booking.status);

  if (!contactReleased && !statusAllows) {
    return NextResponse.json({
      released: false,
      message: "Contact details are only available when the job is in progress or completed",
    });
  }

  // Return the relevant contact details based on who's requesting
  if (isWorker || isAdmin) {
    return NextResponse.json({
      released: true,
      contact: {
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        customerEmail: booking.customerEmail,
      },
    });
  }

  if (isCustomer) {
    return NextResponse.json({
      released: true,
      contact: {
        workerId: booking.workerId,
        workerName: worker ? (booking.customerLocale === "ar" ? worker.nameAr : worker.nameEn) : "Worker",
        workerPhone: worker?.phone,
        workerEmail: worker?.email,
      },
    });
  }

  return NextResponse.json({ released: false, message: "Unable to determine contact details" });
}
