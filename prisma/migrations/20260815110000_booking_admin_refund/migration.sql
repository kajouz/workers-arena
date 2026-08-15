-- Admin deposit refund (ENHANCEMENT-PLAN §2.4 dispute view): a refunded deposit
-- leaves an audit-only REFUNDED BookingEvent on the trail (the booking itself
-- keeps its current status — the refund is a money action, not a transition).
-- Postgres enum ALTER — add the new member before the closing paren.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
