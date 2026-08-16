/**
 * Provider registry (docs/PAYMENTS.md) — `getPaymentProvider()` returns the
 * real Stripe provider when STRIPE_SECRET_KEY is configured, the simulated
 * provider otherwise (local dev / tests / demo mode), and the MANUAL
 * Lebanon-first providers (OMT / Whish) whenever their method is requested —
 * those need no keys: the customer pays offline (agent / OMT Intra / Whish
 * app) and an admin confirms receipt from the /admin pending-payments card.
 * Adding PayPal, MyFatoorah, Tap, bank-transfer or cash is a new module + one
 * registry line.
 */
import { simulatedProvider } from "./simulated";
import { stripeProvider } from "./stripe";
import { omtProvider } from "./omt";
import { whishProvider } from "./whish";
import type { PaymentProvider, PaymentProviderMethod } from "./types";

let warned = false;

export function getPaymentProvider(method: PaymentProviderMethod = "STRIPE"): PaymentProvider {
  // Manual Lebanon money-movers — no keys, no webhook, admin-confirmed.
  if (method === "OMT") return omtProvider;
  if (method === "WHISH") return whishProvider;

  if (method === "STRIPE") {
    if (process.env.STRIPE_SECRET_KEY) return stripeProvider;
    // The simulated provider lets ANYONE confirm a booking keyless (its local
    // /api/payments/simulate callback is signed with a dev secret) — it must
    // never run in production. Fail loudly instead of silently simulating.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[payments] STRIPE_SECRET_KEY is not set in production — refusing to use the simulated provider. " +
          "Configure STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET (or use the OMT/Whish manual methods)."
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
