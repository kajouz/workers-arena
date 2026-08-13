"use client";

import type { Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { WorkerCard } from "@/components/shared/worker-card";
import { AdSlot } from "./ad-slot";

export function FeaturedWorkers({ workers }: { workers: Worker[] }) {
  const { locale, t, dir } = useLocale();

  return (
    <section className="relative bg-ink-950 py-20 dark:bg-ink-900/40">
      <div className="absolute inset-0 overflow-hidden">
        <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)] dark:[mask-image:radial-gradient(60%_60%_at_50%_40%,black,transparent)]" />
        <div className="absolute -top-24 start-1/3 size-96 rounded-full bg-brand-600/20 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="★"
          title={t("featured.title")}
          subtitle={t("featured.subtitle")}
          actionLabel={t("featured.viewAll")}
          actionHref="/search"
          dir={dir}
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {workers.map((w, i) => (
            <WorkerCard key={w.id} worker={w} index={i} />
          ))}
        </div>

        {/* native sponsored slot — ad rotation */}
        <AdSlot placement="homepage" className="mt-8" />
      </div>
    </section>
  );
}
