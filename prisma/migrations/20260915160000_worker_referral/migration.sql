-- AlterTable: add referral tracking to Worker
ALTER TABLE "Worker" ADD COLUMN "referredByWorkerId" TEXT;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_referredByWorkerId_fkey" FOREIGN KEY ("referredByWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
