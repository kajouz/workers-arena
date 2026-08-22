"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { PortfolioGallery } from "./portfolio-gallery";
import type { Worker } from "@/lib/data/types";

interface WorkerPortfolioProps {
  worker: Worker;
}

/**
 * Worker portfolio section - wraps the PortfolioGallery with worker data
 */
export function WorkerPortfolio({ worker }: WorkerPortfolioProps) {
  const { locale } = useLocale();
  
  // Transform worker gallery data to PortfolioGallery format
  const images = worker.gallery.map((item, index) => ({
    id: `portfolio-${worker.id}-${index}`,
    title: item.titleEn,
    titleAr: item.titleAr,
    hue: item.hue,
    // Generate category from service name if available
    category: worker.services[index % worker.services.length]?.nameEn,
  }));

  // Don't render if no portfolio items
  if (images.length === 0) {
    return null;
  }

  return (
    <PortfolioGallery
      images={images}
      workerName={worker.nameEn}
      workerNameAr={worker.nameAr}
      locale={locale as "en" | "ar"}
      maxDisplay={6}
      showBeforeAfter={false}
    />
  );
}
