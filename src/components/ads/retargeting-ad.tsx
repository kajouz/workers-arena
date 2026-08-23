"use client";

import React, { useEffect, useState } from "react";
import { X, Sparkles, ArrowRight, TrendingUp } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { useRetargeting } from "@/hooks/use-retargeting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RetargetingAdProps {
  className?: string;
}

interface RetargetingAdContent {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn: string;
  descriptionAr: string;
  ctaEn: string;
  ctaAr: string;
  url: string;
  hue: number;
}

// Ad templates based on visitor behavior
const RETARGETING_ADS: Record<string, RetargetingAdContent[]> = {
  plumbing: [
    {
      id: "retarget-plumbing-1",
      titleEn: "Need a Plumber? Book Now!",
      titleAr: "تحتاج سباك؟ احجز الآن!",
      descriptionEn: "Trusted plumbers in your area. 24/7 emergency service available.",
      descriptionAr: "سباكون موثوقون في منطقتك. خدمة طوارئ على مدار الساعة.",
      ctaEn: "Find Plumbers",
      ctaAr: "ابحث عن سباك",
      url: "/search?category=plumbing",
      hue: 200,
    },
  ],
  electrical: [
    {
      id: "retarget-electrical-1",
      titleEn: "Electrical Issues? We Can Help!",
      titleAr: "مشاكل كهربائية؟ نستطيع المساعدة!",
      descriptionEn: "Licensed electricians ready to help. Get a free quote today.",
      descriptionAr: "كهرباءيون مرخصون جاهزون للمساعدة. احصل على عرض أسعار مجاني.",
      ctaEn: "Find Electricians",
      ctaAr: "ابحث عن كهربائيين",
      url: "/search?category=electrical",
      hue: 45,
    },
  ],
  default: [
    {
      id: "retarget-default-1",
      titleEn: "Complete Your Booking Today!",
      titleAr: "أكمل حجزك اليوم!",
      descriptionEn: "You were so close! Get 10% off your first booking with code WELCOME10.",
      descriptionAr: "كنت قريبًا جداً! احصل على خصم 10% على حجزك الأول بالكود WELCOME10.",
      ctaEn: "Book Now",
      ctaAr: "احجز الآن",
      url: "/search",
      hue: 280,
    },
    {
      id: "retarget-default-2",
      titleEn: "Top-Rated Workers Near You",
      titleAr: "عمال متميزون بالقرب منك",
      descriptionEn: "Browse verified professionals with 4.8+ ratings. Instant booking available.",
      descriptionAr: "تصفح محترفين موثوقين بتقييم 4.8+. حجز فوري متاح.",
      ctaEn: "Browse Workers",
      ctaAr: "تصفح العمال",
      url: "/search",
      hue: 150,
    },
  ],
};

export function RetargetingAd({ className }: RetargetingAdProps) {
  const { locale, t } = useLocale();
  const { getRetargetingData, shouldShowRetargetingAd } = useRetargeting();
  const [dismissed, setDismissed] = useState(false);
  const [ad, setAd] = useState<RetargetingAdContent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if user dismissed this ad recently (24 hours)
    const dismissedAt = localStorage.getItem("retargeting_ad_dismissed");
    if (dismissedAt && Date.now() - Number(dismissedAt) < 24 * 60 * 60 * 1000) {
      setDismissed(true);
      return;
    }

    // Check if visitor should see retargeting ad
    if (!shouldShowRetargetingAd()) return;

    const profile = getRetargetingData();
    if (!profile) return;

    // Get personalized ad based on interests
    let selectedAd: RetargetingAdContent | null = null;
    
    if (profile.interests.length > 0) {
      // Show ad related to their most viewed category
      const topInterest = profile.interests[0];
      const categoryAds = RETARGETING_ADS[topInterest];
      if (categoryAds && categoryAds.length > 0) {
        selectedAd = categoryAds[0];
      }
    }

    // Fallback to default retargeting ads
    if (!selectedAd) {
      const defaultAds = RETARGETING_ADS.default;
      selectedAd = defaultAds[Math.floor(Math.random() * defaultAds.length)];
    }

    if (selectedAd) {
      setAd(selectedAd);
      // Delay showing the ad for better UX
      setTimeout(() => setVisible(true), 2000);
    }
  }, [getRetargetingData, shouldShowRetargetingAd]);

  const handleDismiss = () => {
    setDismissed(true);
    setVisible(false);
    localStorage.setItem("retargeting_ad_dismissed", String(Date.now()));
  };

  const trackClick = () => {
    if (ad) {
      void fetch(`/api/ads/${ad.id}/click`, { method: "POST" }).catch(() => {});
    }
  };

  if (!ad || !visible || dismissed) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-36 z-40 lg:bottom-8 lg:right-6 lg:left-auto lg:w-96",
        "transform transition-all duration-500 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
        className
      )}
    >
      <div
        className={cn(
          "mx-4 overflow-hidden rounded-2xl border-2 shadow-lift backdrop-blur-xl",
          "bg-white/95 dark:bg-ink-950/95",
          "lg:mx-0"
        )}
        style={{ borderColor: `hsl(${ad.hue} 70% 50% / 0.3)` }}
      >
        {/* Retargeting Badge */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ background: `linear-gradient(90deg, hsl(${ad.hue} 70% 50%), hsl(${(ad.hue + 40) % 360} 70% 45%))` }}
        >
          <div className="flex items-center gap-2 text-white">
            <TrendingUp className="size-4" />
            <span className="text-xs font-bold uppercase tracking-wider">
              {locale === "ar" ? "عرض خاص لك" : "Recommended for you"}
            </span>
          </div>
          <button
            onClick={handleDismiss}
            className="rounded-lg p-1 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            aria-label={locale === "ar" ? "إغلاق" : "Dismiss"}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Ad Content */}
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, hsl(${ad.hue} 70% 50%), hsl(${(ad.hue + 40) % 360} 70% 45%))` }}
            >
              <Sparkles className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-ink-900 dark:text-white">
                {locale === "ar" ? ad.titleAr : ad.titleEn}
              </h3>
              <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                {locale === "ar" ? ad.descriptionAr : ad.descriptionEn}
              </p>
            </div>
          </div>

          {/* CTA Button */}
          <a
            href={ad.url}
            onClick={trackClick}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-lg transition-all hover:shadow-xl"
            style={{ background: `linear-gradient(90deg, hsl(${ad.hue} 70% 50%), hsl(${(ad.hue + 40) % 360} 70% 45%))` }}
          >
            {locale === "ar" ? ad.ctaAr : ad.ctaEn}
            <ArrowRight className="size-4" />
          </a>

          {/* Trust indicator */}
          <p className="mt-3 text-center text-xs text-ink-400 dark:text-ink-500">
            {locale === "ar" ? "بناءً على اهتماماتك" : "Based on your interests"}
          </p>
        </div>
      </div>
    </div>
  );
}
