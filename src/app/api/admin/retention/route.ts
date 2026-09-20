import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getAllWorkers, getSubscriptionAnalytics } from "@/lib/data/repo";
import { retentionSnapshot } from "@/lib/data/retention";
import { getWhatsAppDeliveryHealth } from "@/lib/data/whatsapp-delivery-store";
import { WHATSAPP_RETRY_POLICY } from "@/lib/data/whatsapp-deliveries";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const workers = await getAllWorkers();
  const snapshot = retentionSnapshot(workers);
  const analytics = await getSubscriptionAnalytics(6);
  const cohorts = analytics.cohorts;
  // Outreach effectiveness — the delivery-ledger health behind the
  // whatsapp_outreach_* counters above (failures over time, not just counts).
  const whatsappHealth = await getWhatsAppDeliveryHealth();

  if (url.searchParams.get("format") === "csv") {
    const rows = [
      ["section", "month", "worker", "plan", "days_until_expiry", "retention_rate", "churn_rate"],
      ...cohorts.map((cohort) => ["cohort", cohort.month, "", "", "", cohort.trialConversionRate, ""]),
      ["metric", "", "trial_starts", analytics.trialStarts, "", analytics.trialConversionRate, ""],
      ["metric", "", "churn_events", analytics.churnEvents, "", "", analytics.churnRate],
      ["metric", "", "upgrades", analytics.upgrades, "", "", ""],
      ["metric", "", "downgrades", analytics.downgrades, "", "", ""],
      ["metric", "", "whatsapp_outreach_sent", analytics.whatsappOutreachSent, "", "", ""],
      ["metric", "", "whatsapp_outreach_failed", analytics.whatsappOutreachFailed, "", "", ""],
      ["metric", "", "whatsapp_delivery_total", whatsappHealth.total, "", "", ""],
      ["metric", "", "whatsapp_overall_failure_rate", `${whatsappHealth.overallFailureRatePct}%`, "", "", ""],
      ["metric", "", "whatsapp_overall_delivery_rate", `${whatsappHealth.overallDeliveryRatePct}%`, "", "", ""],
      ["metric", "", "whatsapp_24h_sends", whatsappHealth.last24h.sends, "", "", ""],
      ["metric", "", "whatsapp_24h_failed", whatsappHealth.last24h.failed, "", "", whatsappHealth.last24h.failureRatePct],
      ["metric", "", "whatsapp_24h_delivered", whatsappHealth.last24h.delivered, "", "", whatsappHealth.last24h.deliveryRatePct],
      ["metric", "", "whatsapp_24h_pending", whatsappHealth.last24h.pending, "", "", ""],
      ["metric", "", "whatsapp_dead_letters", whatsappHealth.deadLetters, "", "", `max ${WHATSAPP_RETRY_POLICY.maxAttempts} attempts`],
      ...Object.entries(whatsappHealth.byKind).map(([kind, count]) => ["whatsapp_by_kind", "", kind, String(count), "", "", ""]),
      ["metric", "", "ltv_minor", analytics.ltv, "", "", ""],
      ...snapshot.atRiskWorkers.map((worker) => ["at_risk", "", worker.nameEn, worker.plan, worker.daysUntilExpiry, "", ""]),
    ];
    const body = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=\"workersarena-retention.csv\"",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ snapshot, cohorts, analytics, whatsappHealth });
}
