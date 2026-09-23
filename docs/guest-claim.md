# Guest → account claim — giving a phone-keyed booking a home

Phase 2 of the revenue plan (`docs/ENHANCEMENT-PLAN.md`). The product has always
let a signed-out customer book with a **name and a phone**. That booking is keyed
on the phone (`customerId` is null), it is managed from `/bookings?phone=…`, and
every notification reaches the customer by SMS or WhatsApp. It works, and it has
no future: the second purchase starts from zero, the history is invisible the
moment they sign in, and the only way back to it is remembering which number they
typed.

Demand-first growth needs the **second** purchase to be cheaper than the first.
A customer who cannot see their own history can never get there. This is the
claim that fixes it — `src/lib/data/guest-claim.ts` (pure) plus the seam in
`repo.ts` and the auth wiring in `src/app/actions/auth.ts`.

---

## 1. The rules (the engine)

| # | Rule | Why it is not negotiable |
|---|---|---|
| 1 | **The phone is the credential.** | It is the only thing the guest record was created with, and it is what the authz seam already accepts as guest proof. Normalized through the same `normalizePhone` the SMS/WhatsApp providers use, so `+961 70 123 456` and `+96170123456` are one identity — as they are one handset. |
| 2 | **An email alone never claims.** | Registration does not verify email. Treating a matching address as proof would let anyone claim a stranger's history by typing their address. An email-only match is *reported*, never acted on (`emailOnlyMatches`). |
| 3 | **The phone is also the candidacy test, and it comes first.** | A record made with a different number is not this customer's business at all — counting it as "owned elsewhere" would put every stranger's record in the tally (and leak its existence). Only phone-matched candidates are adjudicated. |
| 4 | **An owned record is never taken.** | If `customerId` already points at somebody else, the record is reported as `other-account` and left alone. The claim can fill a hole; it can never move a booking between people. |
| 5 | **Re-running is free.** | A record this account already owns is `already-owned`: no write, and **no re-stamp** — so signing in every day cannot rewrite the "linked on" date or re-notify anyone. |

The engine returns three lists (`claimable`, `alreadyOwned`, `foreign`) rather
than one number, because the three want different sentences on the surface and
only the middle one is a lie if collapsed.

## 2. What gets linked

The same three-column shape exists on bookings, quote jobs and recurring
contracts, so all three are claimed — a guest who posted a quote request should
not lose it by signing up:

| Record | Model | Claimed |
|---|---|---|
| Booking | `Booking` | ✅ |
| Quote request | `QuoteRequest` | ✅ |
| Recurring contract | `RecurringBooking` | ✅ |

Each carries `claimedAt` (migration `20260923120000_guest_claim`), stamped once.
Null means "still a guest record"; a timestamp means "linked on that date". That
column is also the surface's data source: nothing is stored twice, and the
`/bookings` banner is derived from the rows themselves.

## 3. Where it runs

`registerAction` (immediately after the `User` row is created, so the history is
there before the customer ever sees the dashboard) and `loginAction` (so a
returning guest who signs in rather than signing up is claimed too).

Both are **best-effort**: a failed claim logs and moves on. The sign-in is the
product; the claim is a convenience, the engine only ever links rows the account
can prove, and the next sign-in claims again because the operation is
idempotent.

## 4. The write is a compare-and-swap

`prismaClaimGuestHistory` gathers phone-matched candidates with the same
`REGEXP_REPLACE` normalization the `/bookings` lookup uses, plans them through the
engine, and writes with the guard **repeated in the WHERE clause**:

```
where: { id: { in: ids }, customerId: null, claimedAt: null }
```

Two claims racing on the same record therefore cannot both stamp it — the second
sees a row that no longer matches and writes nothing. The engine decides; the
database enforces.

## 5. The customer-facing half

`/bookings` now looks a signed-in customer up **by owner as well as by email**:

```
getCustomerBookings({ email, customerId: session.id })
```

That matters because a guest booking may carry no email at all — without the
owner branch, the claim would link a booking the customer still could not see.
The same identifier reaches the recurring lookup.

The page then states the outcome once, plainly:

> **2 bookings you made before you signed up are now linked to your account**
> Linked on 23 Sep 2026. They are found by the phone number on your account.

Failing silently would be worse than not claiming at all: a customer who spots an
unexplained booking on their list has been given a reason to distrust the
account, not a reason to come back.

## 6. Tests

| File | Locks |
|---|---|
| `tests/guest-claim.test.ts` | the five rules — normalized-phone matching, no email-only claims, the phone-first candidate order (a stranger's record is *not* counted), owned-record safety, idempotence, the empty-identity cases, and the near-miss reporter |
| `tests/guest-claim-demo.test.ts` | the seam against the real store: link → owner lookup → idempotent re-run keeps the original timestamp → a rival with the same phone is refused → the recurring contract is claimed too → a preview writes nothing |
| `npm run db:smoke` (§Guest claim) | the same lifecycle on live Postgres, including the compare-and-swap and the email-only refusal |

## See also

- [ENHANCEMENT-PLAN.md](ENHANCEMENT-PLAN.md) — where this sits in Phase 2
- [demand-growth.md](demand-growth.md) — instant booking, packages, benchmarks
- [booking-scheduling.md](booking-scheduling.md) — the booking model being claimed
- [BUSINESS-MODEL.md](BUSINESS-MODEL.md) — why retention is the cheapest revenue
