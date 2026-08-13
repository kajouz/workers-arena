"use client";

import type { Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { SectionHeading } from "@/components/shared/section-heading";
import { WorkerCard } from "@/components/shared/worker-card";

export function RelatedWorkers({ workers }: { workers: Worker[] }) {
  const { t, dir } = useLocale();

  if (workers.length === 0) return null;

  return (
    <section className="mt-20">
      <SectionHeading eyebrow="✦" title={t("worker.relatedTitle")} dir={dir} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {workers.map((w, i) => (
          <WorkerCard key={w.id} worker={w} index={i} />
        ))}
      </div>
    </section>
  );
}
