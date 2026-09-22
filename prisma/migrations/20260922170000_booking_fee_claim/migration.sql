-- ────────────────────────────────────────────────────────────────────────────
-- Outside-platform fee claims become collectable
-- (docs/booking-take-rate.md §6, src/lib/data/booking-settlement.ts)
-- ────────────────────────────────────────────────────────────────────────────
-- When the parties settle directly, the platform holds nothing: it credits the
-- worker nothing and carries its fee as a CLAIM (settlementFor →
-- "outside-platform"). A claim is only worth recording if it can be collected,
-- and the balance the platform actually holds for that worker is their prepaid
-- credit balance — so a claim is collected in tranches by debiting credits
-- (`feeClaimPlan` decides how much a given balance can absorb).
--
-- These two columns record that collection:
--   • feeClaimCollectedMinor — how much of the claim has been collected so far.
--     Also the CAS guard for the trance: a collection only lands if the value it
--     read is still the value on the row, so two admins cannot double-collect.
--   • feeClaimCollectedAt — when the most recent collection happened.
--
-- No backfill: every existing row has collected nothing, which is exactly what
-- the default says, and settlementFor() reads the pair to report what is still
-- outstanding.

ALTER TABLE "Booking" ADD COLUMN "feeClaimCollectedMinor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Booking" ADD COLUMN "feeClaimCollectedAt" TIMESTAMP(3);
