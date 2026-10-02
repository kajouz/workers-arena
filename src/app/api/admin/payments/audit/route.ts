import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { listPaymentAudit } from "@/lib/data/payment-workflow-store";
import { paymentAuditCsv } from "@/lib/data/payment-audit-export";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/payments/audit — the never-pruned money audit trail
 * (PaymentAuditEvent, docs/PAYMENTS.md §Audit), newest first. Admin only.
 *
 *   ?format=csv          → a spreadsheet for the owner / accountant
 *   ?unreceipted=1       → only amounts recorded WITHOUT a receipt photo — the
 *                          review list that compensates for single-admin mode
 *   ?limit=N             → up to 2000 rows (default 500)
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 500, 1), 2000);
  let rows = await listPaymentAudit({ limit });
  if (url.searchParams.get("unreceipted") === "1") {
    rows = rows.filter((e) => e.action === "tranche.recorded" && e.detail?.hadReceipt === false);
  }
  if (url.searchParams.get("format") === "csv") {
    return new Response(paymentAuditCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payment-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return NextResponse.json({ rows }, { headers: { "Cache-Control": "private, no-store" } });
}
