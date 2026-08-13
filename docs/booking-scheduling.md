# WorkersArena — Booking & Scheduling (P1 #1)

> Design for the top P1 backlog item (docs/PRODUCT.md §3.2). Covers the data model (slots → requests → confirmations), the repo-seam functions, notifications, and a worker-dashboard UI plan. Update alongside `docs/PRODUCT.md` as M1–M4 land.

**Status:** ✅ **Migration applied** — `prisma/migrations/20260810084347_booking_scheduling` (BookingStatus/SlotStatus enums + BookingSlot/Booking/BookingEvent tables) is committed and applied to the local DB; the seed creates 3 demo slots (AVAILABLE/RESERVED/BLOCKED) + a REQUESTED booking `BK-1001` for Khaled with one event. ✅ **M1 core shipped** — demo adapter (`src/lib/data/bookings.ts`) with `createBookingRequest` / `respondToBooking` (slot reservation, overlap guard, events, notifications), seam functions in `repo.ts`, server actions (`src/app/actions/bookings.ts`), booking notification types (app union + Prisma enum via `20260810085511_booking_notification_types`), and `tests/bookings.test.ts`. ✅ **W2 shipped (Prisma adapter)** — `prisma-repo.ts` gains `prismaGetWorkerSlots` / `prismaGetWorkerBookings` / `prismaCreateBookingRequest` / `prismaRespondToBooking` with **`prisma.$transaction`** (rule 1's atomic `updateMany(WHERE status=AVAILABLE)` claim is the Postgres row-lock + re-check in one statement — a concurrent request matching 0 rows gets `slot-taken`; the rule-2 overlap guard runs **before** the claim so a rejection can't orphan a RESERVED slot; the count-derived BK-number retries once on the P2002 unique collision — the whole tx rolls back on a loser, so the retry re-claims cleanly), slot freeing on decline (rule 3), minor-unit money (rule 4), and BookingEvent appends in the same tx (rule 5). Notifications fire **after** the tx (the inbox write must not share its locks). Validated live via `npm run db:smoke` (create → RESERVED, double-book rejected, overlap rejected with the slot left AVAILABLE, accept → CONFIRMED + BOOKED, cleanup restores the seed) and by 6 new mapper tests. **The M2 availability editor is Prisma-backed too** — `prismaGenerateSlots` (weekly `WorkingHour` template → AVAILABLE slots; idempotent via an in-memory overlap set **plus** `createMany(skipDuplicates)` against the `(workerId, startAt)` unique index; past-hour guard with an injectable `now`; 24/7 emergency marker → full day) and `prismaSetSlotBlocked` (AVAILABLE↔BLOCKED CAS with the RESERVED/BOOKED precondition inside the `updateMany` WHERE). `db:smoke` now covers both (79-slot week, re-generate → 0, past-hour → 0, block/unblock + RESERVED refusal). ✅ **Customer UI shipped** — BookingDialog (service → slot → details), SlotPicker, ServicePicker, BookingStatusBadge, `/bookings` page with guest phone lookup, `booking.*` + `notifications.types` i18n keys (see [booking-customer-ui.md](booking-customer-ui.md)). ✅ **Worker UI shipped (M1 complete)** — `BookingsPanel` (Requests/Upcoming/Past tabs + counts + empty states) on `/dashboard`, worker `BookingRow` (customer avatar/name/phone, note, localized time), `RespondDialog` (accept with quote prefilled from `priceMin` + deposit toggle | decline with reason), and the static "96%" replaced by a **computed response rate** (`computeResponseRate` — non-REQUESTED counts as answered; "No data" with no history). Both sides of the M1 request→respond flow are now interactive. ✅ **M2 availability shipped** — `generateSlots` (demo + `prismaGenerateSlots` + seam + `generateSlotsAction`) materializes the weekly `WorkingHour` template as AVAILABLE slots (idempotent — overlaps skipped; never creates past-hour slots; 24/7 emergency marker → full-day generation), `setSlotBlocked` (demo + `prismaSetSlotBlocked` + seam + `setSlotBlockedAction`) blocks/unblocks AVAILABLE slots and refuses RESERVED/BOOKED, and the sidebar **`AvailabilityPanel`** renders the next 7 days (Today/Tomorrow labels, locked pending/booked chips, block/unblock clicks, closed days, legend) with a Generate button. 9 new tests (deterministic 2027 windows + injected `now`). The generate/block **server actions now work in real mode** against Postgres (previously warn + no-op). ✅ **M4 reminder cron shipped** — `GET /api/cron/reminders` fires a "job starts tomorrow" notification for CONFIRMED bookings within 24h via `runBookingReminderEngine` (see the M4 checklist item below): `Booking.lastReminderSent` (migration `20260810115309_booking_reminder_sent`) is the persisted idempotency stamp, claimed with a compare-and-swap so overlapping cron runs can't double-send; demo mode dedupes per process. 8 new unit tests + a `db:smoke` section validate both adapters. ✅ **Customer lookup wired (W2 complete)** — `prismaGetCustomerBookings` (email case-insensitive; phone with spaces/dashes/parens stripped on both sides via Postgres `regexp_replace`, so a guest typing `+966509999999` finds the formatted stored value) serves the `/bookings` page in real mode; `db:smoke` covers email/phone/stranger/empty-identifier lookups. ✅ **M3 deposits shipped** — accept-with-deposit creates a **`Payment` row (PENDING, minor units) linked via `booking.paymentId`** inside the same `$transaction` (migration `20260810123344_m3_payment_checkout` made `Payment.userId` nullable for guest customers and added `refundRef`/`refundedAt`). The checkout goes through a **provider seam** (`src/lib/payments/` per docs/PAYMENTS.md): `getPaymentProvider()` returns real **Stripe** (REST, signature-verified webhook, refunds — no SDK) when `STRIPE_SECRET_KEY` is set, else a **simulated provider** whose `createCheckout` mints a signed local URL (`/api/payments/simulate`) so the full flow runs keyless in dev/tests. `prismaCreateBookingCheckout` is idempotent (a re-click after abandoning the checkout returns the SAME url via a CAS claim on `providerRef` — no duplicate sessions, and concurrent clicks both converge on one); `prismaConfirmBookingPayment` CAS-flips `PENDING_PAYMENT → CONFIRMED` + `PENDING → PAID` in one tx (webhook redelivery no-ops) and notifies the customer with the new **`bookingPaid`** type; `prismaCancelBooking` refunds a paid deposit via the provider (payment → `REFUNDED` with `refundRef`/`refundedAt`) after the tx. The customer `/bookings` page shows a **Pay-deposit card** (amount, `payBookingAction` → redirect), and `POST /api/payments/webhook` + `GET /api/payments/simulate` close the loop. Validated live: `db:smoke` M3 section + 19 new tests, and an end-to-end real-mode run (deposit → PENDING_PAYMENT + Payment row → checkout → PAID + CONFIRMED + bookingPaid notification → worker cancel → REFUNDED + slot freed). ✅ **Invoice row created (M3 complete)** — `prismaConfirmBookingPayment` mints a **`WA-YYYY-NNNNN` `Invoice` row** (`formatInvoiceNumber` — per-year zero-padded 5-digit sequence, P2002-collision retry like the BK-number) linked to the deposit `Payment` for **signed-in customers only** (`Booking.customerId` set by `requestBookingAction` from the session; guest phone-keyed bookings skip it), amount in minor units + `status: PAID` + `paidAt`. `toDomainBooking` maps it onto `Booking.invoice` (via `payment.invoice`) so the customer `/bookings` page renders the receipt (invoice number + amount, EN/AR) in both modes; the demo adapter mints its own `WA-YYYY-NNNNN` at `demoConfirmBookingPayment` for the same condition. Validated: 4 new `payments.test.ts` tests (signed-in invoice / guest skip / redelivery no-dup / customer lookup) + `toDomainBooking` invoice mapper + `formatInvoiceNumber` unit tests + a `db:smoke` section (guest booking asserts NO invoice; a signed-in Sara booking asserts the `WA-YYYY-NNNNN` row, `amount`/`status`/`userId`, and the customer-lookup mapping).

