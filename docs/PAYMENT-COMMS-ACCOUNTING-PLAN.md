# WorkersArena — Payment Workflow v2 (OMT/Whish), Communications (OpenWA) & Accounting (ERPNext) Plan

> **Authors' lens:** business strategy (marketplace monetisation, risk) + senior engineering review of the current code.
> **Inputs:** `SIMPLIFICATION-AND-RISK-PLAN.md`, the QA audit (2026-09-29), a read-only code study of `src/lib/payments`, `src/lib/data/prisma-repo.ts`, `booking-settlement.ts`, `src/lib/notifications`, `prisma/schema.prisma`, and a review of the OpenWA and ERPNext repositories (2026-10-02).
> **Status:** proposal for decision. Nothing here is implemented yet. Items marked **[verify]** could not be confirmed and must be checked before build.
> Date: 2026-10-02

---

## 0. Executive summary

1. **Keep OMT and Whish as the primary rails** — they fit the Lebanese market — but turn them from "admin clicks Confirm" into a **controlled, evidence-based, time-boxed workflow**: every reference expires, every confirmation records the amount actually received and the OMT/Whish transaction number, large amounts need a second approver, partial and late payments have defined outcomes, and refunds are tracked until money really leaves.
2. **Fix four defects the code study found before any new feature** (§1). Two of them silently lose money or block revenue today.
3. **Close every booking-payment risk** from the earlier analysis with explicit rules: deposit deadline, minimum deposit, automatic balance request + reminders, customer-confirmed cash settlement, enforced fee claims, and a payment-reliability score for customers (§3–§4).
4. **OpenWA: adopt only as a secondary channel, in a pilot.** It is free, popular and feature-rich, but it is an *unofficial* WhatsApp Web automation with a stated, non-zero risk of the number being banned. Money- and security-critical messages stay on the official WhatsApp Cloud API (already built) with SMS fallback (§5).
5. **ERPNext: adopt as the accounting back office (book of record), fed one-way by the platform.** The platform keeps running the marketplace (bookings, credits, worker ledger); ERPNext receives every invoice, payment, refund, payout and paid lead as accounting documents. Lebanon has no ready-made localisation in ERPNext, so the chart of accounts and taxes must be set up with your accountant (§6).
6. **Delivery:** about **10–12 weeks** with 2 developers + 1 part-time QA + 1 finance/ops owner, in five phases (§7).

---

## 1. Critical defects to fix first (from the code review)

| # | Defect (verified in code) | Business impact | Fix |
|---|---|---|---|
| **D1** | `WorkerLedgerEntry` has `@@unique([bookingId])` on **all** rows (`prisma/schema.prisma:1378`, migration `20260812082820_worker_ledger`), but the settlement balance is written as a second `ADJUSTMENT` row with the same `bookingId` (`prisma-repo.ts:1874–1890`). The unique-violation is caught *inside* the database transaction. | On any job with **deposit + balance**, the worker is never credited the balance (or the confirm rolls back). Workers see unpaid money → trust loss, cash bypass. | Replace with a partial unique index `UNIQUE (bookingId) WHERE kind = 'EARNING'` (raw SQL migration); add a live-DB smoke test: deposit → complete → pay balance → exactly one EARNING + one ADJUSTMENT. |
| **D2** | OMT/Whish **credit-pack** payments are filtered out of the admin pending queue (`prisma-repo.ts:6100` only allows subscription/verification/featured/emergency), and the dedicated confirm action is not wired to any screen. | Workers who pay for credits by OMT/Whish **can never be confirmed** in production → lost revenue + angry customers. | Include `credit` in the queue and route it to `confirmCreditPurchase`; add a test that every purchase scope appears in the queue. |
| **D3** | Demo mode is the default (`DEMO_MODE !== "false"`) and one file uses the opposite test (`manual.ts:21`). If production runs with demo on, confirmations land in memory and disappear. **[verify the deployed value]** | Payments "confirmed" but not stored. | Fail the boot if `NODE_ENV=production` and demo mode is on (unless an explicit `ALLOW_DEMO_PROD=true`); unify the check in one helper. |
| **D4** | Subscription confirm is **not transactional**: payment → PAID and plan activated, then the invoice number is computed with `count()+1` and no retry (`prisma-repo.ts:6332–6398`). | A number clash leaves an active plan with **no invoice, no lead allowance, no notification**. | Wrap in one transaction; move invoice numbering to a DB sequence/counter row for all invoice types. |

