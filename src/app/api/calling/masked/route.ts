/**
 * API Route: GET/POST /api/calling/masked
 *
 * GET: Fetch masked numbers for a booking (worker or customer view)
 * POST: Create masked numbers for a booking
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getBookingById } from "@/lib/data/repo";
import { getWorkerById } from "@/lib/data/repo";
import { createMaskedNumbers, getMaskedNumbersForBooking } from "@/lib/calling/masked-number-service";

async function canAccessBooking(
  bookingId: string,
  session: { id: string; email: string; role: string }
): Promise<boolean> {
  if (session.role === "admin") return true;
  const booking = await getBookingById(bookingId);
  if (!booking) return false;
  if (session.role === "customer") {
    return (
      (booking.customerId != null && booking.customerId === session.id) ||
      (booking.customerEmail != null && booking.customerEmail.toLowerCase() === session.email.toLowerCase())
    );
  }
  if (session.role === "worker") {
    // Demo worker: match by worker.id OR worker.email (session.email)
    const worker = await getWorkerById(booking.workerId);
    if (worker && (worker.id === session.id || worker.email === session.email)) return true;
    // Fallback: direct workerId match (when session.id is the worker id)
    if (booking.workerId === session.id) return true;
    return false;
  }
  // Company and other roles: not a party to the booking
  return false;
}

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    const bookingId = url.searchParams.get("bookingId");
    const partyType = url.searchParams.get("partyType") as "worker" | "customer" | null;

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
    }

    // Ownership check — only the booking's customer/worker or an admin may view
    if (!(await canAccessBooking(bookingId, session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (partyType) {
      // Get specific party's masked number
      const { getMaskedNumberForBooking } = await import("@/lib/calling/masked-number-service");
      const masked = await getMaskedNumberForBooking(bookingId, partyType);
      return NextResponse.json({ success: true, maskedNumber: masked });
    }

    // Get both masked numbers for the booking
    const result = await getMaskedNumbersForBooking(bookingId);
    return NextResponse.json({
      success: true,
      worker: result.worker,
      customer: result.customer,
    });
  } catch (error) {
    console.error("[API] Error fetching masked numbers:", error);
    return NextResponse.json({ error: "Failed to fetch masked numbers" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json();
    const { workerId, customerId, customerPhone, bookingId, expirationDays } = body;

    if (!workerId || !customerPhone || !bookingId) {
      return NextResponse.json(
        { error: "workerId, customerPhone, and bookingId are required" },
        { status: 400 }
      );
    }

    // Validate booking exists and caller is a party (prevents pool DoS / arbitrary ids)
    const booking = await getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }
    if (!(await canAccessBooking(bookingId, session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await createMaskedNumbers({
      workerId,
      customerId,
      customerPhone,
      bookingId,
      expirationDays,
    });

    return NextResponse.json({
      success: true,
      workerMasked: {
        id: result.workerMasked.id,
        maskedNumber: result.workerMasked.maskedNumber,
        expiresAt: result.workerMasked.expiresAt,
      },
      customerMasked: {
        id: result.customerMasked.id,
        maskedNumber: result.customerMasked.maskedNumber,
        expiresAt: result.customerMasked.expiresAt,
      },
    });
  } catch (error) {
    console.error("[API] Error creating masked numbers:", error);
    return NextResponse.json(
      { error: "Failed to create masked numbers" },
      { status: 500 }
    );
  }
}
