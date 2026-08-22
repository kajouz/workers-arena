import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoriesClient } from "@/components/categories/categories-client";
import { getCategories } from "@/lib/data/repo";
import { getI18n } from "@/lib/i18n/server";
import { BreadcrumbStructuredData } from "@/components/seo/structured-data";

export default async function CategoriesPage() {
  const { locale, t } = await getI18n();
  const metadata: Metadata = {
    title: locale === "ar" ? "تصفح التصنيفات" : "Browse Categories",
    description:
      locale === "ar"
        ? "استكشف جميع المهن المتاحة — من السباكة إلى الكهرباء، ومن التنظيف إلى الطلاء. ابحث عن عمال في كل تصنيف."
        : "Explore all available trades — from plumbing to electrical, cleaning to painting. Find workers in every category.",
  };
  const categories = await getCategories();

  return (
    <>
      <BreadcrumbStructuredData
        items={[
          { name: "Home", url: "/" },
          { name: "Categories", url: "/categories" },
        ]}
      />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
            {t("categories.title")}
          </h1>
          <p className="mt-2 text-ink-500 dark:text-ink-400">
            {t("categories.subtitle")}
          </p>
        </div>
        <Suspense fallback={<CategoriesSkeleton />}>
          <CategoriesClient categories={categories} locale={locale} />
        </Suspense>
      </div>
    </>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-7">
      {Array.from({ length: 21 }).map((_, i) => (
        <div
          key={i}
          className="flex h-full flex-col items-center gap-3 rounded-2xl border border-ink-200/80 bg-white p-5 text-center shadow-soft dark:border-ink-800 dark:bg-ink-900"
        >
          <div className="skeleton size-12 rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton h-4 w-20 mx-auto" />
            <div className="skeleton h-3 w-16 mx-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