Other important findings that the plan below addresses:

- The OMT/Whish **instructions page never checks payment status** and links never expire — a cancelled or already-paid reference still says "pay this".
- **Receipt photos can be replaced after confirmation** (upsert by reference) and the upload has no rate limit → evidence can be overwritten.
- OMT/Whish **refunds are marked REFUNDED immediately** although no money has moved (`omt.ts:46` returns a string only).
- **Settlement confirmations have no admin audit entry**, and the activity log (the only audit trail) is **pruned after 90 days** including payment entries.
- **No invoices** for: settlement balances, guest deposits, credit packs, verification, featured, emergency, lead purchases. The `/admin/invoices` and `/admin/webhooks` pages are **mock data**.
- WhatsApp webhook signature check is **fail-open** when the secret is not set.
- Rate limiting falls back to per-instance memory and is applied in only 4 places.

---

## 2. Design principles for Payment Workflow v2

1. **Money first, value second.** No booking is confirmed, no capability (plan, credits, badge, campaign) is activated until the money is confirmed.
2. **Every reference has a deadline.** Unpaid references expire automatically; expiry frees what they were holding.
3. **Evidence on every confirmation:** amount received, OMT/Whish transaction number (unique across the system), receipt photo, who confirmed, when.
4. **Four-eyes above a threshold.** One person cannot both mark money received and approve a large refund or payout.
5. **Partial is a normal case, not an error.** Short, over, late and orphan payments each have a defined path.
6. **Nothing is "refunded" until money leaves.** Refunds have states.
7. **One audit trail, never pruned** for money events.
8. **Accounting gets a copy of everything** (ERPNext), automatically and idempotently.

---

## 3. Target workflow — step by step

### 3.1 The payment reference (applies to every revenue type)

| Field | Rule |
|---|---|
| Reference | `OMT-…` / `WHISH-…`, unique, printed large on the instructions page and sent by WhatsApp/SMS |
| Amount | Exact amount in USD (and LBP equivalent shown for information if the customer pays in LBP **[decide policy]**) |
| Expires at | Booking deposit: `min(accept + 24 h, job start − 2 h)`; instant booking: 2 h; balance: no cancel, dunning instead (§3.3); purchases/campaigns: 72 h |
| Status shown on page | Awaiting payment / Under review / Paid / Expired / Cancelled — the page reads the payment status, not just the signature |

### 3.2 Customer: deposit (or full payment) via OMT/Whish

1. Worker accepts with a quote. **System enforces a minimum deposit**: 100 % for fixed-price/instant jobs; ≥ 30–50 % for quoted jobs (configurable per category); 100 % for customers with a poor payment record (§3.7).
2. Customer clicks **Pay** → chooses OMT or Whish → instructions page + the same details sent by WhatsApp (official API) with a countdown to the deadline.
3. Customer pays at an OMT agent / in the Whish app, then on the same page enters **the OMT/Whish transaction number** and uploads the **receipt photo** (both required to move to "Under review"). Guests must pass phone OTP before paying (turn on `GUEST_OTP_ENFORCED` in production).
4. Reminder at 50 % of the time left; a second at T-2 h.
5. **Deadline passes with no receipt** → booking auto-cancelled (`by: system, reason: payment-timeout`), slot released, reference cancelled, worker notified. Expiry count added to the customer's reliability score.
6. **Receipt submitted** → status "Under review"; the deadline is frozen so the customer is not penalised for admin delay.

