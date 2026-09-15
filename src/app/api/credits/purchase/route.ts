import { NextResponse } from "next/server";
import { createCreditPurchaseAction } from "@/app/actions/credits";

/**
 * POST /api/credits/purchase
 *
 * Create a credit purchase checkout. Body:
 *   { packageId: string; method: "OMT" | "WHISH" | "STRIPE" }
 *
 * Returns the checkout URL and pricing details.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { packageId, method } = body;

    if (!packageId || !method) {
      return NextResponse.json(
        { error: "packageId and method are required" },
        { status: 400 }
      );
    }

    if (!["OMT", "WHISH", "STRIPE"].includes(method)) {
      return NextResponse.json(
        { error: "method must be OMT, WHISH, or STRIPE" },
        { status: 400 }
      );
    }

    const result = await createCreditPurchaseAction({ packageId, method });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error creating credit purchase:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
