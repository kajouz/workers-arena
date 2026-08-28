"use client";

import { Check, Wrench } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Price } from "@/components/shared/price";
import { cn, type CurrencyCode } from "@/lib/utils";
import type { ServiceItem } from "@/lib/data/types";

/**
 * Service selector for the booking dialog. Selecting a card picks the
 * service (by nameEn — the server resolves it), "Custom job" clears it.
 */
export function ServicePicker({
  services,
  currency,
  value,
  onChange,
}: {
  services: ServiceItem[];
  currency: CurrencyCode;
  value: string | null;
  onChange: (serviceNameEn: string | null) => void;
}) {
  const { locale, t } = useLocale();

  return (
    <div className="space-y-2">
      {services.map((s) => {
        const selected = value === s.nameEn;
        return (
          <button
            key={s.nameEn}
            type="button"
            onClick={() => onChange(selected ? null : s.nameEn)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start transition-all",
              selected
                ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500"
                : "border-ink-200 bg-white hover:border-brand-500/40 dark:border-ink-700 dark:bg-ink-900"
            )}
            aria-pressed={selected}
          >
            <span className="flex min-w-0 items-center gap-3">
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                  selected ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300"
                )}
              >
                <Check className={cn("size-4", !selected && "opacity-0")} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink-900 dark:text-ink-50">
                  {locale === "ar" ? s.nameAr : s.nameEn}
                </span>
                <span className="block text-xs text-ink-400">
                  {s.unit === "hour" ? t("common.perHour") : t("common.perJob")}
                </span>
              </span>
            </span>
            <Price amount={s.price} currency={currency} locale={locale} className="shrink-0 text-sm font-bold text-brand-600 dark:text-brand-400" />
          </button>
        );
      })}

      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start transition-all",
          value === null
            ? "border-brand-500 bg-brand-500/5 ring-1 ring-brand-500"
            : "border-dashed border-ink-300 bg-transparent hover:border-brand-500/40 dark:border-ink-700"
        )}
        aria-pressed={value === null}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
            value === null ? "bg-brand-700 text-white" : "bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-300"
          )}
        >
          <Wrench className="size-4" />
        </span>
        <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">{t("booking.customJob")}</span>
      </button>
    </div>
  );
}