### 3.3 Customer: balance after the job

1. When the worker marks **Completed** with an outstanding balance, the system **creates the balance reference automatically** (today the customer must click to create it).
2. Customer receives it by WhatsApp/in-app with a 48 h due date.
3. **Dunning ladder:** D+1 reminder → D+3 reminder + worker informed → D+7 admin follow-up call/message → D+14 customer account **restricted** (no new bookings/requests until paid; for guests, the phone number is flagged) → D+30 admin decides: write-off, or recover; the reliability score is updated either way.
4. The worker sees each step on the "waiting for the customer" banner, so they know the platform is chasing.
5. The **guarantee** is shown as *not active until the balance is paid* — a direct incentive.

### 3.4 Admin/finance: confirming a payment (maker–checker)

1. Finance opens **Payments inbox** (one queue for deposits, balances, plans, credits, upgrades, campaigns), sorted oldest-first with SLA colours (target: < 2 h in business hours).
2. Finance checks the OMT/Whish statement/app, then enters: **amount received**, **transaction number** (system rejects a number already used on another payment), and confirms the receipt photo matches.
3. Outcome by amount:
   - **Exact** → confirmed; booking/capability activated; invoice issued; ERPNext event queued.
   - **Short** → amount recorded as partial; booking/capability **not** activated; a new reference is issued for the shortfall; customer told the exact remaining amount.
   - **Over** → confirmed; excess recorded as a customer credit to refund (or, for workers, to the wallet) with a refund task.
4. **Second approval** required when: amount ≥ threshold (start at **$200**, configurable), or it is a payer's first payment, or the transaction number was entered manually without a receipt. The second approver must be a different admin with the new **FINANCE** role.
5. Receipt and evidence are **locked** once the payment is confirmed.
6. Every step is written to an append-only **PaymentAuditEvent** table (never pruned).

### 3.5 Late and orphan payments

- Customer pays **after** the reference expired or the booking was cancelled → the transaction number is matched to the old reference and lands in the **Unmatched payments** queue.
- Finance chooses: **re-attach** (if the slot is still free, re-open the booking), **convert to credit**, or **refund**. Money is never silently lost.

### 3.6 Refunds (cancellation, guarantee, overpayment, lead-quality)

States: `REFUND_REQUESTED → REFUND_APPROVED (second approver above threshold) → REFUND_SENT (with OMT/Whish transaction number) → REFUNDED`. The original invoice is cancelled by a **credit note** (a real document, not just `VOID`). Credit-based refunds (e.g., lead-quality) go straight to the wallet and are not cash.

### 3.7 Customer payment-reliability score

Simple points per phone/account: expired deposit +1, balance overdue > 7 days +3, written-off balance +10, completed and fully paid −1 (floor 0).
- 0–2 → normal deposit rules.
- 3–9 → 100 % prepayment required.
- ≥ 10 → booking blocked; admin review.

### 3.8 Cash "settled directly"

1. Worker declares "settled directly" → the **customer is asked to confirm** (WhatsApp "YES" reply or in-app button). Without confirmation within 72 h, admin reviews.
2. Not allowed if a balance receipt has already been uploaded (prevents cancelling a payment the customer actually made).
3. The platform fee becomes a claim, collected from the worker's wallet as today; if unpaid after 14 days: **no lead purchases, no payouts, and ranking demoted** until paid.
4. Workers with frequent cash declarations are flagged for account management (fee-bypass signal).

### 3.9 Worker payouts

Payout requests above the threshold need two approvals; payout is recorded with the OMT/Whish transaction number used to send it; ERPNext receives the payment entry.

### 3.10 Operations rhythm

