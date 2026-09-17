# Payments Architecture

[← Back to docs index](README.md)

WorkersArena supports **eight payment methods** through a modular gateway abstraction, so adding a provider is a single-file change. The Lebanon launch uses **OMT and Whish Money** as the live payment rails — no gateway keys required.

## Supported methods

| Method | Provider | Use case | Status |
|---|---|---|---|
| Card / Apple Pay / Google Pay | Stripe | Global default | 🔜 Planned |
| PayPal | PayPal REST | International & freelancers | 🔜 Planned |
| Mada / KNET / Visa local | MyFatoorah | Saudi Arabia & GCC | 🔜 Planned |
| Cards / Apple Pay | Tap Payments | MENA focus | 🔜 Planned |
| Bank transfer | Manual | Enterprise & invoices | ✅ Available |
| Cash collection | Manual | Cash-on-service (COD) | ✅ Available |
| **OMT** (agent / OMT Intra / OMT Pay) | Manual | **Lebanon launch** — offline cash + local transfers | ✅ Live |
| **Whish Money** (app + dual-currency Visa) | Manual | **Lebanon launch** — offline cash + wallet transfers | ✅ Live |

**Lebanon is a first-class service country** (Beirut in the CITIES catalog, USD as the tenant currency) and the OMT / Whish methods are **manual** — no gateway keys, no webhook: the customer pays an OMT agent / Whish app with the generated reference, then an **admin confirms receipt** from the `/admin` pending-payments card (the manual twin of a provider webhook). Every revenue flow accepts them: booking deposits, campaign purchases, subscription renewals, credit purchases, and the paid upgrades.

## Design

