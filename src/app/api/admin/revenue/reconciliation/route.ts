import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getManualPaymentReconciliation } from "@/lib/data/repo";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payments = await getManualPaymentReconciliation();
  const url = new URL(req.url);
  if (url.searchParams.get("format") !== "csv") {
    return NextResponse.json({
      scope: "manual_payments",
      count: payments.length,
      totalMinor: payments.reduce((sum, payment) => sum + payment.amount, 0),
      payments,
    });
  }

  const rows = [
    ["payment_id", "scope", "label_en", "label_ar", "method", "reference", "amount_minor", "currency", "created_at", "status", "paid_at", "refunded_at", "invoice_number"],
    ...payments.map((payment) => [
      payment.id,
      payment.scope,
      payment.labelEn,
      payment.labelAr,
      payment.method,
      payment.reference,
      payment.amount,
      payment.currency,
      payment.createdAt,
      payment.status,
      payment.paidAt ?? "",
      payment.refundedAt ?? "",
      payment.invoiceNumber ?? "",
    ]),
  ];
  const body = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"workersarena-manual-payments-reconciliation.csv\"",
      "Cache-Control": "no-store",
    },
  });
}
