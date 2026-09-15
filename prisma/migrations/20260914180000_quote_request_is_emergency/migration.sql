-- §12 / §7 — the emergency flag on the REQUEST (docs/lead-marketplace.md).
-- Additive with a default, so existing quote requests read back as non-emergency
-- exactly as they behaved before (the flag was previously dropped at creation).
ALTER TABLE "QuoteRequest" ADD COLUMN "isEmergency" BOOLEAN NOT NULL DEFAULT false;
