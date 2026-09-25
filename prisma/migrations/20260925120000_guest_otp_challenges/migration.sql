-- ────────────────────────────────────────────────────────────────────────────
-- Guest phone OTP challenges (docs/ENHANCEMENT-PLAN.md — guest phone OTP)
-- ────────────────────────────────────────────────────────────────────────────
-- Guests book with a phone and no account; this table backs the verification
-- step that makes "phone-keyed" mean "phone-verified". One live challenge per
-- handset (phone UNIQUE): re-sending replaces the row, so there is no way to
-- accumulate parallel challenges for one number. The code is stored only as an
-- HMAC-SHA-256 hash — a database leak yields no usable codes. `attempts`
-- counts wrong guesses; past the cap the challenge is dead regardless of
-- expiry (verified against it in the read path).
--
-- CREATE TABLE (not CREATE TYPE/ENUM): the demo adapter mirrors the same
-- shape in memory (src/lib/data/guest-otp.ts), and CI's nightly-live-db job
-- applies this file with `prisma migrate deploy` on a fresh service database.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE "GuestOtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestOtpChallenge_pkey" PRIMARY KEY ("id")
);

-- One live challenge per handset — the upsert target.
CREATE UNIQUE INDEX "GuestOtpChallenge_phone_key" ON "GuestOtpChallenge"("phone");

-- The sweeper (deleteExpiredOtpChallenges) scans by expiry.
CREATE INDEX "GuestOtpChallenge_expiresAt_idx" ON "GuestOtpChallenge"("expiresAt");
