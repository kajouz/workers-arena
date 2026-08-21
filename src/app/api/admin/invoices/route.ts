import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getAllWorkers, getCampaigns } from "@/lib/data/repo";

export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [workers, campaigns] = await Promise.all([
    getAllWorkers(),
    getCampaigns(),
  ]);

  // Generate invoices from workers with active subscriptions
  const invoices = workers
    .filter((w) => w.subscription.status === "active")
    .map((w) => ({
      id: `inv-${w.id}`,
      number: `INV-${w.subscription.invoiceNo}`,
      workerId: w.id,
      workerName: w.nameEn,
      workerNameAr: w.nameAr,
      type: "subscription",
      amount: (w.subscription.price || 0) * 100, // Convert to minor units
      currency: w.currency,
      status: "paid",
      issuedAt: w.subscription.startedAt,
      paidAt: w.subscription.startedAt,
      dueDate: w.subscription.expiresAt,
      hue: w.hue,
    }));

  return NextResponse.json({
    invoices,
    summary: {
      total: invoices.length,
      paid: invoices.filter((i) => i.status === "paid").length,
      pending: invoices.filter((i) => i.status === "pending").length,
      totalAmount: invoices.reduce((s, i) => s + i.amount, 0),
    },
  });
}
