-- ────────────────────────────────────────────────────────────────────────────
-- Booking settlement — the take rate becomes collected money
-- (docs/booking-take-rate.md §6, src/lib/data/booking-settlement.ts)
-- ────────────────────────────────────────────────────────────────────────────
-- The job value reached the platform through ONE leg only: the optional
-- deposit. `creditEarnings` nevertheless credited `quote − platformFee` to the
-- worker's withdrawable balance at COMPLETED, so a quote-only job accrued a
-- payout the platform had never received — an approved payout paid it out of
-- platform funds. This migration adds what the engine needs to stop that:
--
--   • settlementPaymentId — a SECOND, uniquely-linked Payment row for the
--     balance collected after the job (same OMT/Whish manual rails as the
--     deposit: a reference, then an admin confirms receipt).
--   • settledOutside / settledOutsideAt — the explicit "the parties settled
--     between themselves" flag. The platform then credits nothing and carries
--     its fee as a claim instead of an accrual.
--   • BookingStatus.SETTLED — an audit-event-only status (same pattern as
--     RESCHEDULED / MESSAGE / REFUNDED) so the settlement lands on the
--     booking's trail and the dispute view shows it.
--
-- No backfill on purpose. Existing rows keep settledOutside = false and no
-- settlement payment, and `settlementFor()` derives their state from the
-- deposit they already have: a booking whose paid deposit covered its quote is
-- "funded" and credits exactly what it credited before, while one whose deposit
-- was smaller (or absent) now reads as unfunded until the balance is collected
-- — which is the correction, not a regression.

ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'SETTLED';

ALTER TABLE "Booking" ADD COLUMN "settledOutside" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Booking" ADD COLUMN "settledOutsideAt" TIMESTAMP(3);
ALTER TABLE "Booking" ADD COLUMN "settlementPaymentId" TEXT;

CREATE UNIQUE INDEX "Booking_settlementPaymentId_key" ON "Booking"("settlementPaymentId");

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_settlementPaymentId_fkey"
  FOREIGN KEY ("settlementPaymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
