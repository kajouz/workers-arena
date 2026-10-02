# Payments Architecture

[← Back to docs index](README.md)

> **Phase 1 boundary:** payment automation is intentionally deferred. Subscriptions, lead-credit top-ups, verification, advertising, and booking deposits continue through the existing OMT/Whish manual confirmation flow. Lead-quality refunds return platform credits after admin review; they are not automatic cash refunds. Stripe/card automation remains a later phase.
>
> **Workflow v2 (2026-10-02):** the manual flow is now evidence-based and time-boxed — every confirmation records the amount received and the OMT/Whish transaction number, large or receipt-less amounts need a second admin, short / over / late payments have defined outcomes, refunds are tracked until the money leaves, unpaid deposits lapse and release their slot, job balances are chased automatically. See [§Workflow v2](#workflow-v2--controlled-manual-payments) below and [PAYMENT-COMMS-ACCOUNTING-PLAN.md](PAYMENT-COMMS-ACCOUNTING-PLAN.md).

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

**Lebanon is a first-class service country** (Beirut in the CITIES catalog, USD as the tenant currency) and the OMT / Whish methods are **manual** — no gateway keys, no webhook: the customer pays an OMT agent / Whish app with the generated reference, then an **admin confirms receipt** from the `/admin` pending-payments card (the manual twin of a provider webhook). Every revenue flow accepts them: booking deposits, **job settlements (the balance collected after the work is done)**, campaign purchases, subscription renewals, credit purchases, and the paid upgrades.

### Two legs per booking, and why

A booking can be paid twice, and that is deliberate: the **deposit** before the job (optional, set by the worker's quote) and the **settlement** after it — the outstanding balance (`docs/booking-take-rate.md` §6). The platform only ever pays a worker out of money it actually holds, so a job whose deposit did not cover its quote is settled through the same manual rails: the customer gets a new reference, an admin confirms receipt, and **that confirmation is what releases the worker's payout** (`confirmBookingSettlement`).

Both legs land in the same `/admin` pending-payments card, each labelled by `leg` (`deposit` | `settlement`) and by the booking (`BK-… — job balance` for the second one), so an operator can never confirm the wrong amount for the right booking. A job settled in cash between the parties is declared instead (`markBookingSettledOutsideAction`, worker or admin): no payout is credited, and the platform fee becomes a claim rather than an accrual.

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
| **Pro** | $59 | $531 | 25 |
| **Business** | $199 | $1,791 | 60 |

- **Monthly lead credits**: the leads/mo column is paid as credits once a month (leads × bronze price; unused allowance expires at the next grant) — `src/lib/data/lead-allowance.ts`
- **Category-adjusted pricing**: low-value trades (cleaning, gardening) pay 0.5×, high-value trades (HVAC, mechanic) pay 1.5×
- **Plan-specific free trial**: Starter/Growth 30 days, Pro 14 days, and Business assisted by default (auto-applied at onboarding)
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
| Starter | 10 | $10 | 0 | 10 |
| Popular | 25 | $25 | 5 | 30 |
| Professional | 50 | $50 | 15 | 65 |
| Enterprise | 100 | $100 | 30 | 130 |

**Flow:**
1. Worker clicks "Buy More" on credit balance card → selects package + payment method (OMT/Whish)
2. `purchaseCreditAction` → `createPurchaseCheckout` → signed `/payments/manual` instructions page
3. Worker pays at OMT agent / Whish app with the reference
4. Admin confirms receipt from `/admin` pending-payments card
5. `confirmPurchase` → credits granted to worker's ledger balance, notification sent

**Prepaid wallet (Step 2 of the revenue plan):** one balance in two pots. Each ledger row carries a `fund` (migration `20260928120000_credit_funds`):

| Pot | Filled by | Pays for |
|---|---|---|
| **paid** (the wallet) | top-ups: the pack's base credits | anything on the platform (plans, badges, leads, commission) |
| **free** | monthly lead allowance, promotions, referrals, pack bonuses | leads only |

Lead purchases spend free credits first, then paid; the allowance expiry only ever removes free credits. A top-up is granted on confirm by `topUpGrantsFor` (paid base + free bonus, keyed `topup:<paymentId>` / `topup-bonus:<paymentId>`, so a re-confirm never grants twice). **Wallet money is platform credit — it cannot be withdrawn or refunded as cash**, and the top-up card says so. Before this change the credit checkout had no price for a pack, so no top-up could be minted.

**Paying from the wallet** (`src/lib/data/wallet-payments.ts`): renewals, verification, the featured slot and the emergency marker can be paid in-app with method `WALLET` (migration `20260928130000_wallet_payment_method`). The charge is the checkout price rounded **down** to whole dollars, debited from the paid pot only, then confirmed through the same `confirmPurchase` an admin runs for OMT/Whish, so the capability and invoice activate at once. A WALLET payment is not new cash (the top-up was), so the manual queue and reconciliation never list it. A charge whose purchase fails to activate is refunded; a wallet renewal cancels any unpaid OMT/Whish renewal for the same worker.

**Auto-renew and commission** (`GET /api/cron/wallet`, daily 06:30 UTC): first, outstanding commission on cash-settled jobs is collected from the paid pot, rounded down to whole dollars so a worker is never charged more than the claim (it is also collected the moment a job is marked paid in cash); then plans ending within a day, or up to three days ago, renew from the wallet at the same plan and period unless the worker switched auto-renew off (`Subscription.autoRenew`, on by default). Each charge is keyed in the ledger, so re-runs never charge twice.

**"Card" renewal:** the renew dialog's Card option renewed a plan on the spot without charging anything. It is now offered and accepted only in demo mode; real mode refuses it.

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

All OMT/Whish payments appear in the `/admin` pending-payments card while pending, and the revenue dashboard reconciliation export retains the full manual-payment history (paid, refunded, cancelled, and pending):

| Field | Description |
|-------|-------------|
| **ID** | Payment ID (e.g., `pay-pur-1`) |
| **Scope** | subscription / verification / featured / emergency / credit / booking / campaign |
| **Label** | Human-readable description (EN + AR) |
| **Amount** | Payment amount in USD |
| **Method** | OMT or Whish |
| **Reference** | Provider reference (e.g., `OMT-BK-1001-000`) |
| **Created** | When the payment was minted |
| **Status** | pending / paid / refunded / cancelled / failed |
| **Paid/refunded** | Settlement timestamps and invoice number when available |
| **Action** | Confirm button (admin-only) for pending rows |

**Confirm flow (workflow v2 — evidence required):**
1. The payer pays at an OMT agent / in the Whish app with the reference, and uploads a photo of the receipt on the instructions page
2. Admin opens the payment's confirm dialog, checks the OMT/Whish statement, and enters the **amount received** and the **transaction number** → `confirmManualPaymentAction(paymentId, { amount, txnId, note })`
3. The engine decides: covered → the payment flips PAID and the capability activates (subscription/credits/verification/etc.), the receipt is frozen; short → stays pending with the remainder shown to the payer; at/above the four-eyes threshold or without a receipt → waits for a **different** admin; reference already closed → unmatched queue
4. Worker/company/customer notified
A confirm with no evidence is refused (`evidence-required`). Every credit-pack top-up is in the queue too (it was filtered out before — D2).

**Receipt photos and the 2-hour target (Step 3):** the instructions page lets the payer attach a photo of their OMT/Whish receipt (`uploadPaymentReceiptAction`). The browser shrinks it; the server accepts JPEG/PNG/WebP up to 600 KB whose bytes match the type, and stores it per payment reference in `PaymentReceipt` (migration `20260928140000_payment_receipts`). Authorization is the signed link itself, re-verified by the action, so a guest with no account can send one too. The `/admin` card lists payments **oldest first**, shows how long each has waited (amber past 1h, red past the 2-hour target, with an "over 2 hours" count), marks rows with a receipt, and shows the photo in the confirm dialog (`GET /api/admin/payments/receipt?ref=…`, admin only).

**Signed link hardening:** the `ref` on a manual link was not covered by the HMAC, so a genuine link could be shown with another payment's reference. `verifyManualBody` now also requires the reference derived from the signed fields (`manualReference`), and the link's provider must match the reference prefix. Links already issued stay valid.

**Reconciliation:** `GET /api/admin/revenue/reconciliation` returns JSON for the admin ledger; append `?format=csv` for an accounting export. The export is read-only and includes payment status, provider reference, paid/refunded timestamps, and the linked invoice number. The reminder cron also cancels unpaid subscription renewal payments older than seven days and records a `cancelled` subscription lifecycle event; workers can still cancel their own pending renewal immediately from the dashboard. Since workflow v2 the 15-minute `requests` cron lapses every unpaid upgrade / credit / renewal reference earlier, after `PAYMENT_PURCHASE_HOLD_HOURS` (72h), unless a receipt was uploaded or money was recorded against it.

## Workflow v2 — controlled manual payments

Source: `src/lib/data/payment-workflow.ts` (pure rules), `payment-workflow-store.ts` (persistence), `payment-workflow-engine.ts` (orchestration over the repo seams — both adapters), actions in `src/app/actions/business.ts` and `bookings.ts`. Migrations `20261002100000_payment_integrity` and `20261002110000_payment_workflow_v2`. Tests: `tests/payment-workflow.test.ts`, `tests/payment-workflow-engine.test.ts`, `tests/payment-hardening.test.ts`, and the live-Postgres `scripts/smoke-payment-workflow.ts` (part of `npm run db:smoke`).

### Money mode (D3)
The data layer serves demo data unless `DEMO_MODE=false` **and** `DATABASE_URL` is set. `src/lib/payments/money-mode.ts` refuses to move money (checkout minting and confirmations return null, logged once) when the configuration is incoherent: `DEMO_MODE` unset in production, `DEMO_MODE=false` without a database, or `PAYMENTS_LIVE=true` with demo data. The public showcase (`DEMO_MODE=true`) keeps working, and its `/payments/manual` page shows a **"do not send real money"** banner. Set `PAYMENTS_LIVE=true` on a deployment that takes real money.

### Confirming — evidence, tranches and four-eyes
Each amount finance records is a **tranche** (`PaymentTranche`): amount, OMT/Whish transaction number (normalised, **unique across all tranches and refunds** — one receipt can never confirm two payments), whether a receipt photo existed, who entered it, who approved it.
- A tranche needs a **second, different admin** (`approveManualTrancheAction`) when the payment is at/above `PAYMENT_FOUR_EYES_MINOR` (default 20000 = $200) or there is no receipt photo. The recording admin cannot approve their own entry. `rejectManualTrancheAction` rejects one that is not on the statement.
- The payment activates only when **approved** tranches cover it: short → stays pending (the instructions page shows "already received X of Y" and the remainder); exact → confirmed; over → confirmed, the excess booked as a **refund due**.
- Money recorded against a reference that is no longer pending (expired, cancelled, already paid) becomes an **unmatched** tranche; finance resolves it by booking a refund (`resolveUnmatchedPaymentAction`). Money is never silently lost.
- On confirm the receipt is **locked** (`PaymentReceipt.lockedAt`): re-uploads are refused, so the evidence finance approved cannot be swapped. Uploads are also refused once the payment is closed, and rate-limited (10/reference/hour, 30/client/hour).
- The OMT/Whish deposit and balance can no longer be confirmed through the evidence-free admin doors (`confirmPaymentAction`, `confirmBookingSettlementAction` return `evidence-required` for manual methods; they remain for card/simulated reconciliation).

### Refunds — due → sent
A cancellation or deposit refund on an OMT/Whish payment (and an overpayment's excess, and a resolved unmatched receipt) books the refund as **due** (`Payment.refundState = "due"`, `refundAmount`). The `/admin` finance card lists them; finance closes each one with the transfer number of the OMT/Whish payment that returned the money (`markRefundSentAction` → `refundState = "sent"`, `refundTxnId` unique). Card refunds are executed by the provider and need no queue.

### Deadlines and expiry
- A booking deposit must be paid within `PAYMENT_DEPOSIT_HOLD_HOURS` (24h) of the accept and never later than `PAYMENT_DEPOSIT_BEFORE_START_HOURS` (2h) before the job. The 15-minute `requests` cron (`runPaymentExpirySweep`) cancels a lapsed booking (`cancelledBy: system`, reason "Deposit not paid in time"), releasing the slot, and reminds the payer once at half-time. The deadline shows on the customer's booking row and the instructions page.
- Unpaid upgrade / credit / renewal references lapse after `PAYMENT_PURCHASE_HOLD_HOURS` (72h). Campaign references are not lapsed (an unpaid campaign holds no inventory).
- A payer who uploaded a receipt, or whose money finance has started recording, is never lapsed by the clock.

### Balance collection and dunning
The hourly `completions` cron (`runSettlementDunning`) stamps `Booking.settlementDueAt` (48h after completion), **mints the balance reference automatically** on the deposit's rail (OMT by default) and notifies the customer, then runs the ladder once per stage (CAS on `Booking.dunningStage`): D+1 and D+3 reminders (the worker is told at D+3), D+7 admin follow-up, D+14 customer restricted, D+30 write-off review (`writeOffBalanceAction` → `settlementWrittenOffAt`).

### Payment reliability
`customerReliability` scores a customer (by account and phone): +1 per lapsed deposit, +3 per balance that reached D+7, +10 per write-off, −1 per fully paid job (floor 0). 0–2 normal; 3–9 **prepay** — the deposit at accept is forced to the whole quote; ≥10 **blocked** — new booking requests, instant bookings, recurring requests and quote requests are refused (`payment-blocked`) and a worker cannot accept them. `BOOKING_MIN_DEPOSIT_BPS` (default 0 = off) sets a platform-wide minimum deposit share for everyone.

### Cash settlement controls
- "We settled this directly" is refused while the customer's balance payment is in flight (receipt uploaded or money recorded) — it used to cancel a payment the customer had actually made.
- The customer is asked to confirm (`answerSettledOutsideAction`); a denial, or no answer within `SETTLED_OUTSIDE_CONFIRM_HOURS` (72h), puts the booking on the admin review list.
- An outside-platform fee claim still unpaid after `FEE_CLAIM_GRACE_DAYS` (14) blocks the worker's lead purchases and payout requests (`fee-claim-overdue`).

### Invoices
Every cash event now has a WA- invoice: deposits (guests included — `Invoice.userId` is nullable and the bill-to snapshot `billToName/Phone/Email` carries the identity), job balances, campaigns, and every OMT/Whish purchase (subscription, verification, featured, emergency, credit top-up). Numbers come from the atomic per-year `InvoiceCounter` (`src/lib/data/invoice-numbering.ts`), so concurrent confirms never collide (D4). The subscription confirm — payment flip, plan activation and invoice — is one transaction.

### Audit
`PaymentAuditEvent` is an append-only, **never-pruned** trail of every tranche, approval, rejection, confirmation, partial/over payment, expiry, reminder, refund, dunning stage, write-off and settled-directly answer. The activity-log prune also keeps money entries (`RETAINED_ACTIVITY_CODES`). Settlement-balance confirms are now audited with the acting admin.

### The `/admin` finance card
Renders when any queue is non-empty: amounts waiting for a second approval, unmatched receipts, refunds to send, overdue balances (with write-off at D+30) and settled-directly declarations to review.

### Environment
| Variable | Default | Meaning |
|---|---|---|
| `PAYMENTS_LIVE` | unset | Declares real money: requires `DEMO_MODE=false` + `DATABASE_URL`, and turns guest OTP on by default |
| `PAYMENT_FOUR_EYES_MINOR` | `20000` | Second-admin threshold in minor units (0 = only the no-receipt rule) |
| `PAYMENT_DEPOSIT_HOLD_HOURS` | `24` | Deposit hold after the accept |
| `PAYMENT_DEPOSIT_BEFORE_START_HOURS` | `2` | Latest deposit time before the job |
| `PAYMENT_PURCHASE_HOLD_HOURS` | `72` | Upgrade / credit / renewal reference hold |
| `BOOKING_MIN_DEPOSIT_BPS` | `0` | Minimum deposit share of the quote (3000 = 30%) |
| `FEE_CLAIM_GRACE_DAYS` | `14` | Unpaid cash-job fee claim age that blocks leads and payouts |
| `SETTLED_OUTSIDE_CONFIRM_HOURS` | `72` | Customer answer window for a settled-directly declaration |
| `GUEST_OTP_ENFORCED` | follows `PAYMENTS_LIVE` | `true`/`false` overrides |

## Platform fee (take rate)

The fee engine stamps an **immutable snapshot** at accept-with-quote:

| Plan Tier | Rate | Min | Max |
|-----------|------|-----|-----|
| Free | 12% | $5 | $300 |
| Starter | 9% | $5 | $300 |
| Growth | 7% | $5 | $300 |
| Pro | 5% | $5 | $300 |
| Business | 4% reduced | $5 | $300 |

- The table is the plan ladder (`FEE_LADDER_PRESET`): the shipped default rule set **is this ladder** (since 2026-09-28); an admin-published rule set in `/admin/revenue-settings` overrides it.
- Applied at **accept-with-quote** (immutable snapshot) — including a multi-candidate quote winner accepted without re-typing its bid
- Collected at **booking completion**
- Admin can set per-category, per-promotion overrides
- Fee snapshot is auditable (`PlatformFeeSnapshot` model)

## Lead rebates

When a bought lead converts to a completed job:

```
rebate = min(fee × pctBps/10000, lead cost, ceiling)
```

- Default: 50% of the fee (since 2026-09-28; was 100%), no ceiling
- Recorded in `LeadRebate` model (append-only)
- Shown on worker booking row and lead board
- Admin-configurable (on/off, share, ceiling)

**Example:**
- 7% of $300 = $21 fee (a Growth worker)
- Gold lead cost $20
- Rebate 50% of $21 = $10.50 → platform keeps $10.50, worker nets $289.50

## Refunds & disputes

- `refund()` delegates to the provider; a `Refunded` payment logs to `ActivityLog`.
- Admin can void invoices (`InvoiceStatus.VOID`).
- Booking deposits: refund via the paying provider (OMT → OMT refund, Whish → Whish refund). For OMT/Whish the provider call only records the decision — the refund is then **due** in the `/admin` finance card until finance records the transfer that returned the money (§Workflow v2 → Refunds).
- Campaign purchases: refund → campaign ENDED, invoice VOID (credit note).
- Paid upgrades: admin can claw back credits with an adjustment row.

## Recurring

- Stripe subscriptions & PayPal billing agreements support native auto-renew (planned).
- MyFatoorah/Tap are one-off: the cron job re-charges via the stored token (card-on-file) at `expiresAt` (planned).
- OMT/Whish: manual renewals via the same admin-confirm flow.

## WhatsApp lead notifications (admin-controlled)

Lead notifications are intentionally controlled by admins rather than sent automatically to every matched worker. From the admin lead-market panel, an admin can edit a separate WhatsApp template for each lead grade and language, then open a pre-filled `wa.me` link for the selected worker. The message includes the worker name, grade, lead number, match score, credit price, board link, and admin name.

- Templates are saved in the versioned lead-market rule set and are used by the send action; changing a template does not rewrite already-created offers.
- The board link uses `NEXT_PUBLIC_APP_URL`, so staging and production messages never point to a hardcoded deployment.
- Formatted Lebanese numbers are normalized before creating the link; a missing number is rejected rather than producing an unusable URL.
- Optional email/SMS dispatches use the same saved admin templates when those channels are selected.
- For automated delivery through Meta WhatsApp Cloud API, set `NOTIFY_WHATSAPP_ENABLED=true`, `NOTIFY_WHATSAPP_PROVIDER=whatsapp-cloud`, `WHATSAPP_TOKEN`, and `WHATSAPP_PHONE_NUMBER_ID`. The provider uses the Graph API directly and returns a logged failure when credentials or the recipient number are missing; payment automation is unrelated and remains deferred.

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

*Last updated: September 19, 2026*
*Version: 3.1.0*
*Live payment methods: OMT, Whish (manual, admin-confirmed)*
*Planned: Stripe, PayPal, MyFatoorah, Tap*
