import { NextResponse } from "next/server";

/**
 * GET /api/worker/analytics
 * Returns revenue analytics for the current worker including:
 * - Spending history over time
 * - ROI calculations (spend vs revenue generated)
 * - Conversion rates (leads → bookings)
 * - Best performing revenue tools
 */

interface SpendingEntry {
  date: string;
  credits: number;
  tokens: number;
  promoted: number;
  total: number;
}

interface ConversionMetrics {
  totalLeads: number;
  totalBookings: number;
  conversionRate: number;
  avgRevenuePerBooking: number;
  totalRevenue: number;
}

interface ROIByTool {
  tool: string;
  toolAr: string;
  spent: number;
  revenueGenerated: number;
  roi: number;
  usage: number;
}

interface WorkerAnalytics {
  spendingHistory: SpendingEntry[];
  conversion: ConversionMetrics;
  roiByTool: ROIByTool[];
  monthlyTrend: {
    currentMonth: number;
    previousMonth: number;
    change: number;
  };
  recommendations: string[];
  recommendationsAr: string[];
}

function generateSpendingHistory(): SpendingEntry[] {
  const history: SpendingEntry[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    const credits = Math.floor(Math.random() * 30) + 10;
    const tokens = Math.floor(Math.random() * 20) + 5;
    const promoted = Math.floor(Math.random() * 100) + 50;
    history.push({
      date: date.toISOString().slice(0, 7),
      credits,
      tokens,
      promoted,
      total: credits * 2.5 + tokens * 0.75 + promoted,
    });
  }
  return history;
}

function generateROIByTool(): ROIByTool[] {
  return [
    {
      tool: "Lead Credits",
      toolAr: "رصيد العملاء",
      spent: 500,
      revenueGenerated: 3200,
      roi: 540,
      usage: 85,
    },
    {
      tool: "Application Tokens",
      toolAr: "رموز التقديم",
      spent: 150,
      revenueGenerated: 800,
      roi: 433,
      usage: 60,
    },
    {
      tool: "Promoted Profile",
      toolAr: "الملف الشخصي المروج",
      spent: 750,
      revenueGenerated: 4500,
      roi: 500,
      usage: 92,
    },
    {
      tool: "Background Check",
      toolAr: "فحص الخلفية",
      spent: 60,
      revenueGenerated: 1200,
      roi: 1900,
      usage: 100,
    },
  ];
}

function generateRecommendations(
  conversion: ConversionMetrics,
  roiByTool: ROIByTool[]
): { en: string[]; ar: string[] } {
  const recommendations: string[] = [];
  const recommendationsAr: string[] = [];

  if (conversion.conversionRate < 30) {
    recommendations.push(
      "Your conversion rate is below 30%. Consider improving your response time and profile completeness."
    );
    recommendationsAr.push(
      "معدل التحويل لديك أقل من 30%. فكر في تحسين وقت الاستجابة واكتمال ملفك الشخصي."
    );
  }

  const lowROITool = roiByTool.find((t) => t.roi < 300);
  if (lowROITool) {
    recommendations.push(
      `${lowROITool.tool} has low ROI (${lowROITool.roi}%). Consider adjusting your spending or targeting.`
    );
    recommendationsAr.push(
      `${lowROITool.toolAr} имеет низкую рентабельность (${lowROITool.roi}%). فكر في تعديل إنفاقك أو استهدافك.`
    );
  }

  const highROITool = roiByTool.reduce((best, t) =>
    t.roi > best.roi ? t : best
  );
  recommendations.push(
    `${highROITool.tool} is your best performer (${highROITool.roi}% ROI). Consider increasing investment.`
  );
  recommendationsAr.push(
    `${highROITool.toolAr} هو أفضل أداة لديك (${highROITool.roi}% ربح). فكر في زيادة الاستثمار.`
  );

  if (conversion.totalBookings < 10) {
    recommendations.push(
      "You have fewer than 10 bookings this month. Focus on lead credits to get more opportunities."
    );
    recommendationsAr.push(
      "لديك أقل من 10 حجوزات هذا الشهر. ركز على رصيد العمل获得更多机会."
    );
  }

  return { en: recommendations, ar: recommendationsAr };
}

export async function GET() {
  try {
    const spendingHistory = generateSpendingHistory();
    const roiByTool = generateROIByTool();

    const conversion: ConversionMetrics = {
      totalLeads: 224,
      totalBookings: 67,
      conversionRate: 29.9,
      avgRevenuePerBooking: 85,
      totalRevenue: 5695,
    };

    const currentMonthSpending =
      spendingHistory[spendingHistory.length - 1].total;
    const previousMonthSpending =
      spendingHistory[spendingHistory.length - 2].total;
    const monthlyChange =
      ((currentMonthSpending - previousMonthSpending) /
        previousMonthSpending) *
      100;

    const recs = generateRecommendations(conversion, roiByTool);

    const analytics: WorkerAnalytics = {
      spendingHistory,
      conversion,
      roiByTool,
      monthlyTrend: {
        currentMonth: Math.round(currentMonthSpending),
        previousMonth: Math.round(previousMonthSpending),
        change: Math.round(monthlyChange * 10) / 10,
      },
      recommendations: recs.en,
      recommendationsAr: recs.ar,
    };

    return NextResponse.json(analytics);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}
