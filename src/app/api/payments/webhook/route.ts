import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments/registry";
import { confirmBookingPayment, confirmCampaignPayment } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook — provider callback for paid checkouts.
 *
 * M3 deposits: Stripe delivers `checkout.session.completed` with a
 * `stripe-signature` header (verified against STRIPE_WEBHOOK_SECRET); the
 * simulated provider (used when no keys are set) posts a signed JSON body.
 * The webhook resolves which entity the session belongs to from the provider
 * metadata — a `campaignId` confirms an ad-campaign purchase
 * (PENDING → ACTIVE), a `bookingId` confirms a booking deposit
 * (PENDING_PAYMENT → CONFIRMED).
 *
 * Responds 200 quickly (providers retry on failure); the confirm itself is
 * idempotent, so duplicate deliveries are harmless.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const provider = getPaymentProvider();

  let bookingId: string | undefined;
  let campaignId: string | undefined;
  let providerRef: string | undefined;
  try {
    const verified = await provider.verifyWebhook(req.headers, rawBody);
    bookingId = verified?.bookingId;
    campaignId = verified?.campaignId;
    providerRef = verified?.providerRef;
  } catch {
    bookingId = undefined;
    campaignId = undefined;
  }
  if (!providerRef || (!bookingId && !campaignId)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (campaignId) {
    await confirmCampaignPayment(campaignId, providerRef);
  } else if (bookingId) {
    await confirmBookingPayment(bookingId, providerRef);
  }
  return NextResponse.json({ ok: true });
}
