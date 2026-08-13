# Payments Architecture

WorkersArena supports **six payment methods** through a modular gateway abstraction, so adding a provider is a single-file change.

## Supported methods

| Method | Provider | Use case |
|---|---|---|
| Card / Apple Pay / Google Pay | Stripe | Global default |
| PayPal | PayPal REST | International & freelancers |
| Mada / KNET / Visa local | MyFatoorah | Saudi Arabia & GCC |
| Cards / Apple Pay | Tap Payments | MENA focus |
| Bank transfer | Manual | Enterprise & invoices |
| Cash collection | Manual | Cash-on-service (COD) |

## Design

```
src/lib/payments/
  types.ts          # PaymentProvider interface + shared types
  registry.ts       # provider lookup by PaymentMethod
  stripe.ts         # createCheckout, verifyWebhook, refund
  paypal.ts
  myfatoorah.ts
  tap.ts
  bank-transfer.ts  # manual: generates IBAN details + invoice
  cash.ts           # marks payment as pending-collection
```

```ts
interface PaymentProvider {
  readonly method: PaymentMethod;
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  verifyWebhook(headers: Headers, body: string): Promise<VerifyResult>;
  refund(paymentRef: string, amountMinor?: number): Promise<void>;
}
```

## Flow

1. Worker/company selects a plan or campaign → server action creates `Payment(status: PENDING)` + `CheckoutRequest`.
2. `registry.get(method).createCheckout(...)` → provider redirect URL or local instructions (bank/cash).
3. Provider webhook → `verifyWebhook` → idempotent `Payment.status = PAID`, `paidAt`.
4. For subscriptions: activate `Subscription` (set `expiresAt`), recompute worker visibility.
5. `Invoice` auto-generated (number `WA-YYYY-NNNNN`, PDF via Cloudinary storage).

## Currency & amounts

- All amounts are **integer minor units** (e.g., 11900 = $119.00).
- Prices shown per city currency (`SAR/AED/EGP/JOD/MAD`) on worker profiles; subscriptions bill in USD.
- MyFatoorah/Tap require Arabic `displayName` + local currency params — handled inside their provider modules.

## Booking deposits (M3)

The booking seam (docs/booking-scheduling.md §7) uses the same `PaymentProvider`:

1. **Accept-with-deposit** → `Payment(PENDING, amount=deposit)` created inside the booking `$transaction`, linked by `booking.paymentId` (migration `20260810123344_m3_payment_checkout` made `Payment.userId` nullable for guest customers).
2. **Checkout** → `createBookingCheckout` → `registry.getProvider()` → `createCheckout` → customer redirected to the hosted URL. Idempotent: the provider ref is claimed with a CAS (`updateMany WHERE providerRef IS NULL`) and the minted URL is stored in `metadata.checkoutUrl` — a re-click after abandoning the checkout (or a concurrent click) returns the SAME url, never a duplicate session.
3. **Webhook** → `POST /api/payments/webhook` → `verifyWebhook` → `confirmBookingPayment` CAS-flips booking `PENDING_PAYMENT → CONFIRMED` + payment `PENDING → PAID` in one tx (idempotent — provider redelivery no-ops), notifies the customer (`bookingPaid`).
4. **Cancel refund (M4 policy window)** → `prismaCancelBooking` refunds a PAID deposit via `provider.refund()` after the tx (payment → `REFUNDED`, `refundRef` + `refundedAt` stored) — but only when the policy allows: `bookingCancelRefundDue()` (shared with the demo adapter) refunds a **worker cancel more than `BOOKING_CANCEL_REFUND_WINDOW_MS` (24h, configurable) before `startAt`**; a worker cancel within the window **keeps the deposit** (payment stays `PAID`, the slot couldn't be re-sold in time). Customer and system cancels always refund.
5. **Invoice (signed-in customers)** → `prismaConfirmBookingPayment` mints an `Invoice` row in the same tx as the PAID flip — number `WA-YYYY-NNNNN` (`formatInvoiceNumber`: year + zero-padded 5-digit sequence restarting per year, P2002-collision retry), linked to the payment, amount in minor units, `status: PAID`. Only when `Booking.customerId` is set (the `/bookings` receipt for accounts); guest phone-keyed bookings get none. `toDomainBooking` maps it onto `Booking.invoice` (demo adapter mints an equivalent receipt in memory) so the customer page renders it in both modes.

**Keyless mode:** when `STRIPE_SECRET_KEY` is unset the registry returns the **simulated provider** — `createCheckout` mints a signed local URL (`/api/payments/simulate`) that completes the payment instantly, so the full flow runs in dev/tests without credentials. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (and `APP_URL` for absolute redirects) for real charges.

## Ad-campaign purchases (self-serve ads)

The same `PaymentProvider` gates ad campaigns, so a campaign only goes live once paid (see docs/BUSINESS-MODEL.md → the ads stream). The webhook resolves which entity a checkout belongs to from the provider metadata — `campaignId` confirms an ad purchase, `bookingId` a booking deposit.

1. **Create** → `createCampaignAction` → `createCampaign` mints a **PENDING** campaign (+ a primary `Advertisement` carrying placement/adType in real mode) + a `Payment(PENDING, amount = budget × 100 minor)`, then immediately mints the hosted checkout. In real mode `prismaCreateCampaign` persists an `AdCampaign` + the creative + the payment (keyed by `advertisementId` → campaign) and resolves the `Company` row from the acting user (`input.companyId = session.id`, seeded for `ads@buildco.sa`); the demo adapter additionally mints a PENDING advertising `INV-*` invoice at create-time (a documented parity divergence — see the invoice note below). The company is redirected there; `getActiveAdsFor` only serves **ACTIVE** campaigns, so a PENDING one never runs.
2. **Pay now** → a PENDING campaign row on `/company` offers a **Pay now** button → `payCampaignAction` → `createCampaignCheckout` (idempotent — a re-click returns the already-minted URL, same as booking deposits).
3. **Webhook** → `POST /api/payments/webhook` / `GET /api/payments/simulate` → `verifyWebhook` resolves `campaignId` → `confirmCampaignPayment` flips campaign `PENDING → ACTIVE` + payment `PENDING → PAID` and notifies the company (`campaign` — "Campaign is live"). Idempotent — a provider redelivery no-ops without re-notifying. **Invoice note:** the demo adapter flips its create-time `INV-*` invoice to paid; the prisma adapter instead mints the purchase's `PAID` invoice at confirm-time (number `WA-YYYY-NNNNN`, same sequence + P2002 retry as booking receipts, owner = the company's user row, linked to the payment) — this minted row is exactly what the admin credit-note flip voids on refund, so a production refund always has an invoice to void.

