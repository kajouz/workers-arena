"use client";

import { Link } from "@/components/i18n/link";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Category } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { CategoryIcon } from "@/components/shared/category-icon";
import { cn, formatNumber, pluralize } from "@/lib/utils";

/** Tiles shown on phones (3 × 3) and on tablets (4 × 3); desktop shows all. */
const PHONE_LIMIT = 9;
const TABLET_LIMIT = 12;

export function CategoriesGrid({ categories }: { categories: Category[] }) {
  const { locale, t, dir } = useLocale();
  const Arrow = dir === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-20 lg:px-8" data-tour="categories">
      <SectionHeading
        eyebrow={t("categories.title")}
        title={t("categories.subtitle")}
        dir={dir}
      />
      {/* Compact, equal tiles that always fill whole rows:
            phones      3 cols × 3 rows (first 9) + "All categories"
            sm–lg       4 cols × 3 rows (first 12) + "All categories"
            lg and up   7 cols × 3 rows (all 21)
          auto-rows-fr + top-aligned content: every row is the height of the
          tallest (two-line names), and icons sit on one line across a row.
          The worker count only shows from sm: at ~100px a phone tile has room
          for the icon and a two-line name, not a third line (the old 2-column
          phone layout that made room for it ran 11 rows, ~1500px, with the
          21st tile alone on the last row). */}
      <ul className="grid auto-rows-fr grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7 lg:gap-4">
        {categories.map((cat, i) => (
          <motion.li
            key={cat.slug}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.3, delay: Math.min((i % 7) * 0.04, 0.3) }}
            className={cn(i >= PHONE_LIMIT && "hidden", i >= PHONE_LIMIT && i < TABLET_LIMIT && "sm:block", i >= PHONE_LIMIT && "lg:block")}
          >
            <Link
              href={`/search?category=${cat.slug}`}
              className="group relative flex h-full min-h-[6.5rem] flex-col items-center justify-start gap-2 rounded-2xl border border-ink-200/70 bg-white px-1.5 py-3 text-center shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lift sm:min-h-[8.5rem] sm:gap-2.5 sm:px-3 sm:py-4 dark:border-ink-800 dark:bg-ink-900"
            >
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-soft transition-transform duration-300 group-hover:scale-105 sm:size-12"
                style={{
                  background: `linear-gradient(135deg, hsl(${cat.hue} 70% 55%), hsl(${(cat.hue + 40) % 360} 72% 42%))`,
                }}
                aria-hidden
              >
                <CategoryIcon name={cat.icon} className="size-5 sm:size-6" />
              </span>
              <span className="clamp-2 text-[0.8125rem] font-bold leading-snug text-ink-900 sm:text-sm dark:text-ink-50">
                {locale === "ar" ? cat.nameAr : cat.nameEn}
              </span>
              <span className="hidden text-[11px] font-medium text-ink-500 sm:block dark:text-ink-400">
                {cat.workerCount > 0
                  ? `${formatNumber(cat.workerCount)} ${pluralize(locale, cat.workerCount, locale === "ar"
                      ? { zero: "عامل", one: "عامل", two: "عاملان", few: "عمال", many: "عاملًا", other: "عامل" }
                      : { one: "worker", other: "workers" })}`
                  : t("categories.noWorkersYet")}
              </span>
            </Link>
          </motion.li>
        ))}
      </ul>

      {categories.length > PHONE_LIMIT && (
        <div className="mt-6 flex justify-center lg:hidden">
          <Link
            href="/categories"
            className="group inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-800 shadow-soft transition-colors hover:border-brand-500/40 hover:text-brand-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100"
          >
            {t("categories.allCategories")} · {formatNumber(categories.length)}
            <Arrow className="size-4 transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Link>
        </div>
      )}
    </section>
  );
}
