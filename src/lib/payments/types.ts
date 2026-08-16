/**
 * Payment provider seam (docs/PAYMENTS.md) — the booking deposit checkout
 * (M3, docs/booking-scheduling.md §7) goes through a PaymentProvider so
 * adding a gateway (PayPal, MyFatoorah, Tap, bank, cash) is a single-file
 * change. Every amount is INTEGER MINOR UNITS.
 */

export type PaymentProviderMethod = "STRIPE" | "SIMULATED" | "OMT" | "WHISH";

/** The Lebanon-first offline money-movers (docs/PAYMENTS.md §OMT & Whish):
 * manual, agent-based methods with NO webhook — the customer pays over the
 * counter / via the OMT Intra or Whish app, and an admin confirms receipt
 * from the /admin pending-payments card. */
export const MANUAL_PROVIDER_METHODS: ReadonlyArray<PaymentProviderMethod> = ["OMT", "WHISH"] as const;

export function isManualProviderMethod(method: string): method is "OMT" | "WHISH" {
  return method === "OMT" || method === "WHISH";
}

/** What a checkout needs to build a hosted payment session. */
export interface CheckoutRequest {
  /** Our Payment row id (stored in provider metadata for the webhook). */
  paymentId: string;
  /** Booking id — the webhook resolves the booking from this (M3 deposits). */
  bookingId?: string;
  /** Campaign id — the webhook resolves the campaign from this (ad purchases). */
  campaignId?: string;
  /** Minor units. */
  amountMinor: number;
  currency: string;
  customerEmail?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** Where the customer is redirected to pay. */
  url: string;
  /** Provider's session/charge id — stored on Payment.providerRef. */
  providerRef: string;
}

/** What a verified webhook hands back to the payment-confirm logic. */
export interface VerifyResult {
  /** Which entity the webhook resolves — exactly one of the two is set. */
  bookingId?: string;
  campaignId?: string;
  providerRef: string;
  /** Optional — the charged amount (minor units), when the provider reports it. */
  amountMinor?: number;
}

export interface PaymentProvider {
  readonly method: PaymentProviderMethod;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Throws (or returns null) when the signature/body is invalid. */
  verifyWebhook(headers: Headers, rawBody: string): Promise<VerifyResult | null>;
  /** Returns the provider's refund id. */
  refund(paymentRef: string, amountMinor?: number): Promise<string>;
}
