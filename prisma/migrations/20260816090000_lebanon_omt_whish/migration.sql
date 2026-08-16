-- Lebanon-first launch: OMT (offline agent / OMT Intra money-mover) and
-- Whish (digital wallet + dual-currency Visa) join the PaymentMethod enum so
-- booking deposits, campaign purchases, subscription renewals and the paid
-- upgrades (verification / featured / emergency) can be paid through them.
-- Both are MANUAL methods: the customer pays offline and an admin confirms
-- receipt from the /admin pending-payments card (no provider webhook).
ALTER TYPE "PaymentMethod" ADD VALUE 'OMT';
ALTER TYPE "PaymentMethod" ADD VALUE 'WHISH';
