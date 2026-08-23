"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Sparkles } from "lucide-react";
import type { Category } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { CategoryIcon } from "@/components/shared/category-icon";
import { formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const ITEMS_PER_PAGE = 14; // Show 2 rows initially on xl (7 cols × 2)

interface CategoriesClientProps {
  categories: Category[];
  locale: "en" | "ar";
}

export function CategoriesClient({ categories, locale }: CategoriesClientProps) {
  const { t } = useLocale();
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

  const hasMore = visibleCount < categories.length;
  const visibleCategories = categories.slice(0, visibleCount);

  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) => Math.min(prev + ITEMS_PER_PAGE, categories.length));
    }
  }, [hasMore, categories.length]);

  const sentinel = useInfiniteScroll(loadMore, hasMore);

  return (
    <div>
      {/* Category Sponsored Banner */}
      <div className="mb-6 overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-r from-violet-50 to-fuchsia-50 p-4 dark:from-violet-950/30 dark:to-fuchsia-950/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-ink-900 dark:text-white">{locale === "ar" ? "عرض مميز" : "Featured Campaign"}</span>
                <Badge className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white text-xs">{t("featured.sponsored")}</Badge>
              </div>
              <p className="text-sm text-ink-500 dark:text-ink-400">{locale === "ar" ? "أضف حملتك الإعلانية هنا" : "Place your campaign here"}</p>
            </div>
          </div>
          <a
            href="/company"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-600 px-4 py-2 text-sm font-bold text-white shadow-lg transition-all hover:from-violet-600 hover:to-fuchsia-700"
          >
            {t("company.createCampaign")}
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-7">
        {visibleCategories.map((cat, i) => (
          <motion.div
            key={cat.slug}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
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

      {/* Load more button / sentinel */}
      {hasMore && (
        <div ref={sentinel} className="mt-8 flex justify-center">
          <button
            onClick={loadMore}
            className="flex items-center gap-2 rounded-full border border-ink-200 bg-white px-6 py-3 text-sm font-bold text-ink-700 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
          >
            <ChevronDown className="size-4" />
            Load more categories
            <span className="text-xs text-ink-400">
              ({visibleCount} / {categories.length})
            </span>
          </button>
        </div>
      )}

      {!hasMore && categories.length > ITEMS_PER_PAGE && (
        <p className="mt-8 text-center text-sm text-ink-400">
          All {categories.length} categories loaded
        </p>
      )}
    </div>
  );
}
