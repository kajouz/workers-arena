"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { useABTesting } from "@/hooks/use-ab-testing";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SponsoredResultProps {
  ad: {
    id: string;
    nameEn: string;
    nameAr: string;
    placement: string;
    adType: string;
    ctr: number;
    clicks: number;
    impressions: number;
  };
  category?: string;
  city?: string;
}

export function SponsoredSearchResult({
  ad,
  category,
  city,
  variant,
  onAdClick,
  showStats = true,
}: SponsoredResultProps & {
  variant?: any;
  onAdClick?: (adId: string) => void;
  showStats?: boolean;
}) {
  const { locale, t } = useLocale();

  const handleClick = () => {
    onAdClick?.(ad.id);
  };

  // Apply A/B test styling
  const borderClass = variant?.config?.borderStyle === "solid"
    ? "border-solid border-violet-400"
    : "border-dashed border-violet-400/50";

  return (
    <Card className={cn(
      "relative overflow-hidden border-2 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/50 dark:from-violet-950/30 dark:to-fuchsia-950/30",
      borderClass
    )}>
      {/* Sponsored Badge */}
      <div className="absolute top-3 right-3 z-10">
        <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white shadow-lg">
          <Sparkles className="mr-1 size-3" />
          {t("featured.sponsored")}
        </Badge>
      </div>

      <div className="p-5">
        {/* Campaign Header */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg">
            <Sparkles className="size-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-ink-900 dark:text-white">
              {locale === "ar" ? ad.nameAr : ad.nameEn}
            </h3>
            {category && (
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {category} {city ? `· ${city}` : ""}
              </p>
            )}
          </div>
        </div>

        {/* Ad Stats - controlled by A/B test */}
        {showStats && (
          <div className="mb-4 flex items-center gap-4 text-xs text-ink-500 dark:text-ink-400">
            <span>CTR: {ad.ctr}%</span>
            <span>·</span>
            <span>{ad.clicks} clicks</span>
            <span>·</span>
            <span>{ad.impressions} impressions</span>
          </div>
        )}

        {/* CTA Button */}
        <a
          href={`/company`}
          onClick={handleClick}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white shadow-lg transition-all hover:from-violet-600 hover:to-fuchsia-700 hover:shadow-xl"
        >
          {t("company.createCampaign")}
          <ExternalLink className="size-4" />
        </a>
      </div>
    </Card>
  );
}

/**
 * SponsoredSearchResults - Shows up to 2 sponsored ads at the top of search results
 */
export function SponsoredSearchResults({
  placement = "search",
  category,
  city,
}: {
  placement?: string;
  category?: string;
  city?: string;
}) {
  const { locale, t } = useLocale();
  const { getVariant, trackImpression, trackClick } = useABTesting();
  const [ads, setAds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Get A/B test variant
  const variant = getVariant("search-ad-style");
  const showStats = variant?.config.showStats ?? true;
  const borderStyle = variant?.config.borderStyle ?? "gradient";

  useEffect(() => {
    // Fetch ads for this placement
    const params = new URLSearchParams({ placement });
    if (category) params.set("category", category);
    if (city) params.set("city", city);

    fetch(`/api/ads?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ad) setAds([d.ad]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [placement, category, city]);

  if (loading || ads.length === 0) return null;

  // Track impression when ads load
  useEffect(() => {
    if (ads.length > 0 && variant) {
      ads.forEach((ad) => {
        trackImpression("search-ad-style", variant.id);
      });
    }
  }, [ads, variant, trackImpression]);

  const handleAdClick = (adId: string) => {
    if (variant) {
      trackClick("search-ad-style", variant.id);
    }
    void fetch(`/api/ads/${adId}/click`, { method: "POST" }).catch(() => {});
  };

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
        <Sparkles className="size-4 text-violet-500" />
        <span>{locale === "ar" ? "نتائج مدعومة" : "Sponsored results"}</span>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {ads.map((ad) => (
          <SponsoredSearchResult
            key={ad.id}
            ad={ad}
            category={category}
            city={city}
            variant={variant}
            onAdClick={handleAdClick}
            showStats={showStats}
          />
        ))}
      </div>
    </div>
  );
}
