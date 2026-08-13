"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import type { Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { useFavoritesStore } from "@/lib/store";
import { WorkerCard } from "@/components/shared/worker-card";
import { Button } from "@/components/ui/button";

export function FavoritesClient({ workers }: { workers: Worker[] }) {
  const { locale, t } = useLocale();
  const ids = useFavoritesStore((s) => s.ids);
  const saved = workers.filter((w) => ids.includes(w.id));

  if (saved.length === 0) {
    return (
      <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-ink-300 bg-white/60 px-6 py-20 text-center dark:border-ink-700 dark:bg-ink-900/40">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
          <Heart className="size-8" />
        </span>
        <h3 className="mt-5 text-lg font-bold text-ink-900 dark:text-ink-50">
          {locale === "ar" ? "لا توجد مفضلة بعد" : "No favorites yet"}
        </h3>
        <p className="mt-1.5 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          {locale === "ar"
            ? "اضغط على أيقونة القلب في بطاقة أي عامل لحفظه هنا."
            : "Tap the heart on any worker card to save them here."}
        </p>
        <Link href="/search" className="mt-6">
          <Button>{t("nav.findWorkers")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {saved.map((w, i) => (
        <WorkerCard key={w.id} worker={w} index={i} />
      ))}
    </div>
  );
}
