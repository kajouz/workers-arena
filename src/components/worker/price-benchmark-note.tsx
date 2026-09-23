"use client";

/**
 * §Price benchmarks (docs/ENHANCEMENT-PLAN.md Phase 2) — the answer to "is this
 * number fair?", shown next to the number.
 *
 * A worker profile states a price and nothing else, which leaves the customer to
 * guess whether it is a going rate or a gouge — the single most common reason a
 * services marketplace loses the visitor. This note puts the band of what jobs
 * like theirs actually cost next to the worker's own starting price, from real
 * accepted quotes, and says plainly where that price lands.
 *
 * It renders NOTHING when the engine cannot state a range (fewer than
 * `BENCHMARK_MIN_SAMPLE` completed jobs in the trade): an unsupported band would
 * be worse than no band, because the customer would trust it.
 */

import { TrendingUp } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { TENANT_CURRENCY } from "@/lib/currency";
import { priceStanding, type PriceBenchmark } from "@/lib/data/price-benchmarks";

export function PriceBenchmarkNote({
  benchmark,
  workerPriceMin,
  categoryNameEn,
  categoryNameAr,
  className,
}: {
  benchmark: PriceBenchmark | null;
  /** The worker's own starting price, in MAJOR units (the domain convention). */
  workerPriceMin: number;
  /** The trade's name in both languages — the reader's locale picks one. */
  categoryNameEn: string;
  categoryNameAr: string;
  className?: string;
}) {
  const { locale, t } = useLocale();
  if (!benchmark) return null;
  const categoryName = locale === "ar" ? categoryNameAr : categoryNameEn;

  const minor = (value: number) => formatPrice(value / 100, TENANT_CURRENCY, locale);
  const standing = priceStanding(Math.round(workerPriceMin * 100), benchmark);

  return (
    <Card className={className}>
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <TrendingUp className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
            {t("benchmark.title", { category: categoryName })}
          </p>
          <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
            <span className="font-black tabular-nums text-ink-900 dark:text-ink-50">
              {t("benchmark.range", { low: minor(benchmark.lowMinor), high: minor(benchmark.highMinor) })}
            </span>
            {" · "}
            {t("benchmark.median", { median: minor(benchmark.medianMinor) })}
            {" · "}
            {t("benchmark.sample", { count: benchmark.sampleSize })}
          </p>
          {standing && (
            <p className="mt-1 text-[11px] font-semibold text-ink-600 dark:text-ink-300">
              {t(`benchmark.standing.${standing}`, { price: minor(Math.round(workerPriceMin * 100)) })}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
