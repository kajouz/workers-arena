-- ────────────────────────────────────────────────────────────────────────────
-- Prepaid wallet (revenue plan Step 2) — split the credit ledger into funds
-- ────────────────────────────────────────────────────────────────────────────
-- One balance, two pots: PAID credits are money the worker topped up through
-- OMT/Whish (the wallet — it pays for anything on the platform); FREE credits
-- were given (monthly allowance, promotions, referrals, pack bonuses) and buy
-- leads only. Each row says which pot it moves:
--   paid | free — a grant into, or a debit out of, that pot
--   any         — a lead purchase: free first, then paid
-- Balances stay DERIVED from the rows (src/lib/data/credit-ledger.ts).
--
-- Additive: one column with a default, then a backfill. Existing top-ups are
-- the only paid rows (their reason starts "Credit top-up:"); existing debits
-- were all lead purchases, so they become `any`. Everything else was given.
-- ────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE "WorkerCreditEntry" ADD COLUMN "fund" TEXT NOT NULL DEFAULT 'free';

-- Backfill
UPDATE "WorkerCreditEntry" SET "fund" = 'paid' WHERE "amount" > 0 AND "reason" LIKE 'Credit top-up:%';
UPDATE "WorkerCreditEntry" SET "fund" = 'any' WHERE "kind" = 'spend';