4. **Admin refund** → the `/admin` campaign-payments card lists every purchase with its payment state (paid/pending/refunded/cancelled/failed) and a **Refund** control on PAID rows that prompts for a **reason** (required — `refundCampaignAction` refuses a reason-less refund) → `refundCampaignPayment` calls `provider.refund()` (payment → `REFUNDED`, `refundedAt` + `refundReason` stored), ends the campaign (it stops serving), and audits the refund to the activity feed (`CAMPAIGN_REFUNDED`, type `payment`) with the reason riding the entry text. The same reason shows as a tooltip on the table's refunded badge, so the feed and the card tell one story. The **company is notified** (`campaignRefunded` — inbox + email) with the refunded amount and reason, mirroring the bookingRefund email pattern: the payload's `campaignRefund` context renders a refund card (campaign name, `$X.XX`, reason) and deep-links `/company`. A **Preview email** button on refunded rows of the payments table shows exactly what the company received — rendered server-side from the same shared `campaignRefundNotification` builder the adapters dispatch (the never-drift pattern of the booking dispute view). The refund also issues a **credit note**: the campaign's paid advertising invoice flips to `refunded` (demo store) / `VOID` (prisma `InvoiceStatus` — inside the refund tx) so the company invoices list shows the refunded amount instead of a stale "paid" row. Idempotent — a second refund no-ops (and does not re-notify).

Campaign **reads, the purchase path and the admin refund are all Prisma-backed in real mode**: `getCampaigns` → `prismaGetCampaigns` (AdCampaign rows + their ads, minor→major budget/spent), `createCampaign` / `createCampaignCheckout` / `confirmCampaignPayment` → `prismaCreateCampaign` / `prismaCreateCampaignCheckout` / `prismaConfirmCampaignPayment` (PENDING AdCampaign + primary creative + PENDING Payment → CAS checkout mint → ACTIVE + PAID + the purchase's PAID Invoice + "Campaign is live" notification), `getCampaignPayment` → `prismaGetCampaignPayment` (Payment row keyed by `advertisementId` → campaign), and `refundCampaignPayment` → `prismaRefundCampaignPayment` — the campaign flips ENDED inside `$transaction`, the provider charge refunds after it, the payment flips REFUNDED (`refundRef` + `refundedAt` + `metadata.refundReason`), the refund is audited (`CAMPAIGN_REFUNDED`), and the company receives the SAME `campaignRefunded` payload the demo dispatches. Provider-failure divergence (documented, not a bug): on a refund failure the prisma adapter returns `null` with the campaign already ENDED (and any PAID invoice already VOID) and the payment still PAID — retryable, and the retry skips the flips since they're conditional — while the demo adapter throws before touching the invoice (only a landed refund voids it); both match the booking-cancel convention. Ad **rotation** (`getActiveAdsFor`) and the `/company` **invoices list** (`getInvoices`) stay demo-store until their wave lands (a real-mode purchase is persisted but its serving/listing seam is still the demo store). The seed now creates the `Company` row for `ads@buildco.sa` so real-mode self-serve works with the seeded company account. Under `NODE_ENV=production` with no Stripe keys the registry refuses the simulated provider, so the purchase path is dev/demo-only until live payment keys are configured.

## Refunds & disputes

- `refund()` delegates to the provider; a `Refunded` payment logs to `ActivityLog`.
- Admin can void invoices (`InvoiceStatus.VOID`).

## Recurring

- Stripe subscriptions & PayPal billing agreements support native auto-renew.
- MyFatoorah/Tap are one-off: the cron job re-charges via the stored token (card-on-file) at `expiresAt`.
