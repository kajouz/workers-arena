-- CreateIndex
CREATE UNIQUE INDEX "Booking_recurringBookingId_startAt_key" ON "Booking"("recurringBookingId", "startAt");
