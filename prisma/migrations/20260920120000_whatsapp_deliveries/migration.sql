-- WhatsApp delivery audit ledger: one row per automated WhatsApp send, advanced
-- by Meta status webhooks (sent/delivered/read/failed) and bounded retries.
-- Engine: src/lib/data/whatsapp-deliveries.ts · store: whatsapp-delivery-store.ts
CREATE TABLE "WhatsAppDelivery" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "recipientPhone" TEXT,
  "workerId" TEXT,
  "locale" TEXT,
  "notificationType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB,
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "lastEvent" JSONB,
  "nextRetryAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppDelivery_pkey" PRIMARY KEY ("id")
);

-- Meta keys its status callbacks off the wamid — unique so lookup is O(1).
-- (NULLs are allowed and never unique-conflict in Postgres.)
CREATE UNIQUE INDEX "WhatsAppDelivery_providerMessageId_key" ON "WhatsAppDelivery"("providerMessageId");

CREATE INDEX "WhatsAppDelivery_status_nextRetryAt_idx" ON "WhatsAppDelivery"("status", "nextRetryAt");
CREATE INDEX "WhatsAppDelivery_kind_createdAt_idx" ON "WhatsAppDelivery"("kind", "createdAt");
CREATE INDEX "WhatsAppDelivery_workerId_idx" ON "WhatsAppDelivery"("workerId");
