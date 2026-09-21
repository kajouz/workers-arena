import type { Metadata } from "next";
import { FavoritesClient } from "@/components/favorites/favorites-client";
import { getAllWorkers } from "@/lib/data/repo";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Favorites",
  description: "Your saved professional workers.",
};

export default async function FavoritesPage() {
  const { t } = await getI18n();
  const workers = await getAllWorkers();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-black tracking-tight text-ink-900 dark:text-ink-50 sm:text-4xl">
        {t("common.favorites")}
      </h1>
      <p className="mt-2 text-ink-500 dark:text-ink-400">
        {t("search.subtitle")}
      </p>
      <FavoritesClient workers={workers} />
    </div>
  );
}
