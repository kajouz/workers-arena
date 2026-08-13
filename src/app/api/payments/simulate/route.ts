import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments/registry";
import { confirmBookingPayment, confirmCampaignPayment } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/simulate — the simulated provider's "checkout" landing
 * page. It verifies the signed token the provider minted in createCheckout
 * (acting as the provider callback for the keyless flow), confirms the
 * payment, then redirects the customer back to their bookings page (or the
 * company dashboard for a campaign purchase).
 *
 * Real mode with STRIPE keys never hits this — Stripe customers go to
 * checkout.stripe.com and Stripe calls POST /api/payments/webhook.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const body = JSON.stringify({
    bookingId: url.searchParams.get("bookingId"),
    campaignId: url.searchParams.get("campaignId"),
    paymentId: url.searchParams.get("paymentId"),
    ref: url.searchParams.get("ref"),
    amount: Number(url.searchParams.get("amount") ?? "0"),
    sig: url.searchParams.get("sig"),
  });

  const verified = await getPaymentProvider().verifyWebhook(new Headers(), body);
  if (!verified) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  if (verified.campaignId) {
    await confirmCampaignPayment(verified.campaignId, verified.providerRef);
  } else if (verified.bookingId) {
    await confirmBookingPayment(verified.bookingId, verified.providerRef);
  }
  const target = url.searchParams.get("success") ?? (verified.campaignId ? "/company?paid=1" : "/bookings?paid=1");
  return NextResponse.redirect(new URL(target, url.origin), 302);
}
