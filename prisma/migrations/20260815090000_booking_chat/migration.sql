-- Booking chat (ENHANCEMENT-PLAN §2.3) — the customer ⇄ worker negotiation
-- thread keyed on Booking.id. One row per message, actor-stamped like audit
-- entries (senderRole + optional senderId), with an optional in-thread quote
-- (minor units). Cascade-deletes with the booking.
CREATE TABLE "BookingMessage" (
    "id"         TEXT NOT NULL,
    "bookingId"  TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderId"   TEXT,
    "text"       TEXT NOT NULL,
    "quote"      INTEGER,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookingMessage_bookingId_createdAt_idx" ON "BookingMessage"("bookingId", "createdAt");

ALTER TABLE "BookingMessage" ADD CONSTRAINT "BookingMessage_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