- **Daily:** finance reconciles the OMT and Whish statements against the "confirmed" list (CSV export from the admin; later automated import into ERPNext Bank Reconciliation).
- **Weekly:** review unmatched payments, overdue balances, outstanding fee claims, refund queue.
- **Monthly:** close in ERPNext; reconciliation canary must read $0.00.
- **Ask OMT and Whish for business/merchant accounts and any statement export or API** — if either offers a merchant API or callback **[verify with providers]**, the confirm step becomes automatic for that rail and the manual flow remains as fallback.

---

## 4. Risk → mitigation matrix

| Risk | Today (verified) | Mitigation in v2 | Where in code |
|---|---|---|---|
| Unpaid deposit holds the slot forever | No expiry for `PENDING_PAYMENT` | Deadline + auto-cancel + slot release (§3.2) | New `Payment.expiresAt`, `Booking.paymentDueAt`; `expireUnpaidBookings()` in the 15-min `requests` cron, reusing `prismaCancelBooking` |
| Deposit paid, balance never paid | Balance reference only on customer click; no reminders | Auto-create balance reference; dunning ladder; restriction; reliability score; minimum deposit (§3.3, §3.7) | Completion transition + `completions` cron; new dunning step in `reminders` cron; `Booking.settlementDueAt` |
| Worker not credited the balance | **D1** index bug | Partial unique index | Migration + smoke test |
| Credit-pack payments never confirmed | **D2** | Include scope `credit` | `prismaGetPendingManualPayments`, `confirmManualPaymentAction` |
| Underpayment | Confirm assumes full amount | Amount received + partial path (§3.4) | `PaymentAllocation` (or `amountReceived`) + confirm functions |
| Receipt reused for two payments | No transaction number stored | Unique OMT/Whish transaction number | `Payment.externalTxnId @unique` |
| Single admin fraud / error | One click, no second approver | FINANCE role, four-eyes above threshold, append-only audit | `Role.FINANCE`, `PaymentConfirmation`, `PaymentAuditEvent` |
| Evidence overwritten | Receipt upsert after confirm | Lock after confirm; rate-limit upload | `payment-receipts.ts` |
| Paid after cancel / expiry | Not handled; link still works | Status-aware instructions page; unmatched-payments queue (§3.5) | `/payments/manual` page; new queue |
| Refund marked done, money not sent | REFUNDED immediately | Refund states + transaction number (§3.6) | `PaymentStatus` / `refundState` |
| Cash bypass of fee | Worker-only declaration, claim not enforced | Customer confirmation + enforcement (§3.8) | `prismaMarkBookingSettledOutside`, gates in `purchaseLeadOffer` and `requestPayout` |
| Guests unidentifiable | OTP optional | OTP mandatory before payment; guest invoices with bill-to snapshot | `GUEST_OTP_ENFORCED`; `Invoice.userId` nullable + `billToName/Phone` |
| Missing invoices | Only deposit (signed-in), campaign, subscription | Invoice for **every** cash event | All confirm functions |
| Audit trail deleted after 90 days | Activity-log prune | Money events in a never-pruned table | `PaymentAuditEvent` |
| Demo writes in production | **D3** | Boot guard | `repo.ts`, `manual.ts` |
| Weak rate limiting | Memory fallback, 4 call sites | Redis required in prod; limits on receipt upload, confirm, checkout | `src/lib/rate-limit.ts` |
| WhatsApp webhook spoofing | Fail-open | Fail-closed when secret missing | `api/webhooks/whatsapp/route.ts` |

---

## 5. Study: OpenWA for platform communications

### 5.1 What it is

