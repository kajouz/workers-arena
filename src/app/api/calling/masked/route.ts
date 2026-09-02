/**
 * API Route: GET/POST /api/calling/masked
 *
 * GET: Fetch masked numbers for a booking (worker or customer view)
 * POST: Create masked numbers for a booking
 */

import { NextResponse } from "next/server";
import { createMaskedNumbers, getMaskedNumbersForBooking } from "@/lib/calling/masked-number-service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const bookingId = url.searchParams.get("bookingId");
    const partyType = url.searchParams.get("partyType") as "worker" | "customer" | null;

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId is required" }, { status: 400 });
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
    const body = await request.json();
    const { workerId, customerId, customerPhone, bookingId, expirationDays } = body;

    if (!workerId || !customerPhone || !bookingId) {
      return NextResponse.json(
        { error: "workerId, customerPhone, and bookingId are required" },
        { status: 400 }
      );
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
