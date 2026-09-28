import { getPaymentProvider } from "@/lib/payments/registry";

/**
 * The signed OMT/Whish instructions link (`/payments/manual?provider=…&ref=…
 * &amount=…&sig=…`). `createCheckout` mints it with an HMAC over these fields,
 * and the provider's own `verifyWebhook` checks it — the same verify path a
 * webhook would use. Whoever holds a genuine link is the payer of THAT
 * payment: the instructions page shows it, and the receipt upload accepts a
 * photo for its reference only.
 */
export interface ManualLinkParams {
  provider?: string | null;
  bookingId?: string | null;
  campaignId?: string | null;
  paymentId?: string | null;
  ref?: string | null;
  amount?: string | number | null;
  sig?: string | null;
}

export type VerifiedManualLink = { ok: true; provider: "OMT" | "WHISH"; ref: string; amountMinor: number } | { ok: false };

export async function verifyManualLink(params: ManualLinkParams): Promise<VerifiedManualLink> {
  const p = params.provider?.toUpperCase();
  const provider = p === "WHISH" ? "WHISH" : p === "OMT" ? "OMT" : null;
  if (!provider || !params.ref) return { ok: false };
  const amountMinor = Number(params.amount ?? "0");
  const body = JSON.stringify({
    bookingId: params.bookingId ?? undefined,
    campaignId: params.campaignId ?? undefined,
    paymentId: params.paymentId ?? undefined,
    ref: params.ref ?? undefined,
    amount: amountMinor,
    sig: params.sig ?? undefined,
  });
  try {
    const verified = (await getPaymentProvider(provider).verifyWebhook(new Headers(), body)) !== null;
    // The reference must also belong to THIS link's provider (an OMT link
    // cannot present a Whish reference).
    return verified && params.ref.startsWith(`${provider}-`) ? { ok: true, provider, ref: params.ref, amountMinor } : { ok: false };
  } catch {
    return { ok: false };
  }
}
