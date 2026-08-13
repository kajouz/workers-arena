"use client";

import { useState } from "react";
import { CalendarClock, CheckCircle2, Languages as LanguagesIcon, Clock, Award, Briefcase, Images } from "lucide-react";
import type { Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WorkerCover } from "@/components/shared/worker-cover";
import { Price } from "@/components/shared/price";
import { cn, DAYS_AR, DAYS_EN, formatNumber } from "@/lib/utils";
import { categoryBySlug } from "@/lib/data/categories";

export function ProfileTabs({ worker }: { worker: Worker }) {
  const { locale, t } = useLocale();
  const [tab, setTab] = useState("about");
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;
  const cat = categoryBySlug(worker.categorySlug);

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="w-full flex-wrap justify-start sm:w-auto">
        <TabsTrigger value="about">
          <Briefcase className="size-4" /> {t("worker.about")}
        </TabsTrigger>
        <TabsTrigger value="services">
          <Award className="size-4" /> {t("worker.services")}
        </TabsTrigger>
        <TabsTrigger value="portfolio">
          <Images className="size-4" /> {t("worker.portfolio")}
        </TabsTrigger>
        <TabsTrigger value="certifications">
          <CheckCircle2 className="size-4" /> {t("worker.certifications")}
        </TabsTrigger>
        <TabsTrigger value="hours">
          <CalendarClock className="size-4" /> {t("worker.hours")}
        </TabsTrigger>
      </TabsList>

      {/* About */}
      <TabsContent value="about">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{t("worker.about")}</h3>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-600 dark:text-ink-300">
            {locale === "ar" ? worker.bioAr : worker.bioEn}
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <InfoTile icon={<Briefcase className="size-4" />} label={t("worker.yearsOld")} value={`${worker.yearsExp} ${t("common.yearsExp")}`} />
            <InfoTile icon={<Images className="size-4" />} label={t("worker.completedJobs")} value={`${formatNumber(worker.views + 140)}`} />
            <InfoTile
              icon={<LanguagesIcon className="size-4" />}
              label={t("worker.languages")}
              value={worker.languages.map((l) => (locale === "ar" ? l.nameAr : l.nameEn)).join(" · ")}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t("worker.badges")}:</span>
            {worker.verified && <Badge variant="success">{t("common.verified")}</Badge>}
            {worker.premium && <Badge variant="premium">{t("common.premium")}</Badge>}
            {worker.emergency && <Badge variant="danger">{t("common.emergency")}</Badge>}
            {worker.featured && <Badge>{t("common.featured")}</Badge>}
          </div>
        </Card>
      </TabsContent>

      {/* Services */}
      <TabsContent value="services">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-ink-100 p-6 pb-4 dark:border-ink-800">
            <div>
              <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{t("worker.services")}</h3>
              <p className="text-sm text-ink-400">{cat ? (locale === "ar" ? cat.nameAr : cat.nameEn) : ""}</p>
            </div>
            <Price amount={worker.priceMin} currency={worker.currency} locale={locale} className="text-lg font-black text-brand-600 dark:text-brand-400" />
          </div>
          <ul className="divide-y divide-ink-100 dark:divide-ink-800">
            {worker.services.map((s) => (
              <li key={s.nameEn} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? s.nameAr : s.nameEn}
                  </p>
                  <p className="text-xs text-ink-400">
                    {s.unit === "hour" ? t("common.perHour") : t("common.perJob")}
                  </p>
                </div>
                <Price amount={s.price} currency={worker.currency} locale={locale} className="shrink-0 text-sm font-bold text-brand-600 dark:text-brand-400" />
              </li>
            ))}
          </ul>
          <div className="border-t border-ink-100 bg-ink-50/60 px-6 py-4 text-center text-xs text-ink-400 dark:border-ink-800 dark:bg-ink-800/40">
            {t("common.negotiable")} · {t("worker.phoneNote")}
          </div>
        </Card>
      </TabsContent>

      {/* Portfolio */}
      <TabsContent value="portfolio">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {worker.gallery.map((item, i) => (
            <WorkerCover
              key={i}
              hue={item.hue}
              className="group aspect-square rounded-2xl"
              iconClassName="size-16"
            >
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-10">
                <p className="text-sm font-bold text-white">{locale === "ar" ? item.titleAr : item.titleEn}</p>
              </div>
              <span className="absolute start-3 top-3 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                {String(i + 1).padStart(2, "0")}
              </span>
            </WorkerCover>
          ))}
        </div>
      </TabsContent>

      {/* Certifications */}
      <TabsContent value="certifications">
        <Card className="p-6">
          <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{t("worker.certifications")}</h3>
          <ul className="mt-4 space-y-3">
            {worker.certifications.map((c, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-ink-100 p-4 transition-colors hover:border-brand-500/30 dark:border-ink-800">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Award className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{locale === "ar" ? c.nameAr : c.nameEn}</p>
                  <p className="text-xs text-ink-400">
                    {locale === "ar" ? c.issuerAr : c.issuerEn} · {c.year}
                  </p>
                </div>
                <Badge variant="success">
                  <CheckCircle2 className="size-3" /> {t("common.verified")}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </TabsContent>

      {/* Hours */}
      <TabsContent value="hours">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{t("worker.workingDays")}</h3>
            <Badge variant={worker.emergency ? "danger" : "success"}>
              <Clock className="size-3" />
              {worker.emergency ? t("common.emergency") : t("search.open")}
            </Badge>
          </div>
          <ul className="mt-4 space-y-1">
            {worker.hours.map((h) => {
              const today = new Date().getDay();
              const isToday = h.day === today;
              const labels = locale === "ar" ? DAYS_AR : DAYS_EN;
              return (
                <li
                  key={h.day}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm",
                    isToday && "bg-brand-500/10 font-bold text-brand-700 dark:text-brand-400"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {labels[h.day]}
                    {isToday && <span className="rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-black text-white">●</span>}
                  </span>
                  <span className={cn("text-ink-500 dark:text-ink-400", h.closed && "text-red-500")}>
                    {h.closed ? (h.open === "00:00" && h.close === "00:00" ? "24/7" : t("common.closed")) : `${h.open} – ${h.close}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function InfoTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-100 p-4 dark:border-ink-800">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-400">
        {icon}
        {label}
      </span>
      <p className="mt-1.5 text-sm font-bold text-ink-900 dark:text-ink-50">{value}</p>
    </div>
  );
}
