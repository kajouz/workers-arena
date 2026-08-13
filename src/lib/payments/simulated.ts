/**
 * Simulated payment provider — the default when no gateway keys are set
 * (local dev, tests, demo mode). Instead of hitting a real gateway it
 * produces a local "checkout" URL that the customer (or a test) opens to
 * immediately complete the payment, mirroring how a provider webhook fires.
 *
 * The /api/payments/simulate route verifies the signed token below and then
 * runs the SAME confirm path a real webhook runs, so the whole M3 flow is
 * exercisable end-to-end without credentials.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutRequest, CheckoutResult, PaymentProvider, VerifyResult } from "./types";

const SIM_SECRET = process.env.PAYMENT_SIM_SECRET ?? "sim-dev-secret";

function sign(payload: string): string {
  return createHmac("sha256", SIM_SECRET).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const simulatedProvider: PaymentProvider = {
  method: "SIMULATED",

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const providerRef = `sim_${req.paymentId}`;
    const sig = sign(`${req.bookingId ?? ""}:${req.campaignId ?? ""}:${req.paymentId}:${req.amountMinor}`);
    // A relative URL — the browser resolves it against the current origin, so
    // the simulated flow works in dev, tests, and any deployment without
    // knowing the absolute base (Stripe's real URL is absolute).
    const params = new URLSearchParams({
      paymentId: req.paymentId,
      ref: providerRef,
      amount: String(req.amountMinor),
      sig,
    });
    if (req.bookingId) params.set("bookingId", req.bookingId);
    if (req.campaignId) params.set("campaignId", req.campaignId);
    const url = `/api/payments/simulate?${params.toString()}`;
    return { url, providerRef };
  },

  async verifyWebhook(_headers: Headers, rawBody: string): Promise<VerifyResult | null> {
    let body: { bookingId?: string; campaignId?: string; paymentId?: string; ref?: string; amount?: number; sig?: string };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const { bookingId, campaignId, paymentId, ref, amount, sig } = body;
    if (!paymentId || !ref || !sig) return null;
    const expected = sign(`${bookingId ?? ""}:${campaignId ?? ""}:${paymentId}:${amount ?? ""}`);
    if (!safeEqual(expected, sig)) return null;
    if (campaignId) return { campaignId, providerRef: ref, amountMinor: amount };
    if (bookingId) return { bookingId, providerRef: ref, amountMinor: amount };
    return null;
  },

  async refund(paymentRef: string): Promise<string> {
    return `refund_${paymentRef}`;
  },
};
