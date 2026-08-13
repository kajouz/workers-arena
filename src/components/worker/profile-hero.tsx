"use client";

import { QRCodeSVG } from "qrcode.react";
import { motion } from "framer-motion";
import { Heart, Share2, QrCode, MapPin, CalendarDays, Link2, Check, MessageCircle, Zap, CalendarCheck2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Worker } from "@/lib/data/types";
import { categoryBySlug } from "@/lib/data/categories";
import { cityBySlug } from "@/lib/data/cities";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";
import { useLocale } from "@/components/providers/locale-provider";
import { useFavoritesStore } from "@/lib/store";
import { cn, formatNumber } from "@/lib/utils";
import { WorkerCover } from "@/components/shared/worker-cover";
import { GradientAvatar } from "@/components/ui/avatar";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmergencyBadge, PremiumBadge, VerifiedBadge } from "@/components/shared/badges";
import { toast } from "@/components/ui/toast";

export function ProfileHero({ worker }: { worker: Worker }) {
  const { locale, t } = useLocale();
  const cat = categoryBySlug(worker.categorySlug);
  const city = cityBySlug(worker.citySlug);
  const area = city?.areas.find((a) => a.slug === worker.areaSlug);
  const favIds = useFavoritesStore((s) => s.ids);
  const toggle = useFavoritesStore((s) => s.toggle);
  const isFav = favIds.includes(worker.id);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;
  const profileUrl = typeof window !== "undefined" ? window.location.href : `https://workersarena.com/workers/${worker.slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(true);
    toast("success", t("common.copied"));
    setTimeout(() => setCopied(false), 2000);
  };

  const whatsappUrl = `https://wa.me/${worker.whatsapp}?text=${encodeURIComponent(`Hello ${worker.nameEn}, I found you on WorkersArena.`)}`;

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-ink-200/80 bg-white shadow-soft dark:border-ink-800 dark:bg-ink-900">
      <WorkerCover hue={worker.hue} icon={cat?.icon} className="h-52 sm:h-64" iconClassName="size-44" />

      <div className="relative px-5 pb-6 sm:px-8">
        {/* avatar + actions */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="-mt-14 flex items-end gap-4">
            <GradientAvatar
              name={worker.nameEn}
              hue={worker.hue}
              className="size-28 ring-[6px] ring-white dark:ring-ink-900"
            />
            <div className="pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-3xl">{name}</h1>
                {worker.verified && <VerifiedBadge />}
                {worker.premium && <PremiumBadge />}
              </div>
              <p className="mt-1 text-sm font-medium text-ink-500 dark:text-ink-400">
                {locale === "ar" ? cat?.nameAr : cat?.nameEn} ·{" "}
                {locale === "ar" ? cat?.taglineAr : cat?.taglineEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pb-1">
            <Button
              variant="outline"
              size="icon"
              title={t("common.favorite")}
              aria-label={t("common.favorite")}
              onClick={() => {
                toggle(worker);
                toast(isFav ? "info" : "success", isFav ? t("common.remove") : t("common.favorite"), name);
              }}
            >
              <Heart className={cn("size-4", isFav && "fill-red-500 text-red-500")} />
            </Button>
            <Button variant="outline" size="icon" title={t("common.share")} aria-label={t("common.share")} onClick={() => setShareOpen(true)}>
              <Share2 className="size-4" />
            </Button>
            <Button variant="outline" size="icon" title={t("common.scanToView")} aria-label={t("common.scanToView")} onClick={() => setQrOpen(true)}>
              <QrCode className="size-4" />
            </Button>
            <Button asChild variant="success" className="hidden sm:inline-flex">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="size-4" />
                {t("common.whatsapp")}
              </a>
            </Button>
          </div>
        </div>

        {/* meta row */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-100 pt-5 text-sm text-ink-600 dark:border-ink-800 dark:text-ink-300">
          <span className="flex items-center gap-2">
            <Rating value={worker.rating} showValue />
            <span className="text-xs text-ink-400">
              ({formatNumber(worker.reviewCount)} {t("common.reviews")})
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4 text-brand-500" />
            {locale === "ar" ? city?.nameAr : city?.nameEn}
            {area ? ` · ${locale === "ar" ? area.nameAr : area.nameEn}` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-4 text-brand-500" />
            {worker.yearsExp} {t("common.yearsExp")}
          </span>
          {worker.emergency && <EmergencyBadge />}
          {worker.featured && <Badge variant="glass">★ {t("common.featured")}</Badge>}
          {/* W1 trust signals (docs/ENHANCEMENT-PLAN.md §2.1) — responsiveness
              and availability join rating as first-class selection signals. */}
          {worker.availableThisWeek && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
              <CalendarCheck2 className="size-3.5" />
              {t("worker.freeThisWeek")}
            </span>
          )}
          {worker.responseRate != null && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:text-brand-400">
              <Zap className="size-3.5" />
              {t("worker.responseRate").replace("{rate}", String(worker.responseRate))}
            </span>
          )}
          {/* M5 take rate (docs/booking-take-rate.md) — Enterprise workers pay
              no platform fee; customers see the perk (and why there is no fee
              breakdown) before booking. */}
          {isPlanFeeExempt(worker.subscription.plan) && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
              title={t("worker.feeWaivedHint")}
            >
              <ShieldCheck className="size-3.5" />
              {t("worker.feeWaived")}
            </span>
          )}
        </div>
      </div>

      {/* Share dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.shareProfile")}</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-2xl bg-ink-50 p-4 dark:bg-ink-800">
              <QRCodeSVG value={profileUrl} size={140} fgColor="#14120f" bgColor="transparent" />
            </div>
            <p className="text-xs text-ink-400">{t("common.scanToView")}</p>
            <Button className="w-full" onClick={copyLink}>
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              {copied ? t("common.copied") : t("common.copyLink")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("common.scanToView")}</DialogTitle>
            <DialogDescription>{name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-2xl border border-ink-200 p-4 dark:border-ink-700">
              <QRCodeSVG value={profileUrl} size={180} fgColor="#14120f" bgColor="transparent" />
            </div>
            <p className="text-center text-xs text-ink-400">
              {locale === "ar" ? worker.nameAr : worker.nameEn} · {t("common.scanToView")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
