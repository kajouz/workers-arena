"use client";

import React, { useEffect, useState } from "react";
import { X, Sparkles, ExternalLink } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MobileBannerAdProps {
  placement?: string;
  className?: string;
}

export function MobileBannerAd({ placement = "mobileBanner", className }: MobileBannerAdProps) {
  const { locale, t } = useLocale();
  const [ad, setAd] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if user dismissed this ad recently (24 hours)
    const dismissedAt = localStorage.getItem(`ad_dismissed_${placement}`);
    if (dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000) {
      setDismissed(true);
      setLoading(false);
      return;
    }

    fetch(`/api/ads?placement=${placement}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ad) setAd(d.ad);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [placement]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(`ad_dismissed_${placement}`, String(Date.now()));
  };

  const trackClick = () => {
    void fetch(`/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
  };

  if (loading || !ad || dismissed) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-16 z-45 lg:hidden", // Above bottom tabs (z-40), below modals
        "border-t border-ink-200/80 bg-white/95 p-3 shadow-lift backdrop-blur-xl",
        "dark:border-ink-800 dark:bg-ink-950/95",
        className
      )}
    >
      <div className="mx-auto flex max-w-lg items-center gap-3">
        {/* Ad Icon */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
          <Sparkles className="size-5" />
        </div>

        {/* Ad Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-ink-900 dark:text-white">
              {locale === "ar" ? ad.nameAr : ad.nameEn}
            </p>
            <Badge className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-[10px]">
              {locale === "ar" ? "إعلان" : "Ad"}
            </Badge>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "عرض خاص لك" : "Special offer for you"}
          </p>
        </div>

        {/* CTA Button */}
        <a
          href="/company"
          onClick={trackClick}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-xs font-bold text-white shadow-lg transition-all hover:from-amber-600 hover:to-orange-700"
        >
          {locale === "ar" ? "المزيد" : "Learn more"}
          <ExternalLink className="size-3" />
        </a>

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800"
          aria-label={locale === "ar" ? "إغلاق الإعلان" : "Dismiss ad"}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
