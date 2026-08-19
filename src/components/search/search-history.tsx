"use client";

import { Clock, X, Trash2 } from "lucide-react";
import { useSearchHistory, type SearchHistoryEntry } from "@/hooks/use-search-history";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SearchHistoryProps {
  onSelect: (entry: SearchHistoryEntry) => void;
  className?: string;
}

export function SearchHistory({ onSelect, className }: SearchHistoryProps) {
  const { locale, t } = useLocale();
  const { history, removeSearch, clearHistory } = useSearchHistory();

  if (history.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-500 dark:text-ink-400">
          <Clock className="size-4" />
          {locale === "ar" ? "البحث الأخير" : "Recent searches"}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearHistory}
          className="h-7 px-2 text-xs"
        >
          <Trash2 className="size-3" />
          {locale === "ar" ? "مسح الكل" : "Clear all"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {history.map((entry, index) => (
          <button
            key={`${entry.timestamp}-${index}`}
            onClick={() => onSelect(entry)}
            className="group flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1.5 text-sm text-ink-700 transition-colors hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
          >
            <span className="max-w-[150px] truncate">
              {entry.query || entry.category || "—"}
            </span>
            {entry.category && entry.query && (
              <span className="text-ink-400 dark:text-ink-500">
                · {entry.category}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeSearch(index);
              }}
              className="ml-1 rounded-full p-0.5 text-ink-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-500"
              aria-label={t("common.remove")}
            >
              <X className="size-3" />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
