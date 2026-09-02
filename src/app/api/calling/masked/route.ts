/**
 * API Route: POST /api/calling/masked
 *
 * Create masked numbers for a booking (worker and customer).
 * Only accessible by the booking's worker or customer.
 */

import { NextResponse } from "next/server";
import { createMaskedNumbers } from "@/lib/calling/masked-number-service";

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
