import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getWeeklyNumbers } from "@/lib/data/repo";
import { weeklyNumbersCsvRows } from "@/lib/data/weekly-numbers";

export const dynamic = "force-dynamic";

function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/** The weekly numbers sheet — JSON by default, `?format=csv` for a spreadsheet. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const weeks = Number(url.searchParams.get("weeks") ?? 8);
  const sheet = await getWeeklyNumbers(Number.isFinite(weeks) ? weeks : 8);
  if (url.searchParams.get("format") !== "csv") return NextResponse.json(sheet);

  const body = "﻿" + weeklyNumbersCsvRows(sheet).map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workersarena-weekly-numbers-${sheet.generatedAt.slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
