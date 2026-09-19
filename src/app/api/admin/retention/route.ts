import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getAllWorkers, getSubscriptionCohorts } from "@/lib/data/repo";
import { retentionSnapshot } from "@/lib/data/retention";

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
  const cohorts = await getSubscriptionCohorts(6);

  if (url.searchParams.get("format") === "csv") {
    const rows = [
      ["section", "month", "worker", "plan", "days_until_expiry", "retention_rate", "churn_rate"],
      ...cohorts.map((cohort) => ["cohort", cohort.month, "", "", "", cohort.trialConversionRate, ""]),
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

  return NextResponse.json({ snapshot, cohorts });
}
