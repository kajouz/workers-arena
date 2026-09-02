/**
 * API Route: GET /api/calling/admin
 *
 * Admin-only endpoint to manage masked numbers and reveal real phone numbers.
 * Requires admin role authentication.
 */

import { NextResponse } from "next/server";
import { getAllMaskedNumbers, getRealNumberForMasked } from "@/lib/calling/masked-number-service";
import { getSession } from "@/lib/auth-demo";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const maskedNumberId = url.searchParams.get("maskedNumberId");

    // If maskedNumberId is provided, return the real number (admin only)
    if (maskedNumberId) {
      const realNumber = await getRealNumberForMasked(maskedNumberId);
      if (!realNumber) {
        return NextResponse.json({ error: "Masked number not found" }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        realNumber: realNumber.realNumber,
        partyType: realNumber.partyType,
        bookingId: realNumber.bookingId,
      });
    }

    // Otherwise, return all masked numbers
    const maskedNumbers = await getAllMaskedNumbers();

    return NextResponse.json({
      success: true,
      maskedNumbers: maskedNumbers.map((mn) => ({
        id: mn.id,
        maskedNumber: mn.maskedNumber,
        partyType: mn.partyType,
        bookingId: mn.bookingId,
        createdAt: mn.createdAt,
        expiresAt: mn.expiresAt,
        isActive: mn.isActive,
        callCount: mn.callCount,
        lastUsedAt: mn.lastUsedAt,
        // Include real numbers for admin view
        realNumber: mn.realNumber,
      })),
    });
  } catch (error) {
    console.error("[API] Error in admin masked numbers:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
