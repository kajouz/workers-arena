-- §2.3 chat read receipts — when the OTHER party saw the thread. The field is
-- stamped server-side (markChatRead) on every message sent by the counterpart;
-- null = the recipient hasn't opened the thread yet.
ALTER TABLE "BookingMessage" ADD COLUMN "readAt" TIMESTAMP(3);
