-- §2.3 customer-confirms-completion — a worker's "completed" flip is staged as
-- COMPLETION_PENDING until the customer confirms (or the grace cron
-- auto-confirms). Two new notification kinds for the confirmation prompt and
-- the confirmed flip, plus the Booking.completionPendingAt stamp the grace
-- cron keys on.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'COMPLETION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_COMPLETION_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BOOKING_COMPLETION_CONFIRMED';
ALTER TABLE "Booking" ADD COLUMN "completionPendingAt" TIMESTAMP(3);
