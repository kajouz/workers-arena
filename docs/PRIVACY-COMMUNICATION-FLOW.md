# Privacy-Preserving Communication Flow

## Overview

WorkersArena implements a **privacy-preserving communication system** that protects both workers' and customers' real phone numbers throughout the entire booking lifecycle. The system uses **masked numbers** (temporary platform-provided numbers) for all communication until the job reaches the arrival or completion phase.

---

## The 7-Step Communication Flow

### Step 1: Customer Submits a Service Request

**What happens:**
1. Customer visits a worker's profile page
2. Opens the booking dialog (3-step wizard: Service → Slot → Details)
3. Fills in required information (name, phone, email, job description)
4. **Optional:** Toggles "Emergency" if the worker has 24/7 emergency badge
5. Submits the request

**Privacy protection:**
- Customer's phone number is stored securely in the database
- Worker does NOT see the customer's real phone number at this stage
- If emergency: masked numbers are created immediately

**Technical implementation:**
- `requestBookingAction()` in `src/app/actions/bookings.ts`
- Creates booking with `status: "requested"`
- Emergency bookings auto-create masked numbers via `createMaskedNumbers()`

---

### Step 2: Worker Receives Job Details (Without Customer's Personal Number)

**What happens:**
1. Worker receives notification (email + push + SMS for emergencies)
2. Views the booking request in their dashboard
3. Sees: customer name, job title, service item, scheduled time
4. **Does NOT see:** customer's real phone number

**Privacy protection:**
- Worker dashboard shows `CallButton` instead of direct phone link
- `CallButton` uses masked numbers for communication
- Real phone numbers are never displayed in the UI

**Technical implementation:**
- Worker booking row in `src/components/dashboard/bookings/booking-row.tsx`
- `CallButton` component in `src/components/calling/call-button.tsx`
- `phoneHref` variable removed from worker booking row

---

### Step 3: Customer and Worker Communicate Through Chat or Masked Calling

**What happens:**
1. **Chat:** Both parties can send messages through the booking thread
2. **Masked Calling:** Either party can initiate a privacy-protected call
3. Both see only platform-provided numbers (e.g., +1-800-555-0101)
4. System routes calls without revealing real numbers

**Privacy protection:**
- Chat messages are stored in `BookingMessage` table
- Masked numbers are generated from a platform number pool
- Call routing happens server-side without exposing real numbers

**Technical implementation:**
- Chat: `BookingChat` component in `src/components/bookings/booking-chat.tsx`
- Masked calling: `src/lib/calling/masked-number-service.ts`
- API: `POST /api/calling/masked` creates masked numbers
- API: `GET /api/calling/masked?bookingId=xxx&partyType=worker` retrieves masked number

---

### Step 4: Customer Accepts a Quote and Books Through the Platform

**What happens:**
1. Worker sends a quote (price + optional deposit)
2. Customer reviews the quote in the chat thread
3. Customer accepts the quote
4. Booking status changes from `requested` → `confirmed` (or `pendingPayment`)

**Privacy protection:**
- Communication continues through masked numbers
- Payment is processed through the platform (not direct transfer)

**Technical implementation:**
- `acceptChatQuoteAction()` in `src/app/actions/bookings.ts`
- Quote acceptance triggers status transition
- Slot is claimed and booking is confirmed

---

### Step 5: Payment is Made Through the Platform

**What happens:**
1. If deposit is required, customer is redirected to payment
2. Payment methods: Stripe, OMT, Whish (Lebanon-first)
3. Payment is processed and confirmed
4. Booking status: `pendingPayment` → `confirmed`

**Privacy protection:**
- Payment goes through platform, not direct transfer
- Financial details are handled by payment providers
- Worker and customer don't exchange bank details

**Technical implementation:**
- `payBookingAction()` in `src/app/actions/bookings.ts`
- `createBookingCheckout()` creates payment session
- Payment webhook confirms and updates booking status

---

### Step 6: Worker Receives Actual Contact Details Only When Necessary

**What happens:**
1. **Before arrival:** Both parties use masked numbers
2. **When worker arrives (inProgress):** Contact details are released
3. **When job is completion-pending/completed:** Contact details remain available
4. **Emergency bookings:** Contact details available immediately

**Privacy protection:**
- `contactDetailsReleasedAt` timestamp tracks when details are released
- Real numbers only visible after `inProgress` transition
- Admin can reveal real numbers (with audit logging)

**Technical implementation:**
- Contact release on `inProgress` transition in `src/lib/data/bookings.ts`
- API: `GET /api/calling/contact-details?bookingId=xxx`
- Admin panel: `src/app/admin/masked-numbers/page.tsx`

---

### Step 7: Platform Handles Payment, Reviews, Support, and Warranty

**What happens:**
1. Worker marks job as `completionPending`
2. Customer confirms completion → `completed`
3. Worker earnings are credited (quote - platform fee)
4. Customer can leave a review
5. Platform handles disputes if needed

**Privacy protection:**
- Communication shifts to post-job support
- Reviews are public but don't expose phone numbers
- Dispute resolution uses platform messaging

**Technical implementation:**
- `confirmBookingCompletion()` in `src/lib/data/bookings.ts`
- Review system in worker profile
- Dispute resolution in admin dashboard

---

## Emergency Services Flow

### Immediate Masked Calling

For **24/7 emergency services**, the system provides immediate masked calling:

1. **Customer toggles "Emergency"** in booking dialog (only for emergency-enabled workers)
2. **Masked numbers are created immediately** on request submission
3. **Worker receives urgent notification** with masked number ready
4. **SMS fallback** ensures delivery even if push notifications fail
5. **Both parties can call immediately** through masked numbers

