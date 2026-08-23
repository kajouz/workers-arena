"use client";

import { useLocale } from "@/components/providers/locale-provider";
import type { SessionUser } from "@/lib/auth-demo";
import { GradientAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, BarChart3 } from "lucide-react";
import Link from "next/link";
import { CampaignAnalytics } from "./campaign-analytics";

export function CompanyAnalyticsView({ session }: { session: SessionUser }) {
  const { locale, t } = useLocale();

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/company">
            <Button variant="outline" size="sm">
              <ArrowLeft className="size-4 mr-2" />
              {locale === "ar" ? "العودة" : "Back"}
            </Button>
          </Link>
          <div className="flex items-center gap-4">
            <GradientAvatar name={session.name} hue={session.hue} className="size-12" />
            <div>
              <h1 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50 flex items-center gap-2">
                <BarChart3 className="size-6 text-brand-500" />
                {locale === "ar" ? "تحليلات الحملات" : "Campaign Analytics"}
              </h1>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {locale === "ar" ? "مؤشرات أداء الإعلانات وتتبع العائد" : "Ad performance metrics and ROI tracking"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Dashboard */}
      <div className="mt-8">
        <CampaignAnalytics />
      </div>
    </div>
  );
}
