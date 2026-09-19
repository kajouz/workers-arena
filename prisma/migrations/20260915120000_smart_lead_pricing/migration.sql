-- Phase 2: persist the multiplier and reason used to lock each lead price.
ALTER TABLE "LeadOffer" ADD COLUMN "pricingMultiplier" DOUBLE PRECISION;
ALTER TABLE "LeadOffer" ADD COLUMN "pricingReason" TEXT;
