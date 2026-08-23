import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getCampaigns } from "@/lib/data/repo";

export async function GET() {
  const session = await getSession();
  if (!session || (session.role !== "company" && session.role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const campaigns = await getCampaigns();
  
  // Calculate ROI metrics
  const totalImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totalClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totalSpent = campaigns.reduce((s, c) => s + c.spent, 0);
  const totalBudget = campaigns.reduce((s, c) => s + c.budget, 0);

  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100) : 0;
  const cpc = totalClicks > 0 ? (totalSpent / totalClicks) : 0; // Cost per click
  const cpm = totalImpressions > 0 ? (totalSpent / totalImpressions * 1000) : 0; // Cost per 1000 impressions

  // Simulated ROAS (Return on Ad Spend) - in real app would track conversions
  const estimatedConversions = Math.floor(totalClicks * 0.15); // 15% conversion rate
  const avgConversionValue = 50; // Average lead value
  const estimatedRevenue = estimatedConversions * avgConversionValue;
  const roas = totalSpent > 0 ? (estimatedRevenue / totalSpent) : 0;

  // Campaign performance by placement
  const placementStats = campaigns.reduce((acc, c) => {
    if (!acc[c.placement]) {
      acc[c.placement] = { impressions: 0, clicks: 0, spent: 0, count: 0 };
    }
    acc[c.placement].impressions += c.impressions;
    acc[c.placement].clicks += c.clicks;
    acc[c.placement].spent += c.spent;
    acc[c.placement].count += 1;
    return acc;
  }, {} as Record<string, { impressions: number; clicks: number; spent: number; count: number }>);

  // Daily performance (simulated last 7 days)
  const dailyPerformance = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    const dayStr = date.toISOString().split("T")[0];
    // Simulate daily data based on totals
    const dailyImpressions = Math.floor(totalImpressions / 7 * (0.8 + Math.random() * 0.4));
    const dailyClicks = Math.floor(totalClicks / 7 * (0.8 + Math.random() * 0.4));
    const dailySpent = Math.floor(totalSpent / 7 * (0.8 + Math.random() * 0.4));
    return {
      date: dayStr,
      impressions: dailyImpressions,
      clicks: dailyClicks,
      spent: dailySpent,
      ctr: dailyImpressions > 0 ? ((dailyClicks / dailyImpressions) * 100) : 0,
    };
  });

  // Top performing campaigns
  const topCampaigns = [...campaigns]
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      name: c.nameEn,
      nameAr: c.nameAr,
      impressions: c.impressions,
      clicks: c.clicks,
      ctr: c.ctr,
      spent: c.spent,
      status: c.status,
    }));

  return NextResponse.json({
    summary: {
      totalImpressions,
      totalClicks,
      totalSpent,
      totalBudget,
      remaining: totalBudget - totalSpent,
      ctr: Number(ctr.toFixed(2)),
      cpc: Number(cpc.toFixed(2)),
      cpm: Number(cpm.toFixed(2)),
      roas: Number(roas.toFixed(2)),
      estimatedConversions,
      estimatedRevenue,
    },
    placementStats,
    dailyPerformance,
    topCampaigns,
    campaignCount: campaigns.length,
    activeCampaigns: campaigns.filter((c) => c.status === "active").length,
  });
}
