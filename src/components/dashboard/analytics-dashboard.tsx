"use client";

import { useMemo } from "react";
import { Eye, TrendingUp, Clock, DollarSign, Star, Users, Zap, Target } from "lucide-react";
import { formatNumber, formatCompact } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/components/providers/locale-provider";
import type { Booking, Worker } from "@/lib/data/types";
import type { LeadOffer } from "@/lib/data/lead-market";
import { cn } from "@/lib/utils";

interface AnalyticsDashboardProps {
  worker: Worker;
  bookings: Booking[];
  leadOffers: LeadOffer[];
}

export function AnalyticsDashboard({
  worker,
  bookings,
  leadOffers,
}: AnalyticsDashboardProps) {
  const { locale, t } = useLocale();

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getUTCMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getUTCMonth() - 1, 1);

    // This month's bookings (using startAt as the booking date).
    const thisMonth = bookings.filter(
      (b) => b.startAt && new Date(b.startAt) >= monthStart
    );
    const lastMonth = bookings.filter(
      (b) => b.startAt && new Date(b.startAt) >= lastMonthStart && new Date(b.startAt) < monthStart
    );

    // Completed jobs.
    const completedThisMonth = thisMonth.filter((b) => b.status === "completed").length;
    const completedLastMonth = lastMonth.filter((b) => b.status === "completed").length;

    // Total GMV this month.
    const gmvThisMonth = thisMonth
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + (b.quote ?? 0), 0);
    const gmvLastMonth = lastMonth
      .filter((b) => b.status === "completed")
      .reduce((sum, b) => sum + (b.quote ?? 0), 0);

    // Lead conversion: purchased leads → completed jobs.
    const purchasedLeads = leadOffers.filter((l) => l.status === "purchased").length;
    const leadConversion = purchasedLeads > 0
      ? Math.round((completedThisMonth / purchasedLeads) * 100)
      : 0;

    // Response rate (from trust signals).
    const responseRate = worker.completion || 0;

    // Average job value.
    const avgJobValue = completedThisMonth > 0
      ? Math.round(gmvThisMonth / completedThisMonth)
      : 0;

    // Month-over-month change.
    const gmvChange = gmvLastMonth > 0
      ? Math.round(((gmvThisMonth - gmvLastMonth) / gmvLastMonth) * 100)
      : 0;
    const jobsChange = completedLastMonth > 0
      ? Math.round(((completedThisMonth - completedLastMonth) / completedLastMonth) * 100)
      : 0;

    return {
      views: worker.views,
      leads: worker.leads,
      completedThisMonth,
      gmvThisMonth,
      leadConversion,
      responseRate,
      avgJobValue,
      rating: worker.rating,
      reviewCount: worker.reviewCount,
      gmvChange,
      jobsChange,
      purchasedLeads,
    };
  }, [worker, bookings, leadOffers]);

  const cards = [
    {
      title: "Profile Views",
      value: formatCompact(stats.views),
      icon: Eye,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Leads Received",
      value: formatCompact(stats.leads),
      icon: Users,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Completed Jobs",
      value: stats.completedThisMonth.toString(),
      change: stats.jobsChange,
      icon: Zap,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      title: "GMV This Month",
      value: `$${formatNumber(stats.gmvThisMonth)}`,
      change: stats.gmvChange,
      icon: DollarSign,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      title: "Lead Conversion",
      value: `${stats.leadConversion}%`,
      subtitle: `${stats.completedThisMonth} jobs / ${stats.purchasedLeads} leads`,
      icon: Target,
      color: "text-brand-500",
      bg: "bg-brand-500/10",
    },
    {
      title: "Avg Job Value",
      value: `$${formatNumber(stats.avgJobValue)}`,
      icon: TrendingUp,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Rating",
      value: stats.rating.toFixed(1),
      subtitle: `${stats.reviewCount} reviews`,
      icon: Star,
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
    },
    {
      title: "Response Rate",
      value: `${stats.responseRate}%`,
      icon: Clock,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {locale === "ar" ? "التحليلات" : "Analytics"}
        </h1>
        <p className="text-muted-foreground">
          {locale === "ar"
            ? "نظرة عامة على أداء ملفك هذا الشهر"
            : "Your profile performance this month"}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{card.value}</p>
                  {card.change !== undefined && (
                    <p
                      className={cn(
                        "text-xs font-medium mt-0.5",
                        card.change > 0 ? "text-emerald-600" : card.change < 0 ? "text-red-600" : "text-muted-foreground"
                      )}
                    >
                      {card.change > 0 ? "+" : ""}{card.change}% vs last month
                    </p>
                  )}
                  {card.subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{card.subtitle}</p>
                  )}
                </div>
                <div className={cn("p-2 rounded-lg", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {locale === "ar" ? "نصائح لتحسين الأداء" : "Performance Insights"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.responseRate < 80 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <Clock className="h-4 w-4 text-amber-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Improve response time</p>
                <p className="text-xs text-muted-foreground">
                  Your response rate is {stats.responseRate}%. Respond faster to get more bookings.
                </p>
              </div>
            </div>
          )}
          {stats.leadConversion < 30 && stats.purchasedLeads > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <Target className="h-4 w-4 text-purple-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Boost lead conversion</p>
                <p className="text-xs text-muted-foreground">
                  You&apos;re converting {stats.leadConversion}% of leads. Add more portfolio photos and update your bio to stand out.
                </p>
              </div>
            </div>
          )}
          {stats.rating >= 4.5 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <Star className="h-4 w-4 text-emerald-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Excellent rating!</p>
                <p className="text-xs text-muted-foreground">
                  Your {stats.rating.toFixed(1)}★ rating puts you in the top tier. Keep it up!
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
