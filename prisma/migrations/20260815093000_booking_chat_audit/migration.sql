-- §2.3 — chat messages land in the audit trail as audit-only events, so
-- negotiations are visible in the dispute timeline like every other action.
ALTER TYPE "BookingStatus" ADD VALUE 'MESSAGE';
