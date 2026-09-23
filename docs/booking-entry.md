# Booking entry links — a share that lands on a filled-in booking (`docs/ENHANCEMENT-PLAN.md` Phase 2)

A Worker profile link is a dead end for the person who receives it: they still have
to pick a service, pick a time, and trust that the worker is the one they were told
about. A **booking entry link** carries that intent in the URL, so the recipient
lands on the profile with the booking dialog already open on the right service and
the right slot.

Three surfaces use it:

| Surface | What it carries | Why |
| --- | --- | --- |
| **Recommend** (worker profile, `ContactCard`) | Worker + their first published service | The recommendation loop: a customer who had a good job done hands the worker to whoever needs one next |
| **WhatsApp share** | Same, via `wa.me/?text=…` | The share entry point, not a chat with the worker |
| **Worker-authored links** (`?book=` / `?slot=`) | Any service, any available slot | Quoting, follow-ups, QR codes, campaigns |

## The URL

```
/{locale}/workers/{slug}?book={serviceNameEn}&slot={slotId}&src={source}
```

- `book` — a service `nameEn` from **this** worker's catalog. `nameEn` is the join
  key the booking payload already carries, so the string in the link is the same
  string the booking is created with.
- `slot` — a slot id from this worker's availability window.
- `src` — free-form provenance (`whatsapp`, `share`, `qr`, …), trimmed and capped
  at 32 characters. Nothing is attributed on it yet; it exists so the links that
  actually produce bookings can be measured later.

Both `book` and `slot` are optional. `?src=whatsapp` alone is a valid link: the
profile opens normally, and the source is available for analytics.

## Resolution is server-side and the link is never trusted

`resolveBookingEntry({ service, slotId, source, services, slots, now })`
(`src/lib/data/booking-entry.ts`) turns the raw query into a `BookingEntryIntent`,
using the catalog and availability window the page is already rendering. It never
throws and never rejects a link outright — a chat thread can be weeks old:

- `unknown-service` — the service is not on this worker's catalog (they withdrew
  it, or the link was edited). The service is dropped.
- `slot-unavailable` — the slot exists but is `RESERVED`/`BOOKED`/`BLOCKED`, or
  its start time is malformed.
- `slot-past` — the slot is available but has already started.

Those land in `dropped: { reason }`; everything else survives, and the dialog opens
anyway with whatever could be honoured. `empty: true` means the link asked for
nothing resolvable (or nothing at all — `EMPTY_ENTRY` for a plain visit), and the
dialog simply does not self-open.

The dialog (`BookingDialog`) opens once, on mount, and only from a resolved entry:
it runs the normal `openDialog()` reset (including the live-slot refresh) and then
applies the service and slot. It is mount-only on purpose — re-running it on every
render would fight the customer's own edits. A prefilled slot jumps straight to the
**details** step, because the choice it would otherwise ask for is already made.

## Absolute, or it is not a share

A WhatsApp message needs an absolute URL. `NEXT_PUBLIC_APP_URL` is inlined at build
time, so a deployed render produces the real link on the server. It is a
build-time constant, though: a Vercel preview URL, or a local dev server on a port
`.env` does not name, would send the recipient to a host that does not answer. So
`ContactCard` keeps the configured origin as its first paint (hydration sees one
value) and then adopts `window.location.origin` on mount — the browser's own origin
is always the one that works.

## Verified

- `tests/booking-entry.test.ts` — the pure engine: each drop reason, the
  service-and-slot round trip, `src` trimming/capping, the empty-link case.
- `tests/booking-dialog.test.tsx` — the dialog half: a service-only entry opens on
  the slot step with the service set; a slot entry opens on details; a stale entry
  opens with the stale part dropped; a plain visit does not open.
- Live in the dev preview: opening
  `/en/workers/omar-al-mutairi-ac-technician?book=AC%20maintenance&slot=slot-omar-11&src=whatsapp`
  opens the dialog on **Your details**, and the profile's Recommend button carries
  the browser's own origin.
