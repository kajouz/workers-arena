/**
 * Provider registry (docs/PAYMENTS.md) — `getPaymentProvider()` returns the
 * real Stripe provider when STRIPE_SECRET_KEY is configured and the simulated
 * provider otherwise (local dev / tests / demo mode). Adding PayPal,
 * MyFatoorah, Tap, bank-transfer or cash is a new module + one registry line.
 */
import { simulatedProvider } from "./simulated";
import { stripeProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderMethod } from "./types";

let warned = false;

export function getPaymentProvider(method: PaymentProviderMethod = "STRIPE"): PaymentProvider {
  if (method === "STRIPE") {
    if (process.env.STRIPE_SECRET_KEY) return stripeProvider;
    // The simulated provider lets ANYONE confirm a booking keyless (its local
    // /api/payments/simulate callback is signed with a dev secret) — it must
    // never run in production. Fail loudly instead of silently simulating.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[payments] STRIPE_SECRET_KEY is not set in production — refusing to use the simulated provider. " +
          "Configure STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET."
      );
    }
    if (!warned) {
      warned = true;
      console.warn(
        "[payments] STRIPE_SECRET_KEY not set — using the SIMULATED provider " +
          "(checkout completes instantly; set the key + STRIPE_WEBHOOK_SECRET for real charges)."
      );
    }
    return simulatedProvider;
  }
  return simulatedProvider;
}