---

## 1. Why this is P1 #1

Today the platform is a **directory + manual leads**: a customer requests a quote, the worker sees a lead counter, and everything happens off-platform (phone/WhatsApp). Booking turns the marketplace transactional:

- **Revenue** — deposits and confirmed jobs attach payments to the existing `Payment`/`Invoice` machinery; premium plans can gate booking features (lead routing, calendar sync).
- **Retention** — a worker with a booked calendar has a reason to return daily; customers get a guaranteed slot instead of a cold lead.
- **Data moat** — confirmed appointments, no-show rates, and job history feed the trust program (P2) and analytics.
- **Cheap to build on what exists** — `WorkingHour` (weekly availability), `Lead`, `Payment`, the notification seam, and the dashboard component patterns are all in place. No new infra.

Dependencies: booking M1 needs **no payments**; M3 deposits need the W2 Prisma mutations + Stripe wiring. Sequencing it now lets M3 land when payments do.

---

## 2. Product requirements

**Customer flow** (on `/workers/[slug]`):
1. Picks a service item or describes the job → sees the worker's next available slots.
2. Requests a slot with name/phone/note (auth optional — matches today's lead form; signed-in customers are matched to a `User`).
3. If the worker requires a deposit → prompted to pay it (Stripe).
4. Tracks status from a "My bookings" list; gets notified at every state change.

**Worker flow** (on `/dashboard`):
1. Sees today's/upcoming bookings + pending requests with counts.
2. Accepts (optionally quoting a price) or declines a request; confirm/cancel jobs; mark complete/no-show.
3. Manages availability: weekly template (existing `WorkingHour`) + concrete slot overrides/blocks.
4. Gets notified (email/SMS/push/WhatsApp via the seam) and can reply via the booking's contact info.

**Admin**: read-only oversight (counts, funnel, dispute lookup) via the activity feed; no new admin UI in M1.

---

## 3. Data model — Prisma proposal

### 3.1 schema.prisma additions

```prisma
enum BookingStatus {
  REQUESTED       // customer picked a slot, worker hasn't answered
  PENDING_PAYMENT // worker accepted with a deposit; customer must pay to confirm
  CONFIRMED
  IN_PROGRESS     // worker marked it started
  COMPLETED
  CANCELLED       // either side, with reason
  DECLINED        // worker turned it down
  NO_SHOW
}

enum SlotStatus {
  AVAILABLE
  RESERVED   // a request is pending on this slot
  BOOKED     // a confirmed booking owns it
  BLOCKED    // worker unavailable (override/off-day)
}

/// A concrete, calendared time range (UTC). Generated from the worker's
/// weekly WorkingHour template, with per-slot overrides. The exact
/// (workerId, startAt) uniqueness guards double-booking; overlapping-range
/// checks live in the service layer.
model BookingSlot {
  id        String     @id @default(cuid())
  workerId  String
  worker    Worker     @relation(fields: [workerId], references: [id], onDelete: Cascade)
  startAt   DateTime
  endAt     DateTime
  status    SlotStatus @default(AVAILABLE)
  note      String? // worker-visible note (e.g. "site visit", "off day")
  bookingId String?   @unique // the Booking that claims this slot
  booking   Booking?  @relation(fields: [bookingId], references: [id], onDelete: SetNull)

  @@unique([workerId, startAt])
  @@index([workerId, status, startAt])
}

/// A booking request + its lifecycle. Numbered for humans ("BK-1049"),
/// money in minor units (schema convention), optional tie to a Lead and a
/// Payment (deposit/quote), and a full event trail for disputes.
model Booking {
  id            String        @id @default(cuid())
  number        String        @unique
  workerId      String
  worker        Worker        @relation(fields: [workerId], references: [id], onDelete: Cascade)
  customerId    String?       // null for guest requests
  customer      User?         @relation(fields: [customerId], references: [id], onDelete: SetNull)
  leadId        String?       // converted from a contact lead, if any
  lead          Lead?         @relation(fields: [leadId], references: [id], onDelete: SetNull)
  slot          BookingSlot? // back-relation — the FK lives on BookingSlot.bookingId
  serviceItemId String?
  serviceItem   ServiceItem?  @relation(fields: [serviceItemId], references: [id], onDelete: SetNull)

  customerName  String
  customerPhone String
  customerEmail String?
  jobTitle      String  // free-text description (user-generated, not bilingual)
  note          String? @db.Text

  startAt       DateTime
  endAt         DateTime
  status        BookingStatus @default(REQUESTED)

  quote         Int? // minor units — worker's price for this job
  deposit       Int? // minor units — required upfront when set
  currency      String @default("USD")

  paymentId     String?       @unique
  payment       Payment? @relation(fields: [paymentId], references: [id], onDelete: SetNull)

  cancelReason  String?
  cancelledBy   String? // "customer" | "worker" | "system"
  declinedReason String?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  events BookingEvent[]

  @@index([workerId, status, startAt])
  @@index([customerId, status])
}

/// Append-only audit trail per booking — who changed what and why. Feeds
/// dispute lookup and the admin activity feed (mirrors ActivityLog style).
model BookingEvent {
  id        String   @id @default(cuid())
  bookingId String
  booking   Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  status    BookingStatus
  actorType String // "customer" | "worker" | "system" | "admin"
  actorId   String?
  reason    String?
  createdAt DateTime @default(now())

  @@index([bookingId, createdAt])
}
```

Notes that keep it consistent with the existing schema:
- **Money in minor units** (`quote`, `deposit`) — same convention as `Subscription.price` / `Payment.amount`.
- **`BookingSlot.bookingId @unique`** — a slot is owned by at most one booking.
- **`BookingSlot.bookingId @unique`** — a slot is claimed by at most one booking (the single FK for the 1:1; `Booking.slot` is its back-relation).
- **Both `Lead` and `Booking` reference the worker** — a lead converts into a booking by setting `leadId`.
- **Soft-delete posture** — bookings are never hard-deleted; they're cancelled (audit value). 

### 3.2 Migration SQL (what `prisma migrate dev --name booking_scheduling` generates)

```sql
-- BookingStatus / SlotStatus enums
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED','PENDING_PAYMENT','CONFIRMED','IN_PROGRESS','COMPLETED','CANCELLED','DECLINED','NO_SHOW');
CREATE TYPE "SlotStatus"   AS ENUM ('AVAILABLE','RESERVED','BOOKED','BLOCKED');

-- BookingSlot
CREATE TABLE "BookingSlot" (
  "id"        TEXT NOT NULL,
  "workerId"  TEXT NOT NULL,
  "startAt"   TIMESTAMP(3) NOT NULL,
  "endAt"     TIMESTAMP(3) NOT NULL,
  "status"    "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
  "note"      TEXT,
  "bookingId" TEXT,
  CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BookingSlot_workerId_startAt_key" ON "BookingSlot"("workerId", "startAt");
CREATE UNIQUE INDEX "BookingSlot_bookingId_key" ON "BookingSlot"("bookingId");
CREATE INDEX "BookingSlot_workerId_status_startAt_idx" ON "BookingSlot"("workerId", "status", "startAt");
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Booking
CREATE TABLE "Booking" (
  "id"              TEXT NOT NULL,
  "number"          TEXT NOT NULL,
  "workerId"        TEXT NOT NULL,
  "customerId"      TEXT,
  "leadId"          TEXT,
  "serviceItemId"   TEXT,
  "customerName"    TEXT NOT NULL,
  "customerPhone"   TEXT NOT NULL,
  "customerEmail"   TEXT,
  "jobTitle"        TEXT NOT NULL,
  "note"            TEXT,
  "startAt"         TIMESTAMP(3) NOT NULL,
  "endAt"           TIMESTAMP(3) NOT NULL,
  "status"          "BookingStatus" NOT NULL DEFAULT 'REQUESTED',
  "quote"           INTEGER,
  "deposit"         INTEGER,
  "currency"        TEXT NOT NULL DEFAULT 'USD',
  "paymentId"       TEXT,
  "cancelReason"    TEXT,
  "cancelledBy"     TEXT,
  "declinedReason"  TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Booking_number_key" ON "Booking"("number");
CREATE UNIQUE INDEX "Booking_paymentId_key" ON "Booking"("paymentId");
CREATE INDEX "Booking_workerId_status_startAt_idx" ON "Booking"("workerId", "status", "startAt");
CREATE INDEX "Booking_customerId_status_idx" ON "Booking"("customerId", "status");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_workerId_fkey"      FOREIGN KEY ("workerId")      REFERENCES "Worker"("id")      ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey"    FOREIGN KEY ("customerId")    REFERENCES "User"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_leadId_fkey"        FOREIGN KEY ("leadId")        REFERENCES "Lead"("id")        ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_paymentId_fkey"     FOREIGN KEY ("paymentId")     REFERENCES "Payment"("id")     ON DELETE SET NULL ON UPDATE CASCADE;

-- BookingEvent
CREATE TABLE "BookingEvent" (
  "id"        TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "status"    "BookingStatus" NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorId"   TEXT,
  "reason"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

> **Applied** as `20260810084347_booking_scheduling` (see status note above). The applied schema uses **one FK** for the slot↔booking 1:1 (`BookingSlot.bookingId`, with `Booking.slot` as a back-relation) — cleaner than the double-FK sketch originally drafted here.

---

## 4. Domain types + repo seam

Follow the W1/W2 dual-adapter pattern exactly (demo in-memory + Prisma, same signatures).

```ts
// src/lib/data/types.ts
export type BookingStatus =
  | "requested" | "pendingPayment" | "confirmed" | "inProgress"
  | "completed" | "cancelled" | "declined" | "noShow";
export type SlotStatus = "available" | "reserved" | "booked" | "blocked";

export interface Booking {
  id: string; number: string;
  workerId: string;
  customerName: string; customerPhone: string; customerEmail?: string;
  jobTitle: string; note?: string;
  serviceItem?: ServiceItem;
  startAt: string; endAt: string;
  status: BookingStatus;
  quote?: number; deposit?: number; currency: CurrencyCode;
  events: { status: BookingStatus; actorType: string; reason?: string; time: string }[];
}
```

```ts
// src/lib/data/repo.ts — new seam functions (branch on realDataEnabled)
getWorkerBookings(workerId, { status?, limit? }): Promise<Booking[]>
getCustomerBookings(customerId?, phone?): Promise<Booking[]>
getWorkerSlots(workerId, { from, to }): Promise<Slot[]>
createBookingRequest(input): Promise<Booking | { error: "slot-taken" | "invalid" }>
  // customer side — slot must be AVAILABLE; mark slot RESERVED atomically
respondToBooking(bookingId, { accept, quote?, deposit?, declineReason? }): Promise<Booking | null>
  // accept → CONFIRMED (or PENDING_PAYMENT if deposit set); mark slot BOOKED
transitionBooking(bookingId, to: "inProgress" | "completed" | "noShow"): Promise<Booking | null>
cancelBooking(bookingId, { by, reason }): Promise<Booking | null>  // frees the slot
generateSlots(workerId, { from, to }): Promise<number>             // from WorkingHour template
```

Service-layer rules (single source of truth, regardless of adapter):
1. **No double-booking** — `createBookingRequest` runs inside a transaction that re-checks `BookingSlot.status = AVAILABLE` (Postgres row lock) before flipping to RESERVED.
2. **Overlap guard** — reject a request whose `[startAt, endAt)` overlaps an existing BOOKED/RESERVED slot (unique index only catches exact starts).
3. **Cancellation frees the slot** — slot returns to AVAILABLE unless it's a no-show.
4. **Money** — quote/deposit in minor units; deposit required → PENDING_PAYMENT until `paymentId` set.
5. **Audit** — every transition appends a `BookingEvent`.

Demo-mode implementation can keep bookings in a module-level array (like `VERIFICATION_LOGS`); Prisma mode implements the same rules with `prisma.$transaction`.

---

## 5. Server actions + notifications

```ts
// src/app/actions/bookings.ts ("use server")
requestBookingAction(workerSlug, formData)  // ✅ → customer; guards slot availability
respondBookingAction(bookingId, formData)   // ✅ → worker (accept/quote/decline)
transitionBookingAction(bookingId, to)      // ✅ → worker (inProgress/completed/noShow) [M4]
cancelBookingAction(bookingId, formData)    // ✅ → either side [M4]
generateSlotsAction(workerId, { from, to }) // → worker (calendar editor) [M2]
```

Each action: `getSession()`/guest info → repo call → `revalidatePath("/dashboard" | "/workers/[slug]")` → returns `{ ok }`.

**Notifications** ride the existing seam (`pushNotification` → `dispatch` → email/sms/push/whatsapp):
- ✅ Extend the app-level `Notification["type"]` union and the DB `NotificationType` enum with: `BOOKING_REQUEST`, `BOOKING_CONFIRMED`, `BOOKING_DECLINED`, `BOOKING_CANCELLED`, `BOOKING_REMINDER`, `BOOKING_COMPLETED` (done — `20260810085511_booking_notification_types`; M1 sends request/confirmed/declined).
- Recipients: worker for `BOOKING_REQUEST/CANCELLED`; customer for `CONFIRMED/DECLINED/REMINDER/COMPLETED`. `href` deep-links to `/dashboard` (worker) or a customer bookings page.
- ✅ **Reminder cron (M4 shipped)** — `GET /api/cron/reminders` now also fires a "your job starts tomorrow" reminder for `CONFIRMED` bookings starting within 24h, reusing the idempotent `lastReminderSent` pattern from `Subscription`: the `Booking` model gained a `lastReminderSent DateTime?` column (`20260810115309_booking_reminder_sent`); the demo engine dedupes per process (keyed set), the prisma engine claims each booking's stamp with a **CAS on the null column** (`prismaMarkBookingReminderSent` — `updateMany WHERE lastReminderSent IS NULL`, so overlapping cron invocations can never double-send). The reminder goes to the customer (`bookingReminder` type, deep-link `/bookings`) and the response includes `bookings: { dispatched, alreadySent, total }`. Validated by `tests/booking-reminders.test.ts` (8 tests — due/not-due/non-CONFIRMED/idempotency + cron route) and a live-DB `db:smoke` section (dispatch → row persisted + stamped; second run's due set drops to 0). ✅ **M4 ops shipped** — `transitionBooking` / `cancelBooking` (demo + Prisma adapters, repo seams, `transitionBookingAction` / `cancelBookingAction`): a strict state machine (`BOOKING_TRANSITION_FROM` — confirmed/pendingPayment → inProgress → completed; noShow voids any scheduled status) enforced by a CAS on the source status inside `prisma.$transaction`, every move appends a `BookingEvent`, cancellation stores `cancelReason`/`cancelledBy` and **frees the slot** (rule 3), and notifications follow the doc's recipient list (`bookingCompleted` → customer, `bookingCancelled` → the other party; inProgress/noShow are event-only). The worker `BookingsPanel` gained the lifecycle buttons (Start job / Mark complete / Mark no-show / Cancel with reason, EN+AR). 12 new tests + a `db:smoke` section (inProgress → completed, illegal transitions rejected, cancel frees the slot) validate both adapters.

---

## 6. Worker-dashboard UI plan

Reuse the existing dashboard patterns (`Card`, `Badge`, `Button`, `RenewDialog`-style dialogs, `toast`, bilingual `t()` keys under a new `booking.*` dictionary section — parity enforced by the i18n test).

**Placement** — two additions to `src/components/dashboard/worker-dashboard.tsx`:

```
┌──────────────────────────────────────────────────────────────┐
│ header (avatar, greeting, Edit profile / View live)          │
├──────────────────────────────────────────────────────────────┤
│ stat cards: views · leads · rating · response rate           │
│   → replace static "96%" with computed booking response rate │
├──────────────────────────────────────────────────────────────┤
│ banners (verification / expiry) — unchanged                  │
├───────────────────────────┬──────────────────────────────────┤
│  NEW: Bookings card       │  NEW: Availability card          │
│  (lg:col-span-2)          │  (sidebar, below subscription)   │
│  • Tabs: Upcoming ·       │  • "This week" slot list         │
│    Requests · Past        │  • Generate/block slots          │
│  • Status badges +        │  • Quick link to weekly          │
│    customer info          │    hours (WorkingHour editor)    │
│  • Action buttons         │                                  │
│    (Accept+quote,         │                                  │
│     Decline, Complete,    │                                  │
│     Cancel)               │                                  │
├───────────────────────────┴──────────────────────────────────┤
│ charts · reviews · subscription · invoices · completion ·    │
│ pricing (unchanged)                                          │
└──────────────────────────────────────────────────────────────┘
```

**New components** (`src/components/dashboard/bookings/`):

| Component | What it renders |
|---|---|
| `BookingsPanel` | Tabbed list (Upcoming / Requests / Past) + counts on the card header; empty states per tab |
| `BookingRow` | Time (localized), job title, customer (avatar initials + name + phone), status `Badge`, action buttons per status |
| `BookingStatusBadge` | Color map: REQUESTED=amber, PENDING_PAYMENT=violet, CONFIRMED=emerald, IN_PROGRESS=sky, COMPLETED=ink, CANCELLED=red-outline, DECLINED=red-outline, NO_SHOW=red |
| `RespondDialog` | Worker accepts with optional **quote** (prefilled from `worker.priceMin`), optional **deposit** toggle, or declines with reason; submits via `respondBookingAction`; toasts on ok/error |
| `AvailabilityPanel` | Next 7 days; each day's slots with AVAILABLE/RESERVED/BLOCKED chips; "block" toggle; "generate from weekly hours" button |
| `BookingSummaryCard` | Sidebar KPI: today's jobs, pending requests, monthly bookings (feeds a new StatCard too) |

**States to handle explicitly** (mirror the renewal/verification flows):
- Busy states on every action button (`Loader2` spin, disabled) — prevents double-submits on the same slot.
- Empty states ("No requests yet — share your profile") with a CTA.
- Conflict error: "This slot was just taken" → re-validate and refresh the panel.
- RTL: everything uses logical utilities (`ms/me`, `start/end`) like the rest of the app.

**Customer side** (`/workers/[slug]`): replace the current contact-card request button with a "Request booking" that opens a dialog — job description, service picker, **next available slot** chips, contact fields; on submit → `requestBookingAction` → toast + inbox notification. A signed-in customer gets a "My bookings" page (`/bookings`) listing their requests with status + cancel.

---

## 7. Milestones & acceptance criteria

| Milestone | Scope | Exit criteria |
|---|---|---|
| **M1 — Requests** | Models + migration, demo adapter, `createBookingRequest` / `respondToBooking` (accept w/ quote, decline), worker dashboard panel, profile request dialog, notifications | A customer books Khaled's slot; Khaled accepts; both see status + get notified; E2E covers request→accept→complete |
| **M2 — Availability** | `generateSlots` from `WorkingHour`, `AvailabilityPanel`, slot overrides/blocks, overlap guard | Calendar shows real slots; blocking a day frees/cancels; no double-booking possible |
| **M3 — Deposits** | ✅ `PENDING_PAYMENT`, `Payment` row + `paymentId` on accept-with-deposit, provider seam (`src/lib/payments/` — Stripe env-gated, simulated fallback), webhook confirm → CONFIRMED + PAID, refund on cancel, customer Pay-deposit UI | Deposit charged on confirm; refund on worker cancel; ✅ invoice row created |
| **M4 — Operations** | ✅ Reminder cron, ✅ transition + cancel (state machine + slot freeing + audit events + notifications), ✅ reschedule (new slot swap — old freed, target claimed, RESCHEDULED event + both parties notified), ✅ cancellation policy window (worker cancel > 24h before start refunds the deposit; within 24h it's kept — `BOOKING_CANCEL_REFUND_WINDOW_MS`), ✅ admin funnel card (`getBookingFunnel` → counts by status + REQUESTED→CONFIRMED conversion on /admin, live DB) | Reminders fire 24h out; jobs complete/cancel with full audit trail; bookings move between slots atomically; deposit refunds honor the cancellation policy; ✅ admin sees booking conversion |

**Testing:** ✅ `tests/bookings.test.ts` (65 tests — lifecycle, overlap guard, slot freeing on decline, generate/block M2 rules, **M4 transitions + cancellation state machine + reschedule (swap, overlap guard, cross-worker rejection, notifications)**, server-action zod layer, reads, notifications, **`getBookingFunnel` demo adapter (counts by status, terminal buckets don't convert, every status key zeroed)**, demo adapter, no DB) + `tests/payments.test.ts` (24 tests — **M3: Payment row on accept-with-deposit, checkout idempotency, webhook confirm + double-delivery no-op, refund on cancel — both M4 policy branches (worker > 24h refunds, within 24h keeps; customer always refunds) via provider-refund spy on deterministic slots, provider seam (simulated create/verify/refund, tamper rejection), webhook route, invoice row (signed-in gets WA-YYYY-NNNNN, guest skips, redelivery no-dup, customer-lookup receipt)**) + `tests/prisma-repo.test.ts` (mapper tests + **`bookingCancelRefundDue` policy unit tests — the prisma cancel adapter's refund branch: window edge strict `>`, customer/system always refund**) + `tests/booking-reminders.test.ts` (8 tests — M4 engine: due within 24h, out-of-window, non-CONFIRMED, per-process idempotency, cron route auth) + `tests/prisma-repo.test.ts` (mapper tests incl. **`customerId` + `invoice` mapping from the payment relation** + **`formatInvoiceNumber` WA-YYYY-NNNNN unit tests** + `bookingCancelRefundDue` policy unit tests + **`tallyBookingFunnel` unit tests — the shared pure tally the demo + prisma funnels both use: window cutoff, NaN-safe first-event, conversion = confirmed/inProgress/completed over total**) + the E2E request→accept flow in EN+AR (dev + prod). ✅ `npm run db:smoke` exercises the full Prisma adapter against a live seeded DB (create → RESERVED, double-book + overlap rejections, accept → CONFIRMED + BOOKED, generate 79 slots, block/unblock + RESERVED refusal, **reminder dispatch → row + stamp persisted → second run's due set is empty**, **M4 ops: inProgress → completed + illegal transitions rejected + cancel frees the slot with reason/actor stored**, **M4 reschedule: confirmed → new AVAILABLE slot claimed (atomic swap, old slot freed, RESCHEDULED event + customer notified, cross-worker target rejected)**, **M4 policy: worker cancel 30h out refunds the deposit (→ REFUNDED), worker cancel 1h out keeps it (stays PAID)**, **M3: accept-with-deposit → PENDING_PAYMENT + Payment row → checkout URL + providerRef → webhook confirm → PAID + CONFIRMED → worker cancel → REFUNDED + slot freed, idempotent; guest confirm creates NO invoice while a signed-in (customerId = Sara) confirm mints a WA-YYYY-NNNNN Invoice row (minor amount, PAID, linked to the user) that the customer lookup maps onto the booking**, **M4 admin funnel: live counts (9 bookings: 1 requested / 4 confirmed / 1 completed / 3 cancelled), counts sum to total, conversion = confirmed-ish / total**) and restores the seed on exit.

---

## 8. Open decisions (resolve before M1 coding)

1. **Timezones** — slots are stored UTC; display must use the worker's city/country tz. Add a `tz` column to `City` (or resolve from country) before M2.
2. **Guest vs signed-in customers** — M1 allows guests (matches today's lead form); booking history for guests is phone-keyed. Decide whether signed-in is required for booking M3+ (deposits/refunds).
3. **Slot length** — default 60 min from service `durationMin` when set, else `priceMin`-derived estimate; expose in the editor.
4. **Deposit policy** — ✅ **resolved**: fixed amount (worker-set at accept); refund window on worker-cancel implemented as `BOOKING_CANCEL_REFUND_WINDOW_MS` (24h, configurable) — a worker cancel more than 24h before `startAt` refunds the paid deposit, within 24h the deposit is kept (the slot couldn't be re-sold in time); customer/system cancels always refund. Shared policy helper `bookingCancelRefundDue()` keeps demo + prisma adapters in lockstep.
5. **Overlapping services** — a worker may legitimately run parallel jobs; M1 keeps 1:1 slots strict and documents the constraint.

---

## 9. Backlog updates

- docs/PRODUCT.md §3.2 "Booking & scheduling" — add link to this design and mark as *designed* (move to "in design" status; implementation starts with M1).
- New dictionary section `booking.*` (EN/AR) with all labels from §6 — parity test enforces it.
