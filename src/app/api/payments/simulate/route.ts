import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payments/registry";
import { confirmBookingPayment, confirmCampaignPayment } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/simulate — the simulated provider's "checkout" callback.
 * It verifies the signed token the provider minted in createCheckout (acting
 * as the provider callback for the keyless flow), confirms the payment, then
 * redirects the customer back to their bookings page (or the company
 * dashboard for a campaign purchase).
 *
 * The side effect is POST-only. The old design confirmed on plain GET, which
 * every link prefetcher / speculative loader / crawler issues — a GET landing
 * in a warm-up pass could confirm someone's payment. Browsers only ever
 * prefetch with GET, so the confirmation now requires a real POST:
 *
 *   - POST with the signed params (query string, as the interstitial form
 *     resubmits them, or an equivalent JSON body for API-style callers)
 *     verifies + confirms + 302s to the success target.
 *   - GET renders a tiny auto-submitting form (the "provider checkout
 *     landing" the customer is redirected to from the pay button), which
 *     performs that POST. It is a pure page: it verifies the signature
 *     READ-ONLY (so a tampered link 400s immediately) but never confirms.
 *     no-store, so no cache can pin the interstitial.
 *
 * Real mode with STRIPE keys never hits this — Stripe customers go to
 * checkout.stripe.com and Stripe calls POST /api/payments/webhook.
 */

type SignedParams = {
  bookingId: string | null;
  campaignId: string | null;
  paymentId: string | null;
  ref: string | null;
  amountMinor: number;
  sig: string | null;
  success: string | null;
};

/**
 * The PUBLIC origin of the incoming request.
 *
 * `new URL(req.url)` inside a route handler carries the host the server is
 * BOUND to (typically `localhost`), not the host the client used — so a
 * redirect built from it points at a different origin whenever the app is
 * reached by another host: `127.0.0.1:3001` (the local preview and the e2e
 * suite), a LAN address (testing the PWA from a phone), or a preview domain.
 * The browser then refuses the navigation — `form-action 'self'` rejects the
 * cross-origin redirect, so the customer is left on the interstitial with the
 * payment already confirmed server-side and never sees /bookings?paid=1.
 * Prefer the forwarded host/proto, then the actual Host header, then req.url.
 */
function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const first = (value: string | null): string | undefined => value?.split(",")[0]?.trim() || undefined;
  const host = first(req.headers.get("x-forwarded-host")) ?? req.headers.get("host") ?? url.host;
  const proto = first(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(/:$/, "");
  return `${proto}://${host}`;
}

/** Same-origin relative redirect targets only — the HMAC does NOT cover the
 * `success` param, so an absolute or protocol-relative value (crafted by
 * anyone holding a valid signed URL) must never become the redirect. */
function safeTarget(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return fallback;
  }
  return raw;
}

/** POST body parsing: the signed params ride the query string (the
 * interstitial form resubmits the landing URL verbatim); a JSON body is
 * accepted for API-style callers. Query params are the fallback when the
 * body is absent or unparseable, and JSON values win when both exist. */
async function readParams(req: Request): Promise<SignedParams> {
  const url = new URL(req.url);
  const fromQuery: SignedParams = {
    bookingId: url.searchParams.get("bookingId"),
    campaignId: url.searchParams.get("campaignId"),
    paymentId: url.searchParams.get("paymentId"),
    ref: url.searchParams.get("ref"),
    amountMinor: Number(url.searchParams.get("amount") ?? "0"),
    sig: url.searchParams.get("sig"),
    success: url.searchParams.get("success"),
  };
  try {
    const json = (await req.json()) as Record<string, unknown>;
    const pick = (key: string): string | null =>
      json[key] === undefined || json[key] === null ? null : String(json[key]);
    return {
      bookingId: pick("bookingId") ?? fromQuery.bookingId,
      campaignId: pick("campaignId") ?? fromQuery.campaignId,
      paymentId: pick("paymentId") ?? fromQuery.paymentId,
      ref: pick("ref") ?? fromQuery.ref,
      amountMinor: Number(json.amount ?? fromQuery.amountMinor ?? 0),
      sig: pick("sig") ?? fromQuery.sig,
      success: pick("success") ?? fromQuery.success,
    };
  } catch {
    return fromQuery;
  }
}

/** Verify the signed token — READ-ONLY, no side effects. */
async function verifyParams(
  params: SignedParams
): Promise<{ campaignId?: string; bookingId?: string; providerRef: string } | null> {
  const body = JSON.stringify({
    bookingId: params.bookingId,
    campaignId: params.campaignId,
    paymentId: params.paymentId,
    ref: params.ref,
    amount: params.amountMinor,
    sig: params.sig,
  });
  return getPaymentProvider().verifyWebhook(new Headers(), body);
}

export async function POST(req: Request) {
  const params = await readParams(req);
  const verified = await verifyParams(params);
  if (!verified) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  // The confirm path a real webhook runs — idempotent (CAS re-delivery no-op).
  if (verified.campaignId) {
    await confirmCampaignPayment(verified.campaignId, verified.providerRef);
  } else if (verified.bookingId) {
    await confirmBookingPayment(verified.bookingId, verified.providerRef);
  }

  const fallback = verified.campaignId ? "/company?paid=1" : "/bookings?paid=1";
  // The target stays a same-origin relative path; only the ORIGIN it is
  // resolved against comes from the request (see requestOrigin).
  return NextResponse.redirect(
    new URL(safeTarget(params.success, fallback), requestOrigin(req)),
    302
  );
}

/** The provider "checkout landing": a side-effect-free page whose only job is
 * to turn the customer's top-level GET into the signed POST above. The HMAC
 * is verified here too (read-only) so a tampered link 400s immediately
 * instead of bouncing through the form first — but nothing is confirmed. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params: SignedParams = {
    bookingId: url.searchParams.get("bookingId"),
    campaignId: url.searchParams.get("campaignId"),
    paymentId: url.searchParams.get("paymentId"),
    ref: url.searchParams.get("ref"),
    amountMinor: Number(url.searchParams.get("amount") ?? "0"),
    sig: url.searchParams.get("sig"),
    success: url.searchParams.get("success"),
  };

  const verified = await verifyParams(params);
  if (!verified) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  // The form action carries the original signed query; the POST re-verifies
  // and confirms. form-action CSP is 'self' — same-origin form, no violation.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Processing payment…</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#0f172a;background:#f8fafc}
  main{text-align:center;padding:2rem}
  button{margin-top:1.25rem;padding:.6rem 1.4rem;font-size:1rem;border-radius:.5rem;border:0;background:#0284c7;color:#fff;cursor:pointer}
</style>
</head>
<body>
<main>
  <p>Processing your payment&hellip;</p>
  <noscript>
    <p><button form="simulated-pay" type="submit">Continue</button></p>
  </noscript>
  <form id="simulated-pay" method="POST" action="${url.pathname}${url.search}"></form>
  <script>document.getElementById("simulated-pay").submit();</script>
</main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
