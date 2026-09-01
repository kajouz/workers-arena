"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Star, Clock3 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { SearchBar } from "./search-bar";
import { Rating } from "@/components/ui/rating";
import { GradientAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export function Hero({ popular }: { popular: { en: string; ar: string; href: string }[] }) {
  const { locale, t } = useLocale();

  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] as const },
  });

  return (
    <section className="relative overflow-hidden">
      {/* backdrop */}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-50 via-white to-ink-50 dark:from-ink-900 dark:via-ink-950 dark:to-ink-950" />
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-32 start-1/4 size-[420px] rounded-full bg-brand-400/25 blur-3xl dark:bg-brand-600/15" />
      <div className="absolute -top-20 end-1/4 size-[360px] rounded-full bg-violet-400/20 blur-3xl dark:bg-violet-600/10" />
      <div className="absolute top-40 start-10 size-64 rounded-full bg-sky-300/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-12 lg:items-center lg:pb-28 lg:pt-24 lg:px-8">
        {/* Copy */}
        <div className="lg:col-span-7">
          <motion.div {...fadeUp(0)}>
            <Badge variant="glass" className="mb-5 rounded-full px-4 py-1.5 text-xs">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              {t("hero.badge")}
            </Badge>
          </motion.div>

          <motion.h1
            {...fadeUp(0.08)}
            className="text-4xl font-black leading-[1.08] tracking-tight text-ink-900 dark:text-ink-50 sm:text-5xl lg:text-6xl"
          >
            {locale === "ar" ? (
              <>
                {t("hero.title1")}
                <span className="text-gradient block">{t("hero.titleAccent")}</span>
                {t("hero.title2")}
              </>
            ) : (
              <>
                {t("hero.title1")} <span className="text-gradient">{t("hero.titleAccent")}</span>{" "}
                {t("hero.title2")}
              </>
            )}
          </motion.h1>

          <motion.p
            {...fadeUp(0.16)}
            className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-500 dark:text-ink-400 lg:mx-0"
          >
            {t("hero.subtitle")}
          </motion.p>

          <motion.div {...fadeUp(0.24)} className="mt-8" data-tour="search">
            <SearchBar popular={popular} />
          </motion.div>

          <motion.ul {...fadeUp(0.32)} className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 lg:justify-start">
            {[t("hero.trustPoint1"), t("hero.trustPoint2"), t("hero.trustPoint3")].map((point) => (
              <li key={point} className="flex items-center gap-1.5 text-sm font-medium text-ink-600 dark:text-ink-300">
                <span className="emerald-icon flex size-4 items-center justify-center rounded-full emerald-badge-sm">
                  <svg viewBox="0 0 12 12" className="size-2.5 fill-current">
                    <path d="M4.5 9.5 1.5 6.5l1-1 2 2 5-5 1 1-6 6z" />
                  </svg>
                </span>
                {point}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* Floating showcase */}
        <motion.div
          {...fadeUp(0.3)}
          className="relative hidden lg:col-span-5 lg:block"
          aria-hidden
        >
          <div className="relative mx-auto aspect-[4/3] max-w-md">
            {/* main card */}
            <div className="glass-strong absolute inset-x-6 top-2 rounded-3xl p-5 shadow-lift">
              <div className="flex items-center gap-3">
                <GradientAvatar name="Omar Al-Mutairi" hue={190} className="size-14 ring-4 ring-white/40" />
                <div>
                  <p className="font-bold text-ink-900 dark:text-ink-50">Omar Al-Mutairi</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">AC Technician · Riyadh</p>
                </div>
                <Badge variant="success" className="ms-auto">
                  <ShieldCheck className="size-3" /> Verified
                </Badge>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Rating value={4.9} showValue />
                <span className="text-xs text-ink-400">210 {t("common.reviews")}</span>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-ink-100/70 px-4 py-3 dark:bg-ink-800/70">
                <span className="text-xs font-medium text-ink-500 dark:text-ink-400">
                  {t("worker.services")}
                </span>
                <span className="text-sm font-bold text-brand-600 dark:text-brand-400">AC maintenance · 150 ر.س</span>
              </div>
            </div>

            {/* floating rating card */}
            <motion.div
              className="glass absolute -start-2 top-24 z-10 rounded-2xl p-3.5 shadow-lift"
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex size-9 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400">
                  <Star className="size-4 fill-current" />
                </span>
                <div>
                  <p className="text-lg font-black text-ink-900 dark:text-ink-50">4.9</p>
                  <p className="text-[11px] font-medium text-ink-400">{t("hero.statRating")}</p>
                </div>
              </div>
            </motion.div>

            {/* floating availability card */}
            <motion.div
              className="glass absolute bottom-6 end-0 z-10 rounded-2xl p-3.5 shadow-lift"
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
            >
              <div className="flex items-center gap-2.5">
                <span className="emerald-icon flex size-9 items-center justify-center rounded-xl emerald-badge-lg">
                  <Clock3 className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{t("search.open")}</p>
                  <p className="text-[11px] font-medium text-ink-400">{t("worker.emergencyNote")}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
