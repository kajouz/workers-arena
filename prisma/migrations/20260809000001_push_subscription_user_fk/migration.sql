-- AlterTable
-- Add the production owner FK (nullable: demo/dev rows keep stamping the
-- non-FK `ownerId` column until NextAuth is wired — see docs/ARCHITECTURE.md).
ALTER TABLE "PushSubscription" ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