**Emergency-specific features:**
- 🚨 Emergency badge on worker profiles
- ⚡ Immediate masked number creation
- 📱 SMS fallback for notifications
- 🎯 Emergency dashboard for admins
- ⏱️ 3-day expiration (vs 7 for normal bookings)

---

## Technical Architecture

### Masked Number Service

**Location:** `src/lib/calling/masked-number-service.ts`

**Key functions:**
- `createMaskedNumbers()` — Creates masked numbers for both parties
- `getMaskedNumberForBooking()` — Retrieves masked number for a party
- `routeIncomingCall()` — Routes call to real number without exposing it
- `releaseMaskedNumbers()` — Deactivates numbers after job completion
- `expireOldMaskedNumbers()` — Cron job to clean up expired numbers

**Data model:**
```typescript
interface MaskedNumber {
  id: string;
  maskedNumber: string;        // Platform number (+1-800-555-XXXX)
  realNumber: string;          // Actual phone (encrypted in production)
  partyType: "worker" | "customer";
  bookingId: string;
  workerRealNumber: string;
  customerRealNumber: string;
  expiresAt: Date;
  isActive: boolean;
  callCount: number;
}
```

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/calling/masked` | POST | Create masked numbers for a booking |
| `/api/calling/masked` | GET | Retrieve masked number for a party |
| `/api/calling/contact-details` | GET | Check if contact details are released |
| `/api/calling/admin` | GET | Admin management of all masked numbers |
| `/api/admin/emergency` | GET | Emergency dashboard data |

### Database Models

**Prisma schema additions:**
```prisma
model MaskedNumber {
  id                String    @id @default(cuid())
  maskedNumber      String    @unique
  realNumber        String
  partyType         String    // "worker" | "customer"
  bookingId         String
  workerRealNumber  String
  customerRealNumber String
  expiresAt         DateTime
  isActive          Boolean   @default(true)
  callCount         Int       @default(0)
  lastUsedAt        DateTime?
  createdAt         DateTime  @default(now())
  
  booking           Booking   @relation(fields: [bookingId], references: [id])
  callRecords       CallRecord[]
  
  @@index([bookingId, partyType])
  @@index([maskedNumber])
  @@index([isActive, expiresAt])
}

model CallRecord {
  id              String   @id @default(cuid())
  maskedNumberId  String
  callerPartyType String
  durationSeconds Int
  wasAnswered     Boolean
  startedAt       DateTime
  endedAt         DateTime
  
  maskedNumber    MaskedNumber @relation(fields: [maskedNumberId], references: [id])
  
  @@index([maskedNumberId])
  @@index([startedAt])
}
```

### Notification System

**Emergency SMS Fallback:**
- Location: `src/lib/notifications/emergency-sms-fallback.ts`
- Triggers when push notifications fail for emergency bookings
- Sends SMS even if `NOTIFY_SMS_ENABLED=false` (safety first)
- Bilingual templates (EN/AR)

**Integration:**
- `src/lib/notifications/dispatcher.ts` — Main dispatch function
- Calls `sendEmergencySmsFallback()` after push attempt
- Logs results for audit trail

---

## Admin Features

### Masked Numbers Management

**Location:** `/admin/masked-numbers`

**Features:**
- View all masked numbers across the platform
- See active/expired status
- Reveal real phone numbers (admin-only, audit logged)
- Call statistics per booking

### Emergency Dashboard

**Location:** `/admin/emergency`

**Features:**
- Real-time monitoring of emergency requests
- Summary cards (active, in-progress, completed)
- Response time metrics (avg, fastest, slowest)
- Privacy status (masked numbers, contact release rate)
- Auto-refresh every 30 seconds

---

## Privacy Guarantees

### For Customers
1. ✅ Real phone number never shown to workers until job starts
2. ✅ Communication through masked numbers or chat
3. ✅ Can initiate privacy calls via CallButton
4. ✅ Contact details only released on arrival/completion

### For Workers
1. ✅ Real phone number never shown to customers
2. ✅ Communication through masked numbers or chat
3. ✅ Can initiate privacy calls via CallButton
4. ✅ Contact details only released on arrival/completion

### For Admins
1. ✅ Can reveal real phone numbers (audit logged)
2. ✅ Full visibility into masked number usage
3. ✅ Emergency dashboard for monitoring
4. ✅ Call statistics and response time metrics

---

## Testing

### Playwright E2E Tests

**Location:** `tests/playwright/privacy-communication-flow.spec.ts`

**35 tests covering:**
- All 7 steps of the communication flow
- Emergency bypass with immediate masked calling
- Privacy enforcement (no real phone in UI)
- Admin oversight and access control
- API endpoint validation

**Run tests:**
```bash
npx playwright test tests/playwright/privacy-communication-flow.spec.ts
```

### Unit Tests

**Location:** `tests/masked-number-service.test.ts`

**25 tests covering:**
- Masked number creation
- Call routing
- Number expiration
- Contact details release
- Admin access control

---

## Configuration

### Environment Variables

```bash
# Notification channels
NOTIFY_SMS_ENABLED=true
NOTIFY_SMS_PROVIDER=console  # or "twilio"
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM=+1234567890

# Emergency settings
EMERGENCY_MASKED_NUMBER_EXPIRY_DAYS=3
NORMAL_MASKED_NUMBER_EXPIRY_DAYS=7
```

### Prisma Migration

```bash
npx prisma migrate dev --name add-masked-calling
npx prisma migrate dev --name add-emergency-privacy-fields
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System overview
- [booking-scheduling.md](booking-scheduling.md) — Booking lifecycle
- [INTERACTION-WORKFLOWS.md](INTERACTION-WORKFLOWS.md) — Party interactions
- [API.md](API.md) — REST endpoints
- [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) — Feature roadmap
