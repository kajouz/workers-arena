import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  MAX_RECEIPT_BYTES,
  getPaymentReceipt,
  parseReceiptImage,
  receiptUploadTimes,
  resetPaymentReceiptStore,
  withReceiptTimes,
} from "../src/lib/data/payment-receipts";
import { uploadPaymentReceiptAction } from "../src/app/actions/payment-receipts";
import { createPurchaseCheckout } from "../src/lib/data/repo";
import { resetPurchaseStore } from "../src/lib/data/purchases";
import { resetAdminActivityFeed } from "../src/lib/data/activity";

// Step 3 — the payer's receipt photo, uploaded from the signed OMT/Whish link.

const JPEG = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]).toString("base64");
const PNG = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]).toString("base64");
const FAKE_JPEG = "data:image/jpeg;base64," + Buffer.from("<script>alert(1)</script>").toString("base64");

let activityFile: string;
beforeEach(() => {
  resetPaymentReceiptStore();
  resetPurchaseStore();
  activityFile = path.join(tmpdir(), `receipts-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  vi.stubEnv("ADMIN_ACTIVITY_FILE", activityFile);
});
afterEach(async () => {
  await resetAdminActivityFeed();
  await rm(activityFile, { force: true }).catch(() => {});
  vi.unstubAllEnvs();
});

/** A genuine signed instructions link, as a worker's OMT renewal mints it. */
async function signedLink() {
  const checkout = await createPurchaseCheckout({
    workerSlug: "khaled-al-harbi-plumbing",
    scope: "verification",
    tier: "basic",
    method: "OMT",
  });
  const url = new URL(checkout!.url, "http://local");
  const q = (k: string) => url.searchParams.get(k);
  return { provider: q("provider"), paymentId: q("paymentId"), ref: q("ref"), amount: q("amount"), sig: q("sig") };
}

describe("parseReceiptImage", () => {
  it("accepts real JPEG and PNG bytes", () => {
    expect(parseReceiptImage(JPEG)).toMatchObject({ ok: true, mimeType: "image/jpeg" });
    expect(parseReceiptImage(PNG)).toMatchObject({ ok: true, mimeType: "image/png" });
  });

  it("refuses other types, a mislabelled file, an empty one and an oversized one", () => {
    expect(parseReceiptImage("data:image/svg+xml;base64,PHN2Zz4=")).toEqual({ ok: false, error: "unsupported-type" });
    expect(parseReceiptImage(FAKE_JPEG)).toEqual({ ok: false, error: "not-an-image" });
    expect(parseReceiptImage("data:image/jpeg;base64,")).toEqual({ ok: false, error: "empty" });
    expect(parseReceiptImage("not a data url")).toEqual({ ok: false, error: "not-an-image" });
    const big = "data:image/jpeg;base64,/9j/" + "A".repeat(Math.ceil((MAX_RECEIPT_BYTES * 4) / 3) + 8);
    expect(parseReceiptImage(big)).toEqual({ ok: false, error: "too-large" });
  });
});

describe("uploadPaymentReceiptAction", () => {
  it("stores the photo for the signed link's reference, and a re-upload replaces it", async () => {
    const link = await signedLink();
    const first = await uploadPaymentReceiptAction(link, JPEG);
    expect(first.ok).toBe(true);
    expect((await getPaymentReceipt(link.ref!))?.mimeType).toBe("image/jpeg");

    await uploadPaymentReceiptAction(link, PNG);
    expect((await getPaymentReceipt(link.ref!))?.mimeType).toBe("image/png");
  });

  it("refuses a tampered link — a receipt can only attach to the payment it was minted for", async () => {
    const link = await signedLink();
    expect(await uploadPaymentReceiptAction({ ...link, ref: "OMT-SOMEONE-ELSE" }, JPEG)).toEqual({ ok: false, error: "invalid-link" });
    expect(await uploadPaymentReceiptAction({ ...link, amount: "1" }, JPEG)).toEqual({ ok: false, error: "invalid-link" });
    expect(await uploadPaymentReceiptAction({ ...link, sig: "0".repeat(64) }, JPEG)).toEqual({ ok: false, error: "invalid-link" });
    expect(await getPaymentReceipt("OMT-SOMEONE-ELSE")).toBeNull();
  });

  it("refuses a file that is not a real image", async () => {
    const link = await signedLink();
    expect(await uploadPaymentReceiptAction(link, FAKE_JPEG)).toEqual({ ok: false, error: "not-an-image" });
    expect(await getPaymentReceipt(link.ref!)).toBeNull();
  });
});

describe("the admin queue", () => {
  it("attaches receipt times and sorts the oldest payment first", async () => {
    const link = await signedLink();
    await uploadPaymentReceiptAction(link, JPEG);
    const rows: Array<{ id: string; reference: string; createdAt: string; receiptUploadedAt?: string }> = [
      { id: "b", reference: "OMT-OTHER", createdAt: "2026-09-28T10:00:00Z" },
      { id: "a", reference: link.ref!, createdAt: "2026-09-28T08:00:00Z" },
    ];
    const queue = await withReceiptTimes(rows);
    expect(queue.map((p) => p.id)).toEqual(["a", "b"]);
    expect(queue[0]!.receiptUploadedAt).toBeTruthy();
    expect(queue[1]!.receiptUploadedAt).toBeUndefined();
    expect((await receiptUploadTimes([link.ref!, "OMT-NONE"])).size).toBe(1);
  });
});

describe("signed manual links — the reference is bound to the signature", () => {
  it("a genuine link verifies; the same link with another payment's reference does not", async () => {
    const { verifyManualLink } = await import("../src/lib/payments/manual-link");
    const link = await signedLink();
    expect(await verifyManualLink(link)).toMatchObject({ ok: true, provider: "OMT", ref: link.ref });
    // Someone else's reference pasted into a genuine link.
    expect(await verifyManualLink({ ...link, ref: "OMT-pay-pur-999-000" })).toEqual({ ok: false });
    // The right reference under the other provider's name.
    expect(await verifyManualLink({ ...link, provider: "whish", ref: link.ref!.replace(/^OMT-/, "WHISH-") })).toMatchObject({ ok: true, provider: "WHISH" });
    expect(await verifyManualLink({ ...link, provider: "whish" })).toEqual({ ok: false });
  });
});
