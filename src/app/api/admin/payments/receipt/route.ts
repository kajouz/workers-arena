import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getPaymentReceipt } from "@/lib/data/payment-receipts";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payments/receipt?ref=OMT-… — the payer's receipt photo for a
 * manual payment (Step 3), shown in the /admin confirm dialog. Admin only;
 * never cached, never sniffed as anything but the stored image type.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ref = new URL(req.url).searchParams.get("ref") ?? "";
  const receipt = await getPaymentReceipt(ref);
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base64 = receipt.dataUrl.slice(receipt.dataUrl.indexOf(",") + 1);
  return new Response(Buffer.from(base64, "base64"), {
    headers: {
      "Content-Type": receipt.mimeType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="receipt-${ref.replace(/[^A-Za-z0-9-]/g, "")}"`,
    },
  });
}
