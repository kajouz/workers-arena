-- AlterTable
-- Add a friendly device label (e.g. "Chrome 126 · macOS") captured from the
-- registering client's User-Agent, surfaced in the admin subscription view.
ALTER TABLE "PushSubscription" ADD COLUMN     "device" TEXT;