```
src/lib/payments/
  types.ts          # PaymentProvider interface + shared types
  registry.ts       # provider lookup by PaymentMethod
  stripe.ts         # createCheckout, verifyWebhook, refund (planned)
  paypal.ts         # planned
  myfatoorah.ts     # planned
  tap.ts            # planned
  bank-transfer.ts  # manual: generates IBAN details + invoice
  cash.ts           # marks payment as pending-collection
  omt.ts            # Lebanon launch: OMT agent/OMT Pay instructions
  whish.ts          # Lebanon launch: Whish app instructions
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

1. Worker/company selects a plan, campaign, or credit package → server action creates `Payment(status: PENDING)` + `CheckoutRequest`.
2. `registry.get(method).createCheckout(...)` → provider redirect URL or local instructions (OMT/Whish/bank/cash).
3. For OMT/Whish: customer pays offline with the reference → admin confirms receipt from `/admin`.
4. For Stripe/webhook providers: provider webhook → `verifyWebhook` → idempotent `Payment.status = PAID`, `paidAt`.
5. For subscriptions: activate `Subscription` (set `expiresAt`), recompute worker visibility.
6. `Invoice` auto-generated (number `WA-YYYY-NNNNN`, PDF via Cloudinary storage).

## Currency & amounts

- All amounts are **integer minor units** (e.g., 1500 = $15.00).
- Prices render in the tenant currency (`USD` for tenant lb) across worker profiles, bookings, receipts and subscriptions — one `formatPrice` in `src/lib/currency.ts`.
- MyFatoorah/Tap require Arabic `displayName` + local currency params — handled inside their provider modules.

## Lebanon launch — OMT & Whish (manual, no Stripe)

`docs/BUSINESS-MODEL.md` §5.1's "revenue first, no Stripe" levers are implemented on the OMT/Whish manual rails:

- **Providers** — `src/lib/payments/omt.ts` + `whish.ts` mint a **signed instructions URL** (`/payments/manual?provider=omt&paymentId=…&ref=OMT-…&amount=…&sig=…`). The signature is per-provider (distinct salt + `OMT-`/`WHISH-` reference prefixes); the instructions page verifies it through the provider's own `verifyWebhook` (the same contract the webhook route uses), so the URL is tamper-proof without a webhook endpoint.
- **Registry** — `getPaymentProvider("OMT"|"WHISH")` returns the manual providers directly; `STRIPE` still resolves to Stripe when keys are set, the simulated provider otherwise (refused in production).
- **Method threading** — `PaymentMethod` enum (+ migration `20260816090000_lebanon_omt_whish`) and the domain `BookingPayment.method`; `payBookingAction` / `payCampaignAction` / `renewSubscriptionAction` / `purchaseUpgradeAction` / `purchaseCreditAction` take a method and stamp it on the Payment row at mint time. Checkout minting is **idempotent per method**: a re-click with the same method returns the already-minted URL; a **method switch re-mints** with the new provider (a stale create-time STRIPE pre-mint never leaks a simulate URL to a Whish pay-now click).
- **Admin confirm** — `getPendingManualPayments` + `confirmManualPaymentAction` power the `/admin` pending-payments card and the dispute view's confirm button; `confirmPurchase` flips the purchased capability (below). A confirm is idempotent; non-admins get `unauthorized`.
- **Refunds route through the paying provider** — booking cancels, admin deposit refunds, and campaign refunds resolve `getPaymentProvider(payment.method)` instead of defaulting to STRIPE/simulated, so an OMT-paid deposit refunds via the OMT provider's `refund()`.
- **Instructions page** — `/payments/manual` (EN/AR) shows the provider's in-app / agent steps and the reference to pay with, localized per the page locale.

## Revenue flows (what accepts OMT/Whish)

### 1. Subscription renewals

| Plan | Monthly | Annual (9mo) | Leads/mo |
|------|---------|-------------|----------|
| **Starter** | $15 | $135 | 3 |
| **Growth** | $39 | $351 | 10 |
| **Pro** | $99 | $891 | 25 |
| **Business** | $199 | $1,791 | Unlimited |

- **Category-adjusted pricing**: low-value trades (cleaning, gardening) pay 0.5×, high-value trades (HVAC, mechanic) pay 1.5×
- **30-day free trial**: first month free on any plan (auto-applied at onboarding)
- **Annual billing**: pay for 9 months, get 12 (25% discount)
- **Admin-editable**: all prices, quotas, and features configurable via `/admin/revenue-settings`

**Flow:**
1. Worker clicks "Renew" on dashboard → selects plan + period (monthly/annual) + payment method (OMT/Whish)
2. `renewSubscriptionAction` → `createPurchaseCheckout` → signed `/payments/manual` instructions page
3. Worker pays at OMT agent / Whish app with the reference
4. Admin confirms receipt from `/admin` pending-payments card
5. `confirmPurchase` → subscription activated, invoice minted, worker visible in search

### 2. Credit purchases (lead marketplace)

Workers buy platform credits to purchase qualified leads.

| Package | Credits | Price | Bonus | Total |
|---------|---------|-------|-------|-------|
| Starter | 10 | $25 | 0 | 10 |
| Popular | 25 | $50 | 5 | 30 |
| Professional | 50 | $90 | 15 | 65 |
| Enterprise | 100 | $150 | 30 | 130 |

**Flow:**
1. Worker clicks "Buy More" on credit balance card → selects package + payment method (OMT/Whish)
2. `purchaseCreditAction` → `createPurchaseCheckout` → signed `/payments/manual` instructions page
3. Worker pays at OMT agent / Whish app with the reference
4. Admin confirms receipt from `/admin` pending-payments card
5. `confirmPurchase` → credits granted to worker's ledger balance, notification sent

**Credit ledger:**
- Append-only `WorkerCreditEntry` model (migration `20260914120000_worker_credit_ledger`)
- Balance always derived from entries, never stored
- 1 credit = $1 by convention
- Admin can adjust balances manually

### 3. Lead marketplace purchases

Workers spend credits to buy qualified leads (customer requests).

| Grade | Price | Trigger |
|-------|-------|---------|
| **Bronze** | 5 credits ($5) | Basic info, no email |
| **Silver** | 9 credits ($9) | Email + category + location |
| **Gold** | 20 credits ($20) | Full profile + photos + signed in |
| **Emergency** | 35 credits ($35) | 24/7 urgent request |

**Flow:**
1. Worker sees lead offer on `/dashboard/leads` → clicks "Unlock for N credits"
2. `purchaseLeadOffer` → debit credit ledger (idempotent by offerId)
3. Contact details revealed per policy (masked → revealed based on plan tier)
4. Worker quotes customer directly through normal booking flow
5. On job completion: lead rebate applied (lead cost credited back against platform fee)

**Smart pricing:** lead prices are dynamically adjusted by `smart-pricing.ts`:
- Rush hour (6–9 AM, 5–8 PM): +15%
- Weekend (Sat–Sun): +10–20%
- Seasonal (AC summer +25%, plumbing winter +15%)
- Holidays (Ramadan, Eid, Christmas): +30–35%
- Supply/demand ratio: 0.7×–2.0×

### 4. Paid verification

| Tier | Price | What's included |
|------|-------|----------------|
| **Basic** | $9 | ID check only |
| **Professional** | $19 | License + background check |

- 12-month validity
- Badge in search results
- Purchasable via OMT/Whish → admin confirm → `verified` flag flipped

### 5. Featured slot & emergency marker

| Add-on | Price | What's included |
|--------|-------|----------------|
| **Featured slot** | $49/category/mo | Homepage featured placement |
| **Emergency marker** | $9/mo | 24/7 urgent job availability |

- Purchasable via OMT/Whish → admin confirm → flag flipped

### 6. Referral credits

- **Referrer bonus**: 25 credits per successful referral
- **Invitee bonus**: 10 credits on signup
- **Monthly cap**: 10 referrals/month
- **Qualifying action**: invitee completes first booking
- Credits granted automatically on qualifying action (no payment required)
- Configurable via `FeeRuleSet.referral` (admin-editable)

### 7. Company advertising

Campaigns are purchased via OMT/Whish and go live only after admin confirmation.

**Flow:**
1. Company creates campaign → PENDING + payment minted
2. "Pay now" → OMT/Whish instructions page
3. Company pays at OMT agent / Whish app with the reference
4. Admin confirms receipt → campaign flips ACTIVE, creative starts serving
5. Spend accrues against budget (impressions + clicks tracked)

**Refunds:** admin refund → campaign ENDED, payment REFUNDED, invoice VOID (credit note), company notified with reason.

### 8. Booking deposits

The booking seam uses the same `PaymentProvider`:

1. **Accept-with-deposit** → `Payment(PENDING, amount=deposit)` created inside the booking `$transaction`
2. **Checkout** → `createBookingCheckout` → `registry.getProvider()` → `createCheckout` → customer redirected to the hosted URL (OMT/Whish instructions)
3. **Admin confirm** (OMT/Whish) → `confirmBookingPayment` CAS-flips booking `PENDING_PAYMENT → CONFIRMED` + payment `PENDING → PAID`
4. **Cancel refund (M4 policy window)** → `prismaCancelBooking` refunds a PAID deposit via `provider.refund()` — worker cancel within 24h of start keeps the deposit; customer and system cancels always refund
5. **Invoice (signed-in customers)** → `prismaConfirmBookingPayment` mints an `Invoice` row (`WA-YYYY-NNNNN`)

## Keyless mode

When `STRIPE_SECRET_KEY` is unset the registry returns the **simulated provider** — `createCheckout` mints a signed local URL (`/api/payments/simulate`) that completes the payment instantly, so the full flow runs in dev/tests without credentials. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (and `APP_URL` for absolute redirects) for real charges.

Under `NODE_ENV=production` with no Stripe keys the registry refuses the simulated provider, so the purchase path is dev/demo-only until live payment keys are configured.

## Admin confirmation queue

All OMT/Whish payments appear in the `/admin` pending-payments card:

| Field | Description |
|-------|-------------|
| **ID** | Payment ID (e.g., `pay-pur-1`) |
| **Scope** | subscription / verification / featured / emergency / credit / booking / campaign |
| **Label** | Human-readable description (EN + AR) |
| **Amount** | Payment amount in USD |
| **Method** | OMT or Whish |
| **Reference** | Provider reference (e.g., `OMT-BK-1001-000`) |
| **Created** | When the payment was minted |
| **Action** | Confirm button (admin-only) |

**Confirm flow:**
1. Admin reviews the pending payment details
2. Worker/company confirms they paid (shows reference at OMT agent / Whish app)
3. Admin clicks "Confirm" → `confirmManualPaymentAction`
4. Payment flips PAID, capability activates (subscription/credits/verification/etc.)
5. Worker/company notified

## Platform fee (take rate)

The fee engine stamps an **immutable snapshot** at accept-with-quote:

| Plan Tier | Rate | Min | Max |
|-----------|------|-----|-----|
| Free | 12% | $5 | $300 |
| Starter | 9% | $5 | $300 |
| Growth | 7% | $5 | $300 |
| Pro | 5% | $5 | $300 |
| Business | 4% (or exempt) | $5 | $300 |

- Applied at **accept-with-quote** (immutable snapshot)
- Collected at **booking completion**
- Admin can set per-category, per-promotion overrides
- Fee snapshot is auditable (`PlatformFeeSnapshot` model)

## Lead rebates

When a bought lead converts to a completed job:

```
rebate = min(fee × pctBps/10000, lead cost, ceiling)
```

- Default: 100% of fee share, no ceiling
- Recorded in `LeadRebate` model (append-only)
- Shown on worker booking row and lead board
- Admin-configurable (on/off, share, ceiling)

**Example:**
- 7% of $300 = $21 fee
- Gold lead cost $20
- Rebate $20 → platform keeps $1, worker nets $299

## Refunds & disputes

- `refund()` delegates to the provider; a `Refunded` payment logs to `ActivityLog`.
- Admin can void invoices (`InvoiceStatus.VOID`).
- Booking deposits: refund via the paying provider (OMT → OMT refund, Whish → Whish refund).
- Campaign purchases: refund → campaign ENDED, invoice VOID (credit note).
- Paid upgrades: admin can claw back credits with an adjustment row.

## Recurring

- Stripe subscriptions & PayPal billing agreements support native auto-renew (planned).
- MyFatoorah/Tap are one-off: the cron job re-charges via the stored token (card-on-file) at `expiresAt` (planned).
- OMT/Whish: manual renewals via the same admin-confirm flow.

## Files

| File | Role |
|------|------|
| `src/lib/payments/types.ts` | `PaymentProvider` interface + shared types |
| `src/lib/payments/registry.ts` | Provider lookup by `PaymentMethod` |
| `src/lib/payments/omt.ts` | OMT manual provider (signed instructions) |
| `src/lib/payments/whish.ts` | Whish manual provider (signed instructions) |
| `src/lib/payments/stripe.ts` | Stripe provider (planned) |
| `src/lib/payments/bank-transfer.ts` | Bank transfer manual provider |
| `src/lib/payments/cash.ts` | Cash-on-service provider |
| `src/app/api/payments/webhook/route.ts` | Stripe/webhook endpoint |
| `src/app/api/payments/simulate/route.ts` | Simulated provider endpoint |
| `src/app/payments/manual/page.tsx` | OMT/Whish instructions page |
| `src/app/actions/purchases.ts` | Purchase server actions |
| `src/app/actions/credits.ts` | Credit purchase server actions |
| `src/lib/data/purchases.ts` | Purchase engine (demo adapter) |
| `src/lib/data/credit-purchases.ts` | Credit purchase engine |
| `src/lib/data/credit-ledger.ts` | Platform credit ledger |
| `src/lib/data/credit-ledger-prisma.ts` | Prisma adapter for credits |

---

*Last updated: September 17, 2026*
*Version: 3.0.0*
*Live payment methods: OMT, Whish (manual, admin-confirmed)*
*Planned: Stripe, PayPal, MyFatoorah, Tap*
