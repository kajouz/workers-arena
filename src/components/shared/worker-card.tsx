"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Heart, MapPin, Clock, ArrowUpRight, Zap, CalendarCheck2, ShieldCheck } from "lucide-react";
import type { Worker } from "@/lib/data/types";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";
import { categoryBySlug } from "@/lib/data/categories";
import { useLocale } from "@/components/providers/locale-provider";
import { useFavoritesStore } from "@/lib/store";
import { cn, formatNumber } from "@/lib/utils";
import { WorkerCover } from "./worker-cover";
import { Rating } from "@/components/ui/rating";
import { GradientAvatar } from "@/components/ui/avatar";
import { Price } from "./price";
import { EmergencyBadge, PremiumBadge, VerifiedBadge } from "./badges";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";

export function WorkerCard({ worker, index = 0 }: { worker: Worker; index?: number }) {
  const { locale, t } = useLocale();
  const cat = categoryBySlug(worker.categorySlug);
  const favIds = useFavoritesStore((s) => s.ids);
  const toggle = useFavoritesStore((s) => s.toggle);
  const isFav = favIds.includes(worker.id);
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;
  const openNow = worker.emergency;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.4) }}
    >
      <Link
        href={`/workers/${worker.slug}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
      >
        <WorkerCover hue={worker.hue} icon={cat?.icon} className="h-40 w-full">
          <div className="absolute inset-x-3 top-3 flex items-start justify-between">
            <div className="flex flex-wrap gap-1.5">
              {worker.emergency && <EmergencyBadge compact />}
              {worker.premium && <PremiumBadge compact />}
              {worker.featured && (
                <Badge variant="glass" className="px-1.5 backdrop-blur-md">
                  ★
                </Badge>
              )}
            </div>
          </div>
          {openNow && (
            <span className="absolute bottom-3 start-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-white" />
              </span>
              {t("search.open")}
            </span>
          )}
          <button
            type="button"
            aria-label={isFav ? t("common.remove") : t("common.favorite")}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggle(worker);
              toast(isFav ? "info" : "success", isFav ? t("common.remove") : t("common.favorite"), name);
            }}
            className="absolute bottom-3 end-3 rounded-full bg-white/85 p-2 text-ink-600 shadow-soft backdrop-blur-sm transition-all hover:scale-110 hover:text-red-500 dark:bg-ink-900/80 dark:text-ink-200"
          >
            <Heart className={cn("size-4", isFav && "fill-red-500 text-red-500")} />
          </button>
        </WorkerCover>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start gap-3">
            <GradientAvatar name={worker.nameEn} hue={worker.hue} className="-mt-8 size-12 ring-4 ring-white dark:ring-ink-900" />
            <div className="min-w-0 flex-1 pt-1">
              <h3 className="clamp-1 text-base font-bold text-ink-900 dark:text-ink-50">{name}</h3>
              <p className="clamp-1 text-xs font-medium text-ink-500 dark:text-ink-400">
                {locale === "ar" ? cat?.nameAr : cat?.nameEn} · {locale === "ar" ? cat?.taglineAr : cat?.taglineEn}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Rating value={worker.rating} showValue />
            <span className="text-xs text-ink-400 dark:text-ink-500">
              ({formatNumber(worker.reviewCount)} {t("common.reviews")})
            </span>
            {worker.verified && <VerifiedBadge compact />}
          </div>

          {/* W1 trust signals (docs/ENHANCEMENT-PLAN.md §2.1) — customers
              select on responsiveness and availability, not just rating. The
              M5 fee-waiver chip rides along so Enterprise workers surface the
              perk at the listing level, before the profile or the booking
              dialog (docs/booking-take-rate.md §5). */}
          {(worker.responseRate != null || worker.availableThisWeek || isPlanFeeExempt(worker.subscription.plan)) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {worker.availableThisWeek && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                  <CalendarCheck2 className="size-3" />
                  {t("worker.freeThisWeek")}
                </span>
              )}
              {worker.responseRate != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:text-brand-400">
                  <Zap className="size-3" />
                  {t("worker.responseRate").replace("{rate}", String(worker.responseRate))}
                </span>
              )}
              {isPlanFeeExempt(worker.subscription.plan) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400"
                  title={t("worker.feeWaivedHint")}
                >
                  <ShieldCheck className="size-3" />
                  {t("worker.feeWaived")}
                </span>
              )}
            </div>
          )}

          <p className="clamp-2 mt-2.5 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
            {locale === "ar" ? worker.bioAr : worker.bioEn}
          </p>

          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
            <div className="flex items-center gap-1.5 text-xs text-ink-500 dark:text-ink-400">
              <MapPin className="size-3.5" />
              <span className="font-medium">{worker.citySlug}</span>
              <span aria-hidden>·</span>
              <Clock className="size-3.5" />
              <span>{worker.yearsExp} {t("common.yearsExp")}</span>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-600 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 dark:text-brand-400">
              <Price amount={worker.priceMin} currency={worker.currency} locale={locale} className="text-sm" />
              <ArrowUpRight className="size-3.5 rtl:rotate-[-90deg]" />
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/** Skeleton placeholder while loading grids. */
export function WorkerCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900">
      <div className="skeleton h-40 w-full" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <div className="skeleton size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-2/3 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
    </div>
  );
}
