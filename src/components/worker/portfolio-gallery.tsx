"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, Grid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface PortfolioItem {
  id: string;
  titleEn: string;
  titleAr: string;
  descriptionEn?: string;
  descriptionAr?: string;
  imageUrl: string;
  beforeImageUrl?: string;
  category?: string;
  tags?: string[];
}

interface PortfolioGalleryProps {
  items: PortfolioItem[];
  workerName: string;
}

/**
 * Worker portfolio gallery with before/after photos and lightbox.
 */
export function PortfolioGallery({ items, workerName }: PortfolioGalleryProps) {
  const { locale } = useLocale();
  const [selectedItem, setSelectedItem] = useState<PortfolioItem | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<string>("all");

  // Get unique categories
  const categories = ["all", ...new Set(items.map((item) => item.category).filter(Boolean))];

  // Filter items
  const filteredItems = filter === "all"
    ? items
    : items.filter((item) => item.category === filter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
          {locale === "ar" ? "معرض الأعمال" : "Portfolio"}
        </h3>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid className="size-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setViewMode("list")}
          >
            <List className="size-4" />
          </Button>
        </div>
      </div>

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat ?? "all")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
                filter === cat
                  ? "bg-brand-500 text-white"
                  : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
              )}
            >
              {cat === "all" ? (locale === "ar" ? "الكل" : "All") : cat}
            </button>
          ))}
        </div>
      )}

      {/* Grid view */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <button
                onClick={() => setSelectedItem(item)}
                className="group relative aspect-square w-full overflow-hidden rounded-xl"
              >
                <img
                  src={item.imageUrl}
                  alt={locale === "ar" ? item.titleAr : item.titleEn}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                {item.beforeImageUrl && (
                  <Badge
                    variant="glass"
                    className="absolute start-2 top-2"
                  >
                    Before/After
                  </Badge>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="absolute bottom-0 start-0 end-0 p-3 text-start opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="text-sm font-bold text-white">
                    {locale === "ar" ? item.titleAr : item.titleEn}
                  </p>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="space-y-3">
          {filteredItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <button
                onClick={() => setSelectedItem(item)}
                className="flex w-full gap-4 rounded-xl border border-ink-200/80 bg-white p-3 text-start transition-all hover:border-brand-500/40 hover:shadow-lift dark:border-ink-800 dark:bg-ink-900"
              >
                <img
                  src={item.imageUrl}
                  alt={locale === "ar" ? item.titleAr : item.titleEn}
                  className="size-20 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? item.titleAr : item.titleEn}
                  </p>
                  {item.descriptionEn && (
                    <p className="mt-1 text-sm text-ink-500 dark:text-ink-400 line-clamp-2">
                      {locale === "ar" ? item.descriptionAr : item.descriptionEn}
                    </p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filteredItems.length === 0 && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300 bg-white/60 px-6 py-12 text-center dark:border-ink-700 dark:bg-ink-900/40">
          <Grid className="size-12 text-ink-300" />
          <p className="mt-4 text-sm text-ink-500 dark:text-ink-400">
            {locale === "ar" ? "لا توجد أعمال في المعرض" : "No portfolio items yet"}
          </p>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {selectedItem && (
          <Lightbox
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onPrev={() => {
              const currentIndex = filteredItems.findIndex((i) => i.id === selectedItem.id);
              const prevIndex = (currentIndex - 1 + filteredItems.length) % filteredItems.length;
              setSelectedItem(filteredItems[prevIndex]);
            }}
            onNext={() => {
              const currentIndex = filteredItems.findIndex((i) => i.id === selectedItem.id);
              const nextIndex = (currentIndex + 1) % filteredItems.length;
              setSelectedItem(filteredItems[nextIndex]);
            }}
            locale={locale}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Lightbox component for viewing portfolio items
 */
function Lightbox({
  item,
  onClose,
  onPrev,
  onNext,
  locale,
}: {
  item: PortfolioItem;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  locale: "en" | "ar";
}) {
  const [showBefore, setShowBefore] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="size-6" />
      </button>

      {/* Navigation */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        className="absolute start-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
      >
        <ChevronLeft className="size-6" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        className="absolute end-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
      >
        <ChevronRight className="size-6" />
      </button>

      {/* Content */}
      <div
        className="flex max-h-[90vh] max-w-4xl flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Before/After toggle */}
        {item.beforeImageUrl && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowBefore(false)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                !showBefore ? "bg-white text-black" : "bg-white/20 text-white"
              )}
            >
              After
            </button>
            <button
              onClick={() => setShowBefore(true)}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                showBefore ? "bg-white text-black" : "bg-white/20 text-white"
              )}
            >
              Before
            </button>
          </div>
        )}

        {/* Image */}
        <img
          src={showBefore && item.beforeImageUrl ? item.beforeImageUrl : item.imageUrl}
          alt={locale === "ar" ? item.titleAr : item.titleEn}
          className="max-h-[70vh] rounded-lg object-contain"
        />

        {/* Info */}
        <div className="text-center">
          <h3 className="text-xl font-bold text-white">
            {locale === "ar" ? item.titleAr : item.titleEn}
          </h3>
          {item.descriptionEn && (
            <p className="mt-2 max-w-lg text-sm text-white/70">
              {locale === "ar" ? item.descriptionAr : item.descriptionEn}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
