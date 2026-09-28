-- ────────────────────────────────────────────────────────────────────────────
-- Payment receipts (revenue plan Step 3 — faster manual confirmation)
-- ────────────────────────────────────────────────────────────────────────────
-- The payer photographs their OMT/Whish receipt on the signed instructions
-- page, so an admin can confirm a manual payment at a glance. One receipt per
-- payment reference (re-uploading replaces it). Keyed on the reference — the
-- unique OMT-/WHISH- code every manual payment carries (Payment.providerRef) —
-- so booking deposits, job balances, campaigns and worker purchases all work
-- the same way. The image is a compressed JPEG/PNG/WebP data URL (capped at
-- ~600 KB); moving it to object storage later only changes this table.
-- ────────────────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "dataUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_reference_key" ON "PaymentReceipt"("reference");
