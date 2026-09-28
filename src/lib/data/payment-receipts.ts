/**
 * ────────────────────────────────────────────────────────────────────────────
 * PAYMENT RECEIPTS — revenue plan Step 3 (faster manual confirmation)
 * ────────────────────────────────────────────────────────────────────────────
 * OMT/Whish have no webhook: an admin confirms every manual payment by hand.
 * The payer photographs their receipt on the signed instructions page, and
 * the admin's pending-payments card shows it, so a payment can be confirmed
 * at a glance instead of by chasing the reference through a statement.
 *
 * One receipt per payment REFERENCE (the unique OMT-/WHISH- code the payer
 * was told to quote — Payment.providerRef), so deposits, job balances,
 * campaigns and worker purchases all work the same way. Re-uploading replaces
 * it. Who may upload is decided by the caller (the signed instructions link);
 * this module only validates and stores.
 *
 * The image is kept as a compressed data URL (the browser shrinks it before
 * upload). Only JPEG / PNG / WebP, capped at MAX_RECEIPT_BYTES, and the bytes
 * must actually start with that format's signature.
 */

export const MAX_RECEIPT_BYTES = 600 * 1024;
const MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ReceiptMimeType = (typeof MIME_TYPES)[number];

export interface PaymentReceipt {
  reference: string;
  provider: "OMT" | "WHISH";
  mimeType: ReceiptMimeType;
  sizeBytes: number;
  dataUrl: string;
  uploadedAt: string;
}

export type ReceiptImageError = "not-an-image" | "unsupported-type" | "too-large" | "empty";

/** Leading bytes of each accepted format (WebP: "RIFF" … "WEBP"). */
function signatureMatches(mime: ReceiptMimeType, bytes: Uint8Array): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  );
}

/** Validate an uploaded receipt data URL. Pure. */
export function parseReceiptImage(
  dataUrl: string
): { ok: true; mimeType: ReceiptMimeType; sizeBytes: number } | { ok: false; error: ReceiptImageError } {
  const match = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]*)$/.exec(dataUrl ?? "");
  if (!match) return { ok: false, error: "not-an-image" };
  const mime = match[1] as ReceiptMimeType;
  if (!MIME_TYPES.includes(mime)) return { ok: false, error: "unsupported-type" };
  const base64 = match[2]!;
  if (base64.length === 0) return { ok: false, error: "empty" };
  // Size from the encoding before decoding, so an oversized upload is refused
  // without allocating it.
  const sizeBytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0);
  if (sizeBytes > MAX_RECEIPT_BYTES) return { ok: false, error: "too-large" };
  const head = Buffer.from(base64.slice(0, 24), "base64");
  if (!signatureMatches(mime, head)) return { ok: false, error: "not-an-image" };
  return { ok: true, mimeType: mime, sizeBytes };
}

/* ───────────────────────────── Adapter selection ───────────────────────────── */

function realReceiptsEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

async function prisma() {
  return (await import("@/lib/server/prisma")).getPrisma();
}

const GLOBAL_KEY = "__workersArenaPaymentReceipts";
const g = globalThis as Record<string, unknown>;
const STORE: Map<string, PaymentReceipt> =
  (g[GLOBAL_KEY] as Map<string, PaymentReceipt> | undefined) ?? (g[GLOBAL_KEY] = new Map<string, PaymentReceipt>());

/** Reset the demo store (tests). */
export function resetPaymentReceiptStore(): void {
  STORE.clear();
}

/* ─────────────────────────────── Public API ─────────────────────────────── */

/** Store (or replace) the receipt for a payment reference. */
export async function savePaymentReceipt(input: {
  reference: string;
  provider: "OMT" | "WHISH";
  dataUrl: string;
  at?: string;
}): Promise<{ ok: true; receipt: PaymentReceipt } | { ok: false; error: ReceiptImageError }> {
  const parsed = parseReceiptImage(input.dataUrl);
  if (!parsed.ok) return parsed;
  const receipt: PaymentReceipt = {
    reference: input.reference,
    provider: input.provider,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
    dataUrl: input.dataUrl,
    uploadedAt: input.at ?? new Date().toISOString(),
  };
  if (realReceiptsEnabled()) {
    const data = {
      provider: receipt.provider,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      dataUrl: receipt.dataUrl,
      uploadedAt: new Date(receipt.uploadedAt),
    };
    await (await prisma()).paymentReceipt.upsert({
      where: { reference: receipt.reference },
      create: { reference: receipt.reference, ...data },
      update: data,
    });
  } else {
    STORE.set(receipt.reference, receipt);
  }
  return { ok: true, receipt };
}

/** The receipt for a payment reference, with its image. */
export async function getPaymentReceipt(reference: string): Promise<PaymentReceipt | null> {
  if (!reference) return null;
  if (realReceiptsEnabled()) {
    const row = await (await prisma()).paymentReceipt.findUnique({ where: { reference } });
    return row
      ? {
          reference: row.reference,
          provider: row.provider as PaymentReceipt["provider"],
          mimeType: row.mimeType as ReceiptMimeType,
          sizeBytes: row.sizeBytes,
          dataUrl: row.dataUrl,
          uploadedAt: row.uploadedAt.toISOString(),
        }
      : null;
  }
  return STORE.get(reference) ?? null;
}

/** The admin queue with each payment's receipt upload time attached, oldest
 * payment first (Step 3: the longest wait is the first one to clear). */
export async function withReceiptTimes<T extends { reference: string; createdAt: string; receiptUploadedAt?: string }>(
  payments: T[]
): Promise<T[]> {
  const times = await receiptUploadTimes(payments.map((p) => p.reference));
  return payments
    .map((p) => (times.has(p.reference) ? { ...p, receiptUploadedAt: times.get(p.reference) } : p))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** When each of these references' receipt was uploaded (no image data). */
export async function receiptUploadTimes(references: string[]): Promise<Map<string, string>> {
  const refs = [...new Set(references.filter(Boolean))];
  if (refs.length === 0) return new Map();
  if (realReceiptsEnabled()) {
    const rows = await (await prisma()).paymentReceipt.findMany({
      where: { reference: { in: refs } },
      select: { reference: true, uploadedAt: true },
    });
    return new Map(rows.map((r) => [r.reference, r.uploadedAt.toISOString()]));
  }
  return new Map(refs.flatMap((r) => (STORE.has(r) ? [[r, STORE.get(r)!.uploadedAt] as const] : [])));
}