[OpenWA](https://github.com/rmyndharis/OpenWA) is a self-hosted WhatsApp API gateway (Node.js/NestJS, MIT licence, ~15k GitHub stars, active releases — v0.23.7 on 25 Sep 2026, still pre-1.0). It drives a normal WhatsApp account through **reverse-engineered WhatsApp Web clients** (`whatsapp-web.js` with headless Chrome, or Baileys). It offers a REST API with API keys and roles, multiple sessions (numbers), webhooks with HMAC signatures, delivery/read receipts, media, groups, labels, a dashboard, Docker/Helm deployment (SQLite or PostgreSQL, optional Redis), and plug-ins (Chatwoot for a shared inbox, n8n, Typebot).

### 5.2 What the platform already has

A WhatsApp channel with the **official Meta Cloud API** provider (`src/lib/notifications/providers/whatsapp.ts`), a delivery ledger with retries (`WhatsAppDelivery`), a status webhook, and an SMS fallback pattern. Gaps: free-text messages only (no approved templates — they fail outside Meta's 24-hour window **[verify frequency]**), inbound messages ignored, no shared support inbox.

### 5.3 Benefits vs risks

| | OpenWA | Official Cloud API (already built) |
|---|---|---|
| Cost per message | None (hosting only) | Meta charges per conversation/template **[check current pricing for Lebanon]** |
| Two-way chat & inbox | Yes (+ Chatwoot plug-in) | Yes, but needs build + templates |
| Templates required | No | Yes for business-initiated messages |
| **Ban / disconnection risk** | **Stated by the project: non-zero; use a number "you can afford to lose"; treat as not approved for finance/commercial at scale** | None if policies are followed |
| Known issues | First message to new contacts may be dropped; some accounts cannot link (passkey); sessions can drop | Template approval delay |
| Hosting | Needs a persistent server (Chrome per session ~300–500 MB) — **not Vercel** | Fully managed by Meta |
| Compliance | Breaches WhatsApp's terms for automated use | Compliant |

### 5.4 Recommendation

**Use a hybrid, with OpenWA as a pilot for non-critical, two-way conversations only.**

| Message type | Channel |
|---|---|
| OTP, payment instructions, receipts, refunds, deadlines, dunning, payout notices | **Cloud API (approved templates)** → SMS fallback. Never OpenWA. |
| Booking reminders, review requests, marketing to opted-in users | Cloud API templates |
| Customer/worker support conversations, admin ops alerts, worker lead alerts, "reply YES to confirm cash settlement" | **OpenWA pilot** (dedicated number) → fallback Cloud API |

Why: in Lebanon WhatsApp is the main channel, so the communication upgrade is high-value; but a banned number in the middle of a payment deadline would directly lose money and trust. The pilot gives the cost and two-way benefits where a ban is an inconvenience, not a loss.

### 5.5 Integration design (developer view)

1. New `OpenWAChannel` implementing the existing `NotificationChannel` interface (`send()` never throws, returns `providerMessageId`); add `"openwa"` to `WhatsAppProviderName` and the factory. No schema change (the ledger's `provider` is a string).
2. **Per-message routing** in the dispatcher: a `criticality` tag on each notification type decides Cloud API vs OpenWA.
3. New webhook route `api/webhooks/openwa` — verifies HMAC **fail-closed**, maps delivery/read acks to the existing `applyWhatsAppStatusEvent`, and passes inbound messages to a small handler (YES/NO confirmations, "PAID <txn>" replies attach to the payment, everything else to the support inbox).
4. Fallback: if OpenWA returns an error or the session is disconnected, re-send through Cloud API, then SMS (existing emergency fallback pattern).
5. Hosting: a small VPS/container (e.g., 2 vCPU / 4 GB) with PostgreSQL, Redis queue, `SEND_PACING_ENABLED=true`, IP allow-list for the platform, backups of the session data. Health check every 5 min; alert admins on disconnect.
6. Message templates for the Cloud API side, bilingual EN/AR, submitted for approval (payment instructions, deadline reminder, balance due, payment confirmed, refund sent, payout sent, OTP).
7. Exit criteria for the pilot (4–6 weeks): zero bans, < 2 % failed deliveries, support response time improved; otherwise roll back to Cloud API only.

---

## 6. Study: ERPNext as the accounting back office

### 6.1 What it is

[ERPNext](https://github.com/frappe/erpnext) is a mature open-source ERP (GPL-3.0, ~40k stars, versions 15 and 16 actively maintained) on the Frappe framework, with accounting (Sales/Purchase Invoices, Payment Entries, Journal Entries, Bank Reconciliation and statement import, multi-currency), CRM (Lead, Opportunity, Customer), and a REST API. Hosting: Frappe Cloud (managed) or self-hosted via `frappe_docker`.

### 6.2 Fit for WorkersArena

| Need | ERPNext | Comment |
|---|---|---|
| All invoices in one accounting system | Sales Invoice + Credit Note | Platform keeps its own invoice numbers (`WA-YYYY-NNNNN`) and pushes them |
| Payments by OMT / Whish | Mode of Payment "OMT", "Whish" linked to clearing accounts; Payment Entry | Daily bank/wallet statement import for reconciliation |
| Marketplace accounting (agent model) | Customer money held = **liability to workers** until settled; platform revenue = fees, plans, credits, ads, upgrades | Must be designed with the accountant; this is the most important set-up decision |
| Worker payouts | Payment Entry to Supplier (worker) | Workers as Suppliers |
| Leads | CRM Lead/Opportunity | Use for **B2B sales** (advertisers, Business-plan workers). Marketplace lead purchases stay in the platform and are posted as revenue lines |
| USD + LBP | Multi-currency with exchange rates **[verify configuration]** | Base currency decision needed (USD vs LBP for statutory books) **[accountant]** |
| VAT / Lebanese tax | Tax templates exist; **no Lebanon localisation or chart of accounts** in the repo | Build a Lebanese chart of accounts and VAT template with the accountant **[verify VAT registration status/rate]** |
| Arabic | Frappe has an Arabic translation **[verify coverage]** | Accounting staff may work in English |
| Licence | GPL-3.0 (not AGPL) | Calling ERPNext over its API does not make the platform GPL; modifications to ERPNext itself would be GPL. **Confirm with legal counsel.** |

### 6.3 Recommendation

**Yes — adopt ERPNext as the accounting book of record, integrated one-way (platform → ERPNext), starting after the payment v2 defects are fixed.** Do not move operational logic (bookings, credits, worker wallet, settlement engine) into ERPNext; the platform remains the operational system, ERPNext becomes the financial system.

Start on **Frappe Cloud** (lowest operating risk; no server to run) and keep the option to self-host later.

Alternatives considered: Odoo (strong, but key accounting features are in the paid edition), Zoho Books / QuickBooks Online (simpler SaaS, monthly fees, less control, local support varies). ERPNext wins on cost, openness, API and the ability to grow into HR/purchasing later.

### 6.4 Integration design (developer view)

1. **Outbox pattern:** new `OutboxEvent` table (type, payload, status, attempts, next retry). Each money transaction writes its event **inside the same database transaction**, so accounting can never miss or double-count an event.
   Events: `invoice.issued`, `invoice.credited`, `payment.received`, `payment.refunded`, `payout.sent`, `fee.claim.collected`, `lead.purchased`, `credits.granted`, `campaign.paid`.
2. **`erp-sync` cron** (every 5 min) pushes events to the ERPNext REST API with an API key/secret **[verify auth header format]**; idempotent via a custom field `wa_ref` (invoice number / payment id) — a retry never creates a duplicate.
3. **Mapping:**

| Platform | ERPNext |
|---|---|
| Customer / company / guest (bill-to snapshot) | Customer |
| Worker | Supplier (payables) and Customer (when buying plans/credits) |
| Invoice `WA-…` (plan, credits, upgrade, campaign, fee) | Sales Invoice |
| Booking deposit/balance held for the worker | Journal Entry to "Customer funds held for workers" (liability) |
| Platform fee on completion | Journal Entry: liability → fee revenue |
| OMT / Whish receipt | Payment Entry (Mode of Payment OMT/Whish) |
| Refund | Credit Note + Payment Entry (out) |
| Payout to worker | Payment Entry to Supplier |
| B2B prospect (advertiser) | CRM Lead → Opportunity → Customer |

4. **Prerequisites in the platform:** invoices for every cash event (§1), invoice numbering from a sequence, bill-to snapshot on invoices, credit notes as documents, reconciliation CSV extended to wallet and card payments, replace the mock `/admin/webhooks` page with an Outbox monitor (pending / failed / retry).
5. **Reconciliation loop:** ERPNext Bank Reconciliation against imported OMT/Whish statements; mismatches raised to the platform's Unmatched-payments queue.

---

## 7. Implementation roadmap

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **0 — Decisions** | 0–1 | Deposit policy, threshold for four-eyes, dunning timeline, LBP policy, accountant engaged, OMT/Whish merchant-account request, Meta templates submitted | Decisions recorded in this document |
| **1 — Stop the leaks** | 1–3 | D1–D4; boot guard; status-aware instructions page; receipt lock + rate limit; fail-closed webhooks; never-pruned `PaymentAuditEvent` | Live-DB smoke: deposit + balance credits worker exactly once; credit packs confirmable; no demo writes in prod |
| **2 — Payment workflow v2** | 3–7 | Expiry + auto-cancel; transaction number + amount received; partial/over/late paths; FINANCE role + four-eyes; refund states + credit notes; auto balance reference + dunning; reliability score; cash-settlement confirmation + fee-claim enforcement; invoices for every cash event | Pending-payment age p95 < 4 business h; 0 unmatched payments older than 7 days; reconciliation canary $0.00 for 14 days |
| **3 — Communications** | 5–9 (parallel) | Approved Cloud API templates EN/AR; per-message routing; OpenWA pilot on a dedicated number for support + ops alerts + YES confirmations; inbound handler; fallback chain | Pilot exit criteria in §5.5 |
| **4 — Accounting** | 7–12 | ERPNext on Frappe Cloud; chart of accounts + taxes with accountant; Outbox + `erp-sync`; historical back-fill of current-year invoices/payments; statement import | Month-end close done in ERPNext; platform totals = ERPNext totals |
| **5 — Automate rails** | When available | OMT/Whish merchant API/callbacks if offered; card gateway for diaspora | ≥ 80 % payments confirmed without a human |

**Tests per phase:** every money change ships with unit tests on the pure engines, a `db:smoke` live-Postgres chain, and E2E for the customer pay page and the admin inbox; nothing merges with a red money suite.

**Team:** 2 full-stack developers, 1 QA (part-time), 1 finance/operations owner (runs the payments inbox and reconciliation, signs off on the accounting design), external accountant for ERPNext set-up.

---

## 8. KPIs to track

Pending-payment age (p50/p95) · deposit expiry rate · deposit-to-confirmed conversion · balance collected within 7 days (%) · overdue balances ($) · write-offs ($) · unmatched payments (count/age) · refunds pending > 3 days · fee claims outstanding ($) · cash-settlement declarations per worker · WhatsApp delivery rate by provider · OpenWA disconnects · ERPNext sync backlog and failures · reconciliation canary (must be $0.00).

---

## 9. Decisions needed

1. Minimum deposit per job type (proposed: 100 % fixed-price, 30–50 % quoted).
2. Four-eyes threshold (proposed: $200) and who holds the FINANCE role.
3. Dunning timeline and restriction policy (proposed: D+1/3/7/14/30).
4. Accept LBP payments? If yes, which exchange rate source and who bears the difference.
5. OpenWA pilot: approve a dedicated number and the restricted message scope.
6. ERPNext: Frappe Cloud vs self-host; base currency; accountant to design the chart of accounts and the agent-model treatment of customer funds.
7. Contact OMT and Whish for merchant accounts / statement exports / APIs.
