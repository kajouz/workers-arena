/**
 * Shared helpers for the MANUAL payment providers (OMT + Whish — the
 * Lebanon-first offline money-movers, docs/PAYMENTS.md). Unlike Stripe there
 * is no hosted checkout and no webhook: `createCheckout` mints a signed local
 * instructions URL (/payments/manual) that shows the customer exactly how to
 * pay — the OMT/Whish app steps + the unique reference to include — and an
 * ADMIN confirms receipt from the /admin pending-payments card (the manual
 * twin of a provider webhook).
 *
 * The signature scheme mirrors the simulated provider (HMAC-SHA256 over
 * `bookingId:campaignId:paymentId:amount` with PAYMENT_SIM_SECRET) so the
 * instructions page can verify the URL with the SAME provider.verifyWebhook
 * contract the webhook route uses — one verify path for all three.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProviderMethod } from "./types";

const SIM_SECRET = process.env.PAYMENT_SIM_SECRET ?? "sim-dev-secret";

export function signManual(payload: string): string {
  return createHmac("sha256", SIM_SECRET).update(payload).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export interface ManualCheckoutBody {
  bookingId?: string;
  campaignId?: string;
  paymentId?: string;
  ref?: string;
  amount?: number;
  sig?: string;
  provider?: string;
}

/** Verify a manual-instructions URL's signed params (the GET /payments/manual
 * page and tests round-trip through this — the same contract the simulated
 * provider's verifyWebhook keeps, minus entity resolution: manual payments
 * have no webhook to resolve an entity from). */
export function verifyManualBody(body: ManualCheckoutBody): boolean {
  const { bookingId, campaignId, paymentId, amount, sig } = body;
  if (!paymentId || !body.ref || !sig) return false;
  const expected = signManual(`${bookingId ?? ""}:${campaignId ?? ""}:${paymentId}:${amount ?? ""}`);
  return safeEqual(expected, sig);
}

/** Build the signed /payments/manual URL for a manual method. */
export function buildManualUrl(
  method: PaymentProviderMethod,
  req: {
    paymentId: string;
    bookingId?: string;
    campaignId?: string;
    amountMinor: number;
    description: string;
  }
): string {
  const providerRef = `${method}-${req.paymentId}-${(req.amountMinor % 1000).toString().padStart(3, "0")}`;
  const sig = signManual(`${req.bookingId ?? ""}:${req.campaignId ?? ""}:${req.paymentId}:${req.amountMinor}`);
  const params = new URLSearchParams({
    provider: method.toLowerCase(),
    paymentId: req.paymentId,
    ref: providerRef,
    amount: String(req.amountMinor),
    desc: req.description,
    sig,
  });
  if (req.bookingId) params.set("bookingId", req.bookingId);
  if (req.campaignId) params.set("campaignId", req.campaignId);
  return `/payments/manual?${params.toString()}`;
}
