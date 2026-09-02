-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "contactDetailsReleasedAt" TIMESTAMP(3),
ADD COLUMN     "isEmergency" BOOLEAN NOT NULL DEFAULT false;
