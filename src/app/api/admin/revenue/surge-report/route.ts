import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { listLeadOffers } from "@/lib/data/repo";
import { listLeadRefunds } from "@/lib/data/lead-refund-store";
import { computeSurgeReport } from "@/lib/data/surge-report";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Phase 2 — the 30-day emergency-surge evaluation, exported for the tuning
 * decision. CSV keeps the section layout of the retention export: summary
 * metrics first, then the weekly cohort, then the multiplier audit.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, Math.trunc(Number(url.searchParams.get("days") ?? 30)) || 30));

  const [offers, refunds] = await Promise.all([listLeadOffers(500), listLeadRefunds()]);
  const report = computeSurgeReport(offers, refunds, { windowDays: days });

  const rows: Array<Array<string | number>> = [
    ["section", "metric", "value", "extra"],
    ["summary", "window_days", report.windowDays, report.from],
    ["summary", "emergency_offers", report.summary.offers, ""],
    ["summary", "emergency_purchased", report.summary.purchased, `${report.summary.conversionPct}%`],
    ["summary", "avg_multiplier", report.summary.avgMultiplier, ""],
    ["summary", "base_credits", report.summary.baseCredits, ""],
    ["summary", "premium_credits", report.summary.premiumCredits, ""],
    ["summary", "refunded_premium_credits", report.summary.refundedPremiumCredits, ""],
    ["summary", "net_premium_credits", report.summary.netPremiumCredits, ""],
    ["summary", "refund_requests", report.summary.refundRequests, ""],
    ["summary", "approved_refunds", report.summary.approvedRefunds, `${report.summary.approvedRefundRatePct}%`],
    ["summary", "pending_refunds", report.summary.pendingRefunds, ""],
    ["baseline_gold", "offers", report.goldBaseline.offers, ""],
    ["baseline_gold", "purchased", report.goldBaseline.purchased, `${report.goldBaseline.conversionPct}%`],
    ["verdict", report.verdict.code, report.verdict.conversionPct, `${report.verdict.approvedRefundRatePct}%`],
    ["multipliers", "flat_1x", report.multipliers.exactly1, ""],
    ["multipliers", "up_to_1_3", report.multipliers.upTo1_3, ""],
    ["multipliers", "up_to_1_6", report.multipliers.upTo1_6, ""],
    ["multipliers", "above_1_6", report.multipliers.above1_6, ""],
    ["section", "week", "offers", "purchased", "conversion_pct", "refund_requests", "approved_refund_credits", "avg_multiplier"],
    ...report.weeks.map((week) => [
      "weekly",
      week.weekKey,
      week.offers,
      week.purchased,
      week.conversionPct,
      week.refundRequests,
      week.approvedRefundCredits,
      week.avgMultiplier,
    ]),
  ];

  // The header row above has two shapes; normalize to the widest for CSV sanity.
  const width = Math.max(...rows.map((r) => r.length));
  const body =
    "\uFEFF" +
    rows.map((row) => (row.length < width ? [...row, ...Array(width - row.length).fill("")] : row).map(csvCell).join(",")).join("\n") +
    "\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workersarena-surge-report-${days}d.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
