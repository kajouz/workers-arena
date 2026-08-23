"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, ExternalLink, Target, Star } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface WorkerSponsorProps {
  workerCategory?: string;
  workerCity?: string;
}

export function WorkerSponsor({ workerCategory, workerCity }: WorkerSponsorProps) {
  const { locale, t } = useLocale();
  const [ad, setAd] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch sponsored ads for worker profile placement
    const params = new URLSearchParams({ placement: "workerProfile" });
    if (workerCategory) params.set("category", workerCategory);
    if (workerCity) params.set("city", workerCity);

    fetch(`/api/ads?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ad) setAd(d.ad);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workerCategory, workerCity]);

  if (loading || !ad) return null;

  const trackClick = () => {
    void fetch(`/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
  };

  return (
    <Card className="relative overflow-hidden border-2 border-dashed border-orange-400/50 bg-gradient-to-br from-orange-50/50 to-amber-50/50 dark:from-orange-950/30 dark:to-amber-950/30">
      {/* Sponsored Badge */}
      <div className="absolute top-3 right-3 z-10">
        <Badge className="bg-gradient-to-r from-orange-500 to-amber-600 text-white shadow-lg">
          <Sparkles className="mr-1 size-3" />
          {locale === "ar" ? "إعلان ممول" : "Sponsored"}
        </Badge>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg">
            <Target className="size-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-ink-900 dark:text-white">
              {locale === "ar" ? ad.nameAr : ad.nameEn}
            </h4>
            {workerCategory && (
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {locale === "ar" ? "متعلق بـ" : "Related to"} {workerCategory}
              </p>
            )}
          </div>
        </div>

        <div className="mb-3 flex items-center gap-3 text-xs text-ink-500 dark:text-ink-400">
          <span className="flex items-center gap-1">
            <Star className="size-3 text-orange-500" />
            CTR: {ad.ctr}%
          </span>
        </div>

        <a
          href={`/company`}
          onClick={trackClick}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:from-orange-600 hover:to-amber-700 hover:shadow-xl"
        >
          {t("company.createCampaign")}
          <ExternalLink className="size-4" />
        </a>
      </div>
    </Card>
  );
}
