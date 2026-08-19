-- Company preferred email language (en default): outbound campaign emails
-- render in it, and the /admin refund-email preview leads with it as the
-- primary block — mirroring NotificationRecipient.locale for bookings.
ALTER TABLE "Company" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en';
