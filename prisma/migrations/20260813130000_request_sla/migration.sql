-- Request SLA (ENHANCEMENT-PLAN §2.2) — two new notification kinds for the
-- worker nudge and the auto-expired request, plus the Booking.lastSlaNudgeAt
-- idempotency marker for the nudge (the lastReminderSent CAS pattern).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_REQUEST_NUDGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_REQUEST_EXPIRED';
ALTER TABLE "Booking" ADD COLUMN "lastSlaNudgeAt" TIMESTAMP(3);
