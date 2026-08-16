/**
 * Whish Money provider — the Lebanon-first digital wallet + dual-currency
 * Visa card (USD/LBP balances) for online & POS spending, instant local /
 * international cash transfers and bill settlement (docs/PAYMENTS.md). Like
 * OMT it is MANUAL: `createCheckout` mints a signed /payments/manual
 * instructions URL (the customer pays from the Whish app wallet and includes
 * the reference), and an ADMIN confirms receipt from the /admin
 * pending-payments card. No webhook; refunds are manual (provider refund id).
 */
import type { CheckoutRequest, CheckoutResult, PaymentProvider, VerifyResult } from "./types";
import { buildManualUrl, verifyManualBody } from "./manual";

export const whishProvider: PaymentProvider = {
  method: "WHISH",

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const url = buildManualUrl("WHISH", {
      paymentId: req.paymentId,
      bookingId: req.bookingId,
      campaignId: req.campaignId,
      amountMinor: req.amountMinor,
      description: req.description,
    });
    return { url, providerRef: new URL(url, "http://local").searchParams.get("ref")! };
  },

  /** Same verify contract as OMT — the /payments/manual page validates the URL
   * through this; the webhook route never sees manual payments. */
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
    return `whish_refund_${paymentRef}`;
  },
};
