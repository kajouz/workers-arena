-- Prepaid wallet (revenue plan Step 2, part 2): a purchase paid from the
-- worker's wallet (the PAID credit pot) instead of OMT/Whish. The money came
-- in through a top-up, so a WALLET payment is not new cash: the manual-payment
-- queue and the reconciliation read only OMT/WHISH and never count it twice.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'WALLET';
