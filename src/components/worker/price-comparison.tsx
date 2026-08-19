"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, Scale, Star, Shield, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { Price } from "@/components/shared/price";
import { Rating } from "@/components/ui/rating";
import { cn, formatNumber } from "@/lib/utils";

import type { CurrencyCode } from "@/lib/utils";

interface WorkerForComparison {
  id: string;
  nameEn: string;
  nameAr: string;
  slug: string;
  categorySlug: string;
  rating: number;
  reviewCount: number;
  priceMin: number;
  priceMax: number;
  currency: CurrencyCode;
  yearsExp: number;
  verified: boolean;
  premium: boolean;
  emergency: boolean;
  responseRate?: number;
  services: { nameEn: string; nameAr: string; price: number }[];
}

interface PriceComparisonProps {
  workers: WorkerForComparison[];
  maxWorkers?: number;
  onRemove?: (workerId: string) => void;
  onAddMore?: () => void;
}

/**
 * Price comparison table for workers
 */
export function PriceComparison({
  workers,
  maxWorkers = 4,
  onRemove,
  onAddMore,
}: PriceComparisonProps) {
  const { locale } = useLocale();
  const isArabic = locale === "ar";

  if (workers.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300 bg-white/60 px-6 py-12 text-center dark:border-ink-700 dark:bg-ink-900/40">
        <Scale className="size-12 text-ink-300" />
        <h3 className="mt-4 text-lg font-bold text-ink-900 dark:text-ink-50">
          {isArabic ? "قارن الأسعار" : "Compare Prices"}
        </h3>
        <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
          {isArabic
            ? "أضف عمالاً لمقارنة الأسعار والخدمات"
            : "Add workers to compare prices and services"}
        </p>
        {workers.length < maxWorkers && (
          <Button variant="outline" className="mt-4 gap-2" onClick={onAddMore}>
            <Plus className="size-4" />
            {isArabic ? "أضف عامل" : "Add Worker"}
          </Button>
        )}
      </div>
    );
  }

  // Get all unique services
  const allServices = Array.from(
    new Set(workers.flatMap((w) => w.services.map((s) => s.nameEn)))
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b border-ink-200 dark:border-ink-800">
            <th className="pb-3 text-start text-xs font-bold text-ink-500 dark:text-ink-400">
              {isArabic ? "المقارنة" : "Compare"}
            </th>
            {workers.map((worker) => (
              <th key={worker.id} className="pb-3 text-center">
                <div className="relative inline-block">
                  <div className="flex flex-col items-center gap-2">
                    <div className="relative">
                      <div className="flex size-12 items-center justify-center rounded-full bg-brand-500/10 text-lg font-bold text-brand-600 dark:text-brand-400">
                        {(isArabic ? worker.nameAr : worker.nameEn).charAt(0)}
                      </div>
                      {worker.verified && (
                        <Shield className="absolute -end-1 -top-1 size-4 text-emerald-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink-900 dark:text-ink-50">
                        {isArabic ? worker.nameAr : worker.nameEn}
                      </p>
                      <Rating value={worker.rating} size={10} showValue />
                    </div>
                  </div>
                  {onRemove && (
                    <button
                      onClick={() => onRemove(worker.id)}
                      className="absolute -end-2 -top-2 rounded-full bg-ink-200 p-1 text-ink-500 hover:bg-red-500 hover:text-white dark:bg-ink-700"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              </th>
            ))}
            {workers.length < maxWorkers && (
              <th className="pb-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={onAddMore}
                >
                  <Plus className="size-4" />
                </Button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {/* Price range row */}
          <tr className="border-b border-ink-100 dark:border-ink-800">
            <td className="py-3 text-xs font-bold text-ink-600 dark:text-ink-300">
              {isArabic ? "نطاق السعر" : "Price Range"}
            </td>
            {workers.map((worker) => (
              <td key={worker.id} className="py-3 text-center">
                <Price
                  amount={worker.priceMin}
                  currency={worker.currency}
                  locale={locale}
                  className="text-sm font-bold"
                />
                <span className="text-ink-400"> - </span>
                <Price
                  amount={worker.priceMax}
                  currency={worker.currency}
                  locale={locale}
                  className="text-sm font-bold"
                />
              </td>
            ))}
            {workers.length < maxWorkers && <td />}
          </tr>

          {/* Experience row */}
          <tr className="border-b border-ink-100 dark:border-ink-800">
            <td className="py-3 text-xs font-bold text-ink-600 dark:text-ink-300">
              {isArabic ? "الخبرة" : "Experience"}
            </td>
            {workers.map((worker) => (
              <td key={worker.id} className="py-3 text-center">
                <span className="flex items-center justify-center gap-1 text-sm text-ink-700 dark:text-ink-200">
                  <Clock className="size-3 text-ink-400" />
                  {worker.yearsExp} {isArabic ? "سنوات" : "years"}
                </span>
              </td>
            ))}
            {workers.length < maxWorkers && <td />}
          </tr>

          {/* Reviews row */}
          <tr className="border-b border-ink-100 dark:border-ink-800">
            <td className="py-3 text-xs font-bold text-ink-600 dark:text-ink-300">
              {isArabic ? "التقييمات" : "Reviews"}
            </td>
            {workers.map((worker) => (
              <td key={worker.id} className="py-3 text-center">
                <span className="text-sm text-ink-700 dark:text-ink-200">
                  {formatNumber(worker.reviewCount)}
                </span>
              </td>
            ))}
            {workers.length < maxWorkers && <td />}
          </tr>

          {/* Response rate row */}
          <tr className="border-b border-ink-100 dark:border-ink-800">
            <td className="py-3 text-xs font-bold text-ink-600 dark:text-ink-300">
              {isArabic ? "معدل الاستجابة" : "Response Rate"}
            </td>
            {workers.map((worker) => (
              <td key={worker.id} className="py-3 text-center">
                <span className="text-sm text-ink-700 dark:text-ink-200">
                  {worker.responseRate ? `${worker.responseRate}%` : "-"}
                </span>
              </td>
            ))}
            {workers.length < maxWorkers && <td />}
          </tr>

          {/* Services rows */}
          {allServices.map((serviceName) => (
            <tr key={serviceName} className="border-b border-ink-100 dark:border-ink-800">
              <td className="py-3 text-xs text-ink-600 dark:text-ink-300">
                {serviceName}
              </td>
              {workers.map((worker) => {
                const service = worker.services.find(
                  (s) => s.nameEn === serviceName
                );
                return (
                  <td key={worker.id} className="py-3 text-center">
                    {service ? (
                      <Price
                        amount={service.price}
                        currency={worker.currency}
                        locale={locale}
                        className="text-sm font-bold text-brand-600 dark:text-brand-400"
                      />
                    ) : (
                      <span className="text-ink-300">-</span>
                    )}
                  </td>
                );
              })}
              {workers.length < maxWorkers && <td />}
            </tr>
          ))}

          {/* Badges row */}
          <tr>
            <td className="py-3 text-xs font-bold text-ink-600 dark:text-ink-300">
              {isArabic ? "المميزات" : "Features"}
            </td>
            {workers.map((worker) => (
              <td key={worker.id} className="py-3">
                <div className="flex flex-wrap justify-center gap-1">
                  {worker.verified && (
                    <Badge variant="success" className="text-[9px]">
                      {isArabic ? "موثق" : "Verified"}
                    </Badge>
                  )}
                  {worker.premium && (
                    <Badge variant="premium" className="text-[9px]">
                      {isArabic ? "مميز" : "Premium"}
                    </Badge>
                  )}
                  {worker.emergency && (
                    <Badge variant="danger" className="text-[9px]">
                      {isArabic ? "طارئ" : "Emergency"}
                    </Badge>
                  )}
                </div>
              </td>
            ))}
            {workers.length < maxWorkers && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
