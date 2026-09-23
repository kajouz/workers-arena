-- §Guest → account claim (src/lib/data/guest-claim.ts) — a phone-keyed guest
-- booking (and the quote job / recurring contract beside it) is linked to the
-- account that signed up with the same phone. `claimedAt` is the audit stamp:
-- null means "still a guest record", a timestamp means "linked on that date".
--
-- Nullable and unstamped by default, so every existing row keeps its current
-- meaning: nothing is claimed retroactively, and the only writer is the claim
-- run itself (registration / sign-in), which is idempotent.

ALTER TABLE "Booking" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "QuoteRequest" ADD COLUMN "claimedAt" TIMESTAMP(3);
ALTER TABLE "RecurringBooking" ADD COLUMN "claimedAt" TIMESTAMP(3);
