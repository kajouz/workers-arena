# WorkersArena — Customer Booking UI (component plan)

> Design for the **customer-facing half of booking M1** — the request dialog on `/workers/[slug]` (service picker → slot picker → details) and the `/bookings` tracking page. Companion to [booking-scheduling.md](booking-scheduling.md) §6 (worker-dashboard side). All components build on the shipped M1 core: demo adapter (`src/lib/data/bookings.ts`), seam (`repo.ts`), server actions (`src/app/actions/bookings.ts`), and notification types.
>
> **Status:** ✅ **Implemented** — BookingDialog (service → slot → details), SlotPicker, ServicePicker, shared BookingStatusBadge, `/bookings` page with guest phone lookup, and the full `booking.*` + `notifications.types` i18n keys are shipped. Worker-dashboard panel (docs/booking-scheduling.md §6) still pending — it reuses `BookingStatusBadge` + `booking.*`.

---

## 1. Scope

**In (M1):**
- `BookingDialog` on the worker profile — multi-step: **service** → **slot** → **details** → submit → success/conflict states.
- `ServicePicker` — select from the worker's `services` (`ServiceItem[]` with price + unit) or free-text job title.
- `SlotPicker` — AVAILABLE-slot chips grouped by day, fed by the `getWorkerSlots` read (which M2's `generateSlots` populates — the picker is data-source agnostic).
- `/bookings` page — signed-in customers see their requests keyed by session email; guests look up by phone (`?phone=` search param, server-side).
- `BookingStatusBadge` — shared with the worker dashboard.

**Out (later milestones):** cancel button (`cancelBooking` is M4 — the button stays out of M1), deposit payment (M3), reschedule (M4), availability editor (M2).

---

## 2. Entry points & routes

| Route | Who | Purpose |
|---|---|---|
| `/workers/[slug]` | customer | New **"Request booking"** button in `ContactCard` (primary CTA) opens `BookingDialog`; the existing textarea lead form stays as a secondary "Send a message" action |
| `/bookings` | customer | Track requests + confirmations, status badges, expandable audit trail; guest phone lookup via `?phone=` |
| `/notifications` | both | Booking notifications deep-link here **today**; flip `CUSTOMER_BOOKINGS_HREF` to `/bookings` when the page ships |

Server actions already in place: `requestBookingAction(workerSlug, formData)` (fields: `slotId, customerName, customerPhone, customerEmail, jobTitle, note, serviceItemName`; returns `{ ok, error: "slot-taken" | "invalid" | "not-found" }`; money major→minor ×100 server-side) and `respondBookingAction` (worker side, revalidates `/bookings` already).

**Wiring (done):** `requestBookingAction` now revalidates `/bookings` as well as the worker page + dashboard (§8).

---

## 3. Data flow

```
┌─ /workers/[slug] (server component) ──────────────────────────────┐
│ worker = getWorkerBySlug(slug)                                    │
│ slots  = getWorkerSlots(worker.id, { from: today, to: +14d })     │  ← M1: seeded demo slots;
│        … pass worker + slots to <BookingDialog>                   │    M2: generateSlots output
└───────────────────────────────────────────────────────────────────┘
                    │ client
┌─ BookingDialog (client) ──────────────────────────────────────────┐
│ ServicePicker → SlotPicker → details form                         │
│ requestBookingAction(worker.slug, formData)                       │
│   ok            → success state (booking number) + toast          │
│   slot-taken    → conflict banner + router.refresh() (fresh slots)│
└───────────────────────────────────────────────────────────────────┘
┌─ /bookings (server) ──────────────────────────────────────────────┐
│ session = getSession()                                            │
│ email → getCustomerBookings({ email })   │ phone? → getCustomer…  │
│ map workerById(b.workerId) → row data    │ ({ phone })            │
│ <BookingsClient rows={…} />                                       │
└───────────────────────────────────────────────────────────────────┘
```

Notes:
- Slots are fetched **server-side at page render** (repo functions are server-only). On a `slot-taken` conflict the dialog calls `router.refresh()` — the server component re-runs, `getWorkerSlots` returns fresh state, no extra action needed.
- Booking `quote`/`deposit` are **minor units** in the domain (×100); the UI must divide by 100 before `Price` (which takes major units). Read-only display only in M1 — customers never type money here.

---

## 4. Component tree

```
src/components/worker/
  booking-dialog.tsx        # dialog shell + step state machine + submit
  booking-form.tsx          # multi-step body (service → slot → details)
  service-picker.tsx        # radio list of worker.services + "custom job"
  slot-picker.tsx           # day-grouped AVAILABLE chips, disabled statuses
src/components/bookings/
  booking-status-badge.tsx  # SHARED — status → Badge variant + t() label
  bookings-client.tsx       # tabs (Upcoming/Past) + list + guest lookup form
  booking-row.tsx           # one booking: badge, number, worker, time, trail
src/app/bookings/
  page.tsx                  # server: session/searchParams → rows
```

---

## 5. Component specs

### 5.1 `BookingDialog` + `BookingForm`

Trigger: primary `Button` in `ContactCard` — "Request booking" (`booking.dialogTitle`), disabled while `worker.available === false` (with the existing availability tooltip). Opens a `Dialog` (existing `ui/dialog` primitives, `max-w-lg`, RTL-safe via `start/end`).

Internal state machine (client):
- `step: "service" | "slot" | "details"` with a 3-dot progress indicator (reuses the design language of the dashboard tabs).
- Field state: `serviceItemName`, `jobTitle`, `slotId`, `name`, `phone`, `email`, `note`.
- `submitting`, `conflict`, `done` (booking number captured from a `{ ok: true }` response — note the action returns `{ ok }` only, so show the generic success body rather than a number unless the action is extended).

Submits by building a `FormData` matching `requestBookingAction` exactly:
`slotId, customerName, customerPhone, customerEmail ("" when empty), jobTitle, note ("" when empty), serviceItemName`.

Steps:
1. **Service** — `ServicePicker` (5.2). Selecting a service auto-fills `jobTitle` with the localized service name (still editable). "Custom job" (`booking.customJob`) clears the picker and enables the free-text field.
2. **Slot** — `SlotPicker` (5.3). "Next" disabled until a slot is chosen.
3. **Details** — name, phone, email (optional, hint under field), note (optional). Submit = `booking.send`, busy = `booking.sending` (Loader2 spin, double-submit guard).

End states:
- **Success** — check icon, `booking.success` / `booking.successBody`, primary CTA "View my bookings" → `/bookings`.
- **Conflict** — `booking.slotTaken` / `booking.slotTakenBody` banner, button to refresh (`router.refresh()`) and re-pick; the chosen chip is deselected.
- **Invalid** — inline field errors (zod-side validation is server-only; mirror the same `min` rules client-side for snappy UX).

### 5.2 `ServicePicker`

Props: `worker: Worker`, `value`, `onChange(serviceItemName: string | null)`, `t`, `locale`.

- Renders one selectable row per `worker.services`: localized name, `Price` (major units), unit (`common.perHour` / `common.perJob`), checkmark on selected (same radio-card style as the dashboard plan picker).
- Bottom row: "Custom job" (`booking.customJob`) — selecting it nulls `serviceItemName`.
- Sends `nameEn` to the action (the server resolves `serviceItem` by `nameEn` — keep that contract).

### 5.3 `SlotPicker`

Props: `slots: BookingSlot[]`, `value`, `onChange(slotId)`, `t`, `locale`.

- Groups slots by UTC date; day header = **Today** (`booking.today`) / **Tomorrow** (`booking.tomorrow`) / weekday name (reuse the `DAYS_EN`/`DAYS_AR` arrays already in `profile-tabs.tsx` — extract to `src/lib/utils.ts` to avoid a third copy).
- Each chip: localized time range `startAt–endAt` (e.g. "09:00 – 10:00") via `Intl.DateTimeFormat(locale, { hour, minute })`.
- **Only `status === "available"` chips are selectable.** `reserved`/`booked` → disabled with a muted "taken" style; `blocked` → disabled with its `note` as tooltip (e.g. "Site visit").
- Empty state: `booking.slotEmpty` / `booking.slotEmptyBody` + a call CTA — the whole dialog still lets the user fall through to phone/WhatsApp via the existing `ContactCard` rows.
- Sorting: chronological (the adapter already sorts ascending by `startAt`).

### 5.4 `BookingStatusBadge` (shared)

`src/components/bookings/booking-status-badge.tsx` — maps `BookingStatus` → `Badge` variant + `booking.status.*` label. Used by **both** the customer `/bookings` list and the worker-dashboard panel, so the color map lives once (mirrors the notification `TYPE_DOT` convention):

| Status | Variant |
|---|---|
| requested | amber (default) |
| pendingPayment | violet |
| confirmed | emerald |
| inProgress | sky |
| completed | ink/neutral |
| cancelled / declined / noShow | red outline |

### 5.5 `/bookings` page + `BookingsClient` + `BookingRow`

**`page.tsx` (server):**
- `const session = await getSession()`; `const phone = (await searchParams).phone` (typed `Promise<{ phone?: string }>`).
- Rows: `session?.email → getCustomerBookings({ email })`; else `phone → getCustomerBookings({ phone })`; else `[]`.
- Resolve display data server-side: `workerById(b.workerId)` → `{ workerNameEn/Ar, workerSlug, workerHue }` per booking (no client-side repo access).
- Metadata: `title`/`description` from `booking.myBookings`.

**`BookingsClient` (client):**
- Tabs **Upcoming** (`requested | pendingPayment | confirmed | inProgress`) / **Past** (`completed | cancelled | declined | noShow`) with counts — `ui/tabs` as in `ProfileTabs`.
- Signed-out **and** no phone param → guest lookup card: `<form method="get">` with an `Input name="phone"` (placeholder `booking.guestLookupPlaceholder`) + submit `booking.guestLookup`. This is a plain GET form — no server action needed; the page re-renders server-side with `?phone=`.
- `booking.guestLookupNone` empty state when `?phone=` returned nothing.
- Empty (signed-in, no bookings): `booking.empty` / `booking.emptyBody` with a CTA to `/search`.

**`BookingRow`:**
- Left: worker avatar (hue) + localized name linked to `/workers/{slug}` (`booking.viewWorker`), booking number (`booking.bookingNumber` + `b.number`), localized `startAt` datetime.
- `BookingStatusBadge` on the right; `jobTitle` + service name if present; `quote` shown with `Price` (÷100) when set.
- Expandable audit trail (chevron): the last 3 `events` — `booking.status.*` label + `timeAgo` — a cheap trust signal reusing existing data, no new fields.

---

## 6. i18n — `booking.*` dictionary (EN + AR, ready to paste)

Add to **both** `src/lib/i18n/translations/en.ts` and `ar.ts` (parity is compile-time: `ar: Dictionary = typeof en` + the i18n test). `{name}`/`{worker}` placeholders follow the existing `.replace("{x}", …)` convention.

### English

```ts
booking: {
  dialogTitle: "Request a booking",
  dialogSubtitle: "Pick a service and choose a time that works for you.",
  stepService: "What do you need?",
  stepSlot: "Pick a time",
  stepDetails: "Your details",
  customJob: "Describe the job yourself",
  jobTitle: "Job title",
  jobTitlePlaceholder: "e.g. Fix leaking kitchen sink",
  jobNote: "Notes for the worker (optional)",
  jobNotePlaceholder: "Describe the job, location, materials…",
  chooseService: "Choose a service",
  chooseServiceHint: "Optional — picking a service fills in the job title.",
  slot: "Available times",
  slotEmpty: "No available times in the next 14 days",
  slotEmptyBody: "Try calling {name} directly.",
  slotTaken: "That time was just taken",
  slotTakenBody: "Another customer booked it first — please pick a different time.",
  name: "Your name",
  phone: "Phone number",
  email: "Email (optional)",
  emailHint: "For booking updates.",
  send: "Send booking request",
  sending: "Sending…",
  success: "Request sent!",
  successBody: "The worker will respond soon — you'll be notified at every step.",
  viewBookings: "View my bookings",
  conflict: "This time is no longer available",
  status: {
    requested: "Waiting for response",
    pendingPayment: "Payment required",
    confirmed: "Confirmed",
    inProgress: "In progress",
    completed: "Completed",
    cancelled: "Cancelled",
    declined: "Declined",
    noShow: "No-show",
  },
  myBookings: "My bookings",
  myBookingsSubtitle: "Track your requests and confirmed jobs.",
  upcoming: "Upcoming",
  past: "Past",
  empty: "No bookings yet",
  emptyBody: "Request a booking on a worker's profile and it will appear here.",
  guestLookupTitle: "Find your bookings",
  guestLookupBody: "Enter the phone number you used when booking.",
  guestLookupPlaceholder: "+966 5x xxx xxxx",
  guestLookup: "Find my bookings",
  guestLookupNone: "No bookings found for this number.",
  bookingWith: "Booked with",
  bookingNumber: "Booking",
  viewWorker: "View profile",
  today: "Today",
  tomorrow: "Tomorrow",
  inDays: "in {days} days",
}
```

### العربية

```ts
booking: {
  dialogTitle: "اطلب حجزاً",
  dialogSubtitle: "اختر الخدمة وحدد الوقت المناسب لك.",
  stepService: "ماذا تحتاج؟",
  stepSlot: "اختر الوقت",
  stepDetails: "بياناتك",
  customJob: "صف المهمة بنفسك",
  jobTitle: "عنوان المهمة",
  jobTitlePlaceholder: "مثال: إصلاح تسريب حوض المطبخ",
  jobNote: "ملاحظات للعامل (اختياري)",
  jobNotePlaceholder: "صف المهمة والموقع والخامات…",
  chooseService: "اختر خدمة",
  chooseServiceHint: "اختياري — اختيار خدمة يملأ عنوان المهمة تلقائياً.",
  slot: "المواعيد المتاحة",
  slotEmpty: "لا توجد مواعيد متاحة خلال ١٤ يوماً",
  slotEmptyBody: "جرّب الاتصال بـ{name} مباشرة.",
  slotTaken: "هذا الموعد حُجز للتو",
  slotTakenBody: "حجزه عميل آخر أولاً — اختر وقتاً مختلفاً.",
  name: "اسمك",
  phone: "رقم الهاتف",
  email: "البريد الإلكتروني (اختياري)",
  emailHint: "لمتابعة تحديثات الحجز.",
  send: "إرسال طلب الحجز",
  sending: "جارٍ الإرسال…",
  success: "تم إرسال الطلب!",
  successBody: "سيرد العامل قريباً — سنخطرك في كل خطوة.",
  viewBookings: "عرض حجوزاتي",
  conflict: "هذا الموعد غير متاح حالياً",
  status: {
    requested: "بانتظار الرد",
    pendingPayment: "الدفع مطلوب",
    confirmed: "مؤكد",
    inProgress: "قيد التنفيذ",
    completed: "مكتمل",
    cancelled: "ملغي",
    declined: "مرفوض",
    noShow: "لم يحضر",
  },
  myBookings: "حجوزاتي",
  myBookingsSubtitle: "تابع طلباتك والمهام المؤكدة.",
  upcoming: "القادمة",
  past: "السابقة",
  empty: "لا توجد حجوزات بعد",
  emptyBody: "اطلب حجزاً من ملف أي عامل وسيظهر هنا.",
  guestLookupTitle: "ابحث عن حجوزاتك",
  guestLookupBody: "أدخل رقم الهاتف الذي استخدمته عند الحجز.",
  guestLookupPlaceholder: "+966 5x xxx xxxx",
  guestLookup: "ابحث عن حجوزاتي",
  guestLookupNone: "لا توجد حجوزات مطابقة لهذا الرقم.",
  bookingWith: "حجز مع",
  bookingNumber: "الحجز",
  viewWorker: "عرض الملف",
  today: "اليوم",
  tomorrow: "غداً",
  inDays: "بعد {days} أيام",
}
```

### 6.1 Fix the notification-label gap (found during planning)

`src/app/notifications/page.tsx:65` renders `t(\`notifications.types.${n.type}\`)`, but M1 extended the type union/DB enum **without** adding the 6 booking labels — booking notifications currently render raw keys like `notifications.types.bookingRequest`. Add to `notifications.types` in **both** dictionaries:

```ts
// en
bookingRequest: "Booking request",
bookingConfirmed: "Booking confirmed",
bookingDeclined: "Booking declined",
bookingCancelled: "Booking cancelled",
bookingReminder: "Booking reminder",
bookingCompleted: "Booking completed",
```
```ts
// ar
bookingRequest: "طلب حجز",
bookingConfirmed: "تأكيد الحجز",
bookingDeclined: "رفض الحجز",
bookingCancelled: "إلغاء الحجز",
bookingReminder: "تذكير بالحجز",
bookingCompleted: "اكتمال الحجز",
```

---

## 7. States to handle explicitly (mirror renewal/verification flows)

- **Busy states** on every action button (Loader2 spin + disabled) — prevents double-submits on the same slot.
- **Conflict race** — two customers open the same profile; the second submit gets `error: "slot-taken"`. Show the banner, `router.refresh()` for fresh slots, never toast success.
- **Empty slots** — dialog still allows the existing phone/WhatsApp fallthrough; don't trap the user in a dead-end dialog.
- **Guest vs signed-in** — booking works for guests (matches today's lead form); `/bookings` history is email/phone-keyed per `getCustomerBookings`. M3 (deposits/refunds) will require sign-in — flag in the open decisions of booking-scheduling.md.
- **RTL** — logical utilities only (`ms/me`, `start/end`, `ps/pe`), same as the rest of the app.
- **Quote display** — divide minor units by 100 before `Price`; never show raw ×100 values.

---

## 8. Wiring checklist (when implementing)

1. ✅ `booking.*` + `notifications.types.*` keys added to `en.ts` and `ar.ts` (§6) — i18n parity test passes.
2. ✅ `requestBookingAction` revalidates `/bookings`.
3. ✅ `CUSTOMER_BOOKINGS_HREF` flipped to `/bookings`; `tests/bookings.test.ts` updated.
4. ✅ `DAYS_EN`/`DAYS_AR` extracted to `src/lib/utils.ts` (profile-tabs + SlotPicker share them).
5. ✅ `ContactCard` — primary "Request booking" button opening `BookingDialog`; lead textarea demoted to outline secondary.
6. ✅ `ServicePicker` sends `nameEn` (the server resolves `serviceItem` by `nameEn`).
7. ⏳ Optional: `/bookings` header nav link — not added (notifications + dialog success state already link to it).

---

## 9. Tests

| Test | Scope |
|---|---|
| ✅ `tests/bookings.test.ts` | Deep-link href flipped to `/bookings` — passing |
| ✅ `tests/i18n.test.ts` | Parity auto-covers the new `booking.*` + `notifications.types` keys — passing |
| ✅ `tests/booking-ui.test.ts` (new) | Pure-logic tests for `groupSlotsByDay` / `dayLabel` / `formatSlotRange` / `formatDayDate` (node env, no jsdom) — 15 passing |
| E2E (when worker-dashboard panel lands) | Request → worker accepts → both see status + notification; conflict path in EN + AR |

---

## 10. Backlog updates

- `docs/PRODUCT.md` §3.2 booking item — note the customer UI plan (link this doc) next to the worker-dashboard plan.
- `README.md` docs table — add this doc.
- When implemented: mark the `/bookings` page and dialog in the M1 exit criteria of `docs/booking-scheduling.md`.
