import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";

export const revalidate = 0;

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // In a real implementation, this would query analytics data from a database
  // For now, return demo data that represents realistic behavior metrics
  const behaviorData = {
    sessionDuration: {
      avg: 185, // 3m 5s
      median: 142, // 2m 22s
      p95: 420, // 7m
    },
    bounceRate: 34.2,
    peakHours: [
      { hour: 0, count: 12 },
      { hour: 1, count: 8 },
      { hour: 2, count: 5 },
      { hour: 3, count: 3 },
      { hour: 4, count: 2 },
      { hour: 5, count: 4 },
      { hour: 6, count: 15 },
      { hour: 7, count: 28 },
      { hour: 8, count: 45 },
      { hour: 9, count: 62 },
      { hour: 10, count: 78 },
      { hour: 11, count: 85 },
      { hour: 12, count: 72 },
      { hour: 13, count: 65 },
      { hour: 14, count: 70 },
      { hour: 15, count: 75 },
      { hour: 16, count: 80 },
      { hour: 17, count: 68 },
      { hour: 18, count: 55 },
      { hour: 19, count: 48 },
      { hour: 20, count: 42 },
      { hour: 21, count: 35 },
      { hour: 22, count: 25 },
      { hour: 23, count: 18 },
    ],
    deviceBreakdown: [
      { device: "mobile", percentage: 62.4 },
      { device: "desktop", percentage: 31.8 },
      { device: "tablet", percentage: 5.8 },
    ],
    languageSplit: [
      { language: "Arabic", percentage: 58.2 },
      { language: "English", percentage: 41.8 },
    ],
    searchToContactRatio: 12.4,
    topPages: [
      { path: "/", views: 15420 },
      { path: "/search", views: 8750 },
      { path: "/workers/khaled-al-harbi-plumbing", views: 3240 },
      { path: "/categories", views: 2890 },
      { path: "/workers/ali-hassan-carpentry", views: 2150 },
    ],
  };

  return NextResponse.json(behaviorData);
}
