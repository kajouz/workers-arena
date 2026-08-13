import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getCategories } from "@/lib/data/repo";
import { getI18n } from "@/lib/i18n/server";
import { CategoryIcon } from "@/components/shared/category-icon";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = {
  title: "All categories",
  description: "Browse 20+ professional trades — plumbers, electricians, technicians and more.",
};

export default async function CategoriesPage() {
  const { locale, t } = await getI18n();
  const categories = await getCategories();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
          {t("categories.title")}
        </h1>
        <p className="mt-2 text-ink-500 dark:text-ink-400">{t("categories.subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <Link
            key={cat.slug}
            href={`/search?category=${cat.slug}`}
            className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-ink-200/80 bg-white p-5 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
          >
            <span
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-soft transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
              style={{
                background: `linear-gradient(135deg, hsl(${cat.hue} 70% 55%), hsl(${(cat.hue + 40) % 360} 72% 42%))`,
              }}
            >
              <CategoryIcon name={cat.icon} className="size-7" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-ink-900 dark:text-ink-50">
                {locale === "ar" ? cat.nameAr : cat.nameEn}
              </h2>
              <p className="clamp-1 text-xs text-ink-400">
                {locale === "ar" ? cat.taglineAr : cat.taglineEn}
              </p>
              <p className="mt-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                {formatNumber(cat.workerCount)} {t("categories.workersIn")}
              </p>
            </div>
            <ArrowUpRight className="size-5 shrink-0 text-ink-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-500 dark:text-ink-600" />
          </Link>
        ))}
      </div>
    </div>
  );
}
