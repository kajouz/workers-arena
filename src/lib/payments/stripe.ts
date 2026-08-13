/**
 * Stripe provider — real checkout sessions + webhook signature verification
 * + refunds, via Stripe's REST API (no SDK dependency).
 *
 * Activated when STRIPE_SECRET_KEY is set; the registry falls back to the
 * simulated provider otherwise so local dev/tests need no credentials.
 * Webhook verification requires STRIPE_WEBHOOK_SECRET.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { CheckoutRequest, CheckoutResult, PaymentProvider, VerifyResult } from "./types";

const API = "https://api.stripe.com/v1";

function secret(): string {
  const s = process.env.STRIPE_SECRET_KEY;
  if (!s) throw new Error("STRIPE_SECRET_KEY is not set");
  return s;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const stripeProvider: PaymentProvider = {
  method: "STRIPE",

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": req.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(req.amountMinor),
      "line_items[0][price_data][product_data][name]": req.description,
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      // The webhook resolves the booking (or campaign) + payment from these.
      "metadata[paymentId]": req.paymentId,
    });
    if (req.bookingId) body.set("metadata[bookingId]", req.bookingId);
    if (req.campaignId) body.set("metadata[campaignId]", req.campaignId);
    if (req.customerEmail) body.set("customer_email", req.customerEmail);

    const res = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`stripe createCheckout ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { url?: string; id: string };
    if (!json.url) throw new Error("stripe createCheckout returned no url");
    return { url: json.url, providerRef: json.id };
  },

  async verifyWebhook(headers: Headers, rawBody: string): Promise<VerifyResult | null> {
    const whsec = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = headers.get("stripe-signature");
    if (!whsec || !sig) return null;

    // Header format: t=<ts>,v1=<hmac>,v0=<hmac> — verify the v1 line.
    const parts = Object.fromEntries(
      sig.split(",").map((pair) => {
        const [k, v] = pair.split("=");
        return [k, v];
      })
    );
    const ts = parts["t"];
    const expected = parts["v1"];
    if (!ts || !expected) return null;
    if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return null; // 5-min tolerance

    const signedPayload = `${ts}.${rawBody}`;
    const computed = createHmac("sha256", whsec).update(signedPayload).digest("hex");
    if (!safeEqual(computed, expected)) return null;

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: { object?: { metadata?: Record<string, string>; payment_intent?: string; amount_total?: number } };
    };
    if (event.type !== "checkout.session.completed") return null;
    const session = event.data?.object;
    if (!session) return null;
    const providerRef = session.payment_intent;
    if (!providerRef) return null;
    const bookingId = session.metadata?.bookingId;
    const campaignId = session.metadata?.campaignId;
    // The webhook must resolve SOME entity — a session for neither is a
    // foreign checkout (not ours), so it can't be verified against our rows.
    if (campaignId) return { campaignId, providerRef, amountMinor: session.amount_total };
    if (bookingId) return { bookingId, providerRef, amountMinor: session.amount_total };
    return null;
  },

  async refund(paymentRef: string, amountMinor?: number): Promise<string> {
    const body = new URLSearchParams({ payment_intent: paymentRef });
    if (amountMinor !== undefined) body.set("amount", String(amountMinor));
    const res = await fetch(`${API}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`stripe refund ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { id: string };
    return json.id;
  },
};
