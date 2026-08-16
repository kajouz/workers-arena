/**
 * OMT provider — the Lebanon-first offline money-mover (docs/PAYMENTS.md):
 * OMT Intra domestic transfers + OMT Pay app + over-the-counter agent
 * deposits at 1,200+ locations. There is NO hosted checkout and NO webhook:
 * `createCheckout` mints a signed /payments/manual instructions URL showing
 * the customer how to pay + the unique reference to include, and an ADMIN
 * confirms receipt from the /admin pending-payments card. Refunds are manual
 * too — the provider returns a refund id for the admin's records.
 */
import type { CheckoutRequest, CheckoutResult, PaymentProvider, VerifyResult } from "./types";
import { buildManualUrl, verifyManualBody } from "./manual";

export const omtProvider: PaymentProvider = {
  method: "OMT",

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const url = buildManualUrl("OMT", {
      paymentId: req.paymentId,
      bookingId: req.bookingId,
      campaignId: req.campaignId,
      amountMinor: req.amountMinor,
      description: req.description,
    });
    return { url, providerRef: new URL(url, "http://local").searchParams.get("ref")! };
  },

  /** Manual providers have no webhook — but the instructions page verifies the
   * URL through this SAME contract, so one verify path serves both. */
  async verifyWebhook(_headers: Headers, rawBody: string): Promise<VerifyResult | null> {
    let body: {
      bookingId?: string;
      campaignId?: string;
      paymentId?: string;
      ref?: string;
      amount?: number;
      sig?: string;
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!verifyManualBody(body)) return null;
    return { bookingId: body.bookingId, campaignId: body.campaignId, providerRef: body.ref! };
  },

  async refund(paymentRef: string): Promise<string> {
    return `omt_refund_${paymentRef}`;
  },
};
