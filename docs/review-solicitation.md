# Review solicitation — ask at the moment the customer is happiest (`docs/ENHANCEMENT-PLAN.md` Phase 2)

Reviews are what the marketplace runs on: they are what search ranks by, what the
trade × city landing pages promise, and what the next customer reads before
booking. The moment a job completes is the only moment the customer has both the
experience and the goodwill to write one — so that is when we ask.

The feature is a pure decision (`solicitationDecision` in
`src/lib/data/review-solicitation.ts`) plus a prompt on the customer's bookings.

## The rules, and the silences that matter

| Situation | Behaviour | Why |
| --- | --- | --- |
| Booking is `completed` | **Ask** (`stage: "first"`) | The job just finished |
| `completed` ≥ 3 days ago and still unreviewed | **Remind once** (`stage: "reminder"`) | One follow-up, never a stream |
| ≥ 30 days after completion | **Silence** (`window-passed`) | A job from last season is not fresh, and a stale prompt is the nag |
| The customer already reviewed that worker | **Silence** (`already-reviewed`) | The prompt stops when the action is taken — not when a dismiss is clicked |
| Status is anything but `completed` | **Silence** (`not-completed`) | A cancelled or disputed job is not a satisfied customer |
| No completion event / unparseable / future timestamp | **Silence** (`unknown-completion`) | A job we cannot date is a job we cannot ask about; clock skew must not manufacture one |

Inside the window the prompt escalates **once**. Everything is injectable
(`now`, `completedAt`, `hasReview`) so the boundaries are testable.

## "Already reviewed" counts a review that is still in the moderation queue

A review lands **pending** — an admin publishes it. If the ask were keyed on the
worker's public `reviews` list (approved-only), a customer who wrote a review
would keep being asked until somebody approved it. So the ask reads its own seam,
`getReviewedWorkerIdsForCustomer(userId)`, which is **pending-inclusive** in both
adapters (`Review.authorId` is the join key; the demo store now records it too,
matching the schema's `@@unique([workerId, authorId])`). One read for the whole
page, instead of one per row.

## Verified purchase is computed, not claimed

`submitReviewAction` used to hard-code `verifiedPurchase: false`, which quietly
made a lie of every surface that says reviews come from customers who completed a
booking — including the landing pages this same phase added. It is now derived
from the reviewer's own bookings with that worker, so a stranger's review is
still allowed but is **not** presented as a verified purchase.

## Where the customer sees it

A prompt at the top of `/bookings` for signed-in customers, at most
`MAX_SOLICITATIONS = 3` at a time, each one naming the worker **and** the job
("Your 'Leak repair' is done — how did Khaled do?") with one button to the review
form and one "Not now".

"No now" is **session-local** and nothing is written to a server: because the
prompt already stops for good once the review exists, a stored dismissal would
add only something the platform cannot honour — a banner that never returns
despite a job that still has no review. Guests are not prompted at all: a review
needs an author to attribute.

## Verified

- `tests/review-solicitation.test.ts` — 14 cases on the engine: the boundary at
  the reminder and at the window edge, every silence including malformed and
  future completion times, singular/plural and both languages of the copy, the
  ranking (reminder first, then newest) and its stability.
- `tests/review-solicitation-prompt.test.tsx` — 5 cases on the prompt: the copy,
  the review link with **exactly one** locale prefix, Arabic, "Not now" hiding
  only its own card, and rendering nothing when there is nothing to ask.
- `tests/review-solicitation-flow.test.ts` — 3 integration cases that drive the
  **real** lifecycle (`respond → inProgress → completed → customer confirm`) and
  then assert: a just-completed job asks (`stage: "first"`), a job completed 45
  days ago does not (`window-passed`, read from real rows), the ask disappears
  after a review that is still **pending**, and the review is a verified purchase
  only for the worker the customer actually booked.
