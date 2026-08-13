"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface AdPayload {
  id: string;
  nameEn: string;
  nameAr: string;
  placement: string;
  adType: string;
  ctr: number;
  clicks: number;
  impressions: number;
}

export function AdSlot({ placement = "homepage", className }: { placement?: string; className?: string }) {
  const { locale, t } = useLocale();
  const [ad, setAd] = useState<AdPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ads?placement=${placement}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAd(d.ad ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [placement]);

  if (loading) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-white/5 p-6 ${className ?? ""}`}>
        <Skeleton className="h-10 w-full rounded-xl bg-white/10" />
      </div>
    );
  }

  if (!ad) return null;

  const trackClick = () => {
    void fetch(`/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
  };

  return (
    <div className={`flex flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:flex-row ${className ?? ""}`}>
      <div className="flex items-center gap-4">
        <span className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
          <Sparkles className="size-6" />
        </span>
        <div>
          <div className="flex items-center gap-2 font-bold text-white">
            {locale === "ar" ? ad.nameAr : ad.nameEn}
            <Badge variant="outline" className="border-white/20 text-white/70">
              {t("featured.sponsored")}
            </Badge>
          </div>
          <p className="text-sm text-white/60">
            {locale === "ar" ? ad.placement : ad.placement} · CTR {ad.ctr}%
          </p>
        </div>
      </div>
      <a
        href="/company"
        onClick={trackClick}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-ink-950 transition-all hover:bg-brand-400"
      >
        {t("company.createCampaign")}
      </a>
    </div>
  );
}
