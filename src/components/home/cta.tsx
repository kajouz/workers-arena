"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Wrench, Star, Users } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";

export function CTA() {
  const { locale, t, dir } = useLocale();
  const Arrow = dir === "rtl" ? ArrowRight : ArrowRight;

  return (
    <section className="mx-auto max-w-7xl px-4 pb-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5 }}
        className="noise relative overflow-hidden rounded-[2rem] bg-ink-950 px-6 py-16 text-center text-white shadow-lift sm:px-12"
      >
        <div className="absolute -top-24 start-1/4 size-72 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="absolute -bottom-24 end-1/4 size-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="relative">
          <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-glow">
            <Wrench className="size-8" />
          </span>
          <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
            {t("cta.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70">{t("cta.subtitle")}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/auth/register">
              <Button size="lg" className="group">
                {t("cta.button")}
                <Arrow className="size-4 transition-transform group-hover:translate-x-1 rtl:group-hover:-translate-x-1" />
              </Button>
            </Link>
            <Link href="/auth/login">
              <Button size="lg" variant="glass" className="text-white">
                {t("common.login")}
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs font-medium text-white/50">{t("cta.sub")}</p>
          <div className="mx-auto mt-10 flex max-w-md items-center justify-center gap-8 text-xs font-semibold text-white/60">
            <span className="flex items-center gap-1.5">
              <Star className="size-3.5 text-brand-400" /> 4.8 {t("hero.statRating")}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-3.5 text-brand-400" /> {locale === "ar" ? "أكثر من 2,400 عامل" : "2,400+ workers"}
            </span>
            <span className="flex items-center gap-1.5">
              <Wrench className="size-3.5 text-brand-400" /> 21 {locale === "ar" ? "مهنة" : "trades"}
            </span>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
