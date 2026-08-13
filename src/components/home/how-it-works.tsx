"use client";

import { motion } from "framer-motion";
import { Search, Star, MessageCircle } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";

const STEPS = ["step1Title", "step1Body", "step2Title", "step2Body", "step3Title", "step3Body"] as const;

export function HowItWorks() {
  const { locale, t, dir } = useLocale();
  const icons = [Search, Star, MessageCircle];
  const hues = [205, 45, 150];

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionHeading eyebrow="✦" title={t("how.title")} subtitle={t("how.subtitle")} dir={dir} />
      <div className="relative grid gap-6 md:grid-cols-3">
        <div className="absolute inset-x-16 top-10 hidden h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent md:block" aria-hidden />
        {[0, 1, 2].map((i) => {
          const Icon = icons[i];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.12 }}
              className="relative rounded-3xl border border-ink-200/80 bg-white p-7 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
            >
              <span
                className="relative z-10 flex size-14 items-center justify-center rounded-2xl text-white shadow-soft"
                style={{ background: `linear-gradient(135deg, hsl(${hues[i]} 70% 55%), hsl(${(hues[i] + 35) % 360} 72% 42%))` }}
              >
                <Icon className="size-6" />
              </span>
              <span className="absolute end-5 top-5 text-5xl font-black text-ink-100 dark:text-ink-800">
                0{i + 1}
              </span>
              <h3 className="mt-5 text-lg font-bold text-ink-900 dark:text-ink-50">
                {t(`how.${STEPS[i * 2]}`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500 dark:text-ink-400">
                {t(`how.${STEPS[i * 2 + 1]}`)}
              </p>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
