"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { Category } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { CategoryIcon } from "@/components/shared/category-icon";
import { formatNumber } from "@/lib/utils";

export function CategoriesGrid({ categories }: { categories: Category[] }) {
  const { locale, t, dir } = useLocale();

  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8" data-tour="categories" style={{ contentVisibility: 'auto' }}>
      <SectionHeading
        eyebrow={t("categories.title")}
        title={t("categories.subtitle")}
        dir={dir}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-7">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.slug}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.5) }}
          >
            <Link
              href={`/search?category=${cat.slug}`}
              className="group relative flex h-full flex-col items-center gap-3 overflow-hidden rounded-2xl border border-ink-200/80 bg-white p-5 text-center shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
            >
              <div
                className="flex size-12 items-center justify-center rounded-xl text-white shadow-soft transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
                style={{
                  background: `linear-gradient(135deg, hsl(${cat.hue} 70% 55%), hsl(${(cat.hue + 40) % 360} 72% 42%))`,
                }}
              >
                <CategoryIcon name={cat.icon} className="size-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                  {locale === "ar" ? cat.nameAr : cat.nameEn}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-ink-400 dark:text-ink-500">
                  {formatNumber(cat.workerCount)} {t("categories.workersIn")}
                </p>
              </div>
              <ArrowUpRight className="absolute end-3 top-3 size-4 text-ink-300 opacity-0 transition-all duration-300 group-hover:text-brand-500 group-hover:opacity-100 dark:text-ink-600" />
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
