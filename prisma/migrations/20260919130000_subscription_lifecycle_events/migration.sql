-- Phase 3: durable subscription lifecycle events for retention and cohort reporting.
CREATE TABLE "SubscriptionEvent" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "type" TEXT NOT NULL,
  "fromPlan" TEXT,
  "toPlan" TEXT,
  "periodDays" INTEGER,
  "amount" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "source" TEXT NOT NULL DEFAULT 'system',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionEvent_workerId_createdAt_idx" ON "SubscriptionEvent"("workerId", "createdAt");
CREATE INDEX "SubscriptionEvent_type_createdAt_idx" ON "SubscriptionEvent"("type", "createdAt");
CREATE INDEX "SubscriptionEvent_toPlan_createdAt_idx" ON "SubscriptionEvent"("toPlan", "createdAt");

ALTER TABLE "SubscriptionEvent"
  ADD CONSTRAINT "SubscriptionEvent_workerId_fkey"
  FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscriptionEvent"
  ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
