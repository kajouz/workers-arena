# WorkersArena Guarantee (revenue plan Step 5)

**The promise:** jobs booked **and paid** through WorkersArena are covered. If the work
is faulty and the customer reports it within **7 days** of completion, we send a worker
back to fix it or refund up to **$100**. Cash jobs are not covered.

It is the customer's reason to pay on the platform, so it only covers money the platform
holds.

## Rules (`src/lib/data/guarantee-terms.ts`, pure)

- The job is `completed`, and its settlement (`booking-settlement.ts`) is `funded` (or
  `overpaid`). Jobs settled outside the platform, unpaid, or quote-less are not covered.
- The window is 7 days from the latest COMPLETED event.
- The cover is `min($100, collected)`. A refund must be more than 0 and no more than the
  cover.
- Terms are constants in `GUARANTEE_TERMS`, used by the copy, the checks and the tests.

## Flow

1. **Customer:** `/bookings` shows the guarantee on each completed job, with
   "Report a problem" while covered and "not covered" for cash jobs. Filing
   (`fileGuaranteeClaimAction`) re-checks coverage on the server; one claim per booking.
2. **Admin:** open claims appear at the top of `/admin`; the full queue with recent
   decisions is `/admin/guarantee`. Each claim is resolved once, as *send worker back*,
   *refund $X*, or *reject*, with an optional note the customer sees. The decision uses a
   compare-and-swap on `status = open`.
3. **Refund payout:** paid manually by OMT/Whish, like other manual payments. The claim
   records the decision and amount.

Storage: the `GuaranteeClaim` table (migration `20260929120000_guarantee_claims`), with a
demo in-memory store when there's no database.

## Where it's advertised

The profile contact card, the trade/area landing pages (a strip and an FAQ answer), and the
booking row.
