"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Mic, SlidersHorizontal, X, MapPin } from "lucide-react";
import type { Category, City, SearchFilters, SearchResult, Suggestion } from "@/lib/data/types";
import { WorkerCard, WorkerCardSkeleton } from "@/components/shared/worker-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Rating } from "@/components/ui/rating";
import { useDebounce } from "@/hooks/use-debounce";
import { useVoiceSearch } from "@/hooks/use-voice-search";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { useSearchHistory } from "@/hooks/use-search-history";
import { useGeolocation } from "@/hooks/use-geolocation";
import { SearchHistory } from "@/components/search/search-history";
import { cn, formatNumber } from "@/lib/utils";
import { SearchResultsAnnouncement } from "@/components/ui/aria-live-region";
import { filtersToSearchParams } from "@/lib/data/search-params";

interface Labels {
  category: string;
  city: string;
  area: string;
  rating: string;
  anyRating: string;
  priceRange: string;
  anyPrice: string;
  experience: string;
  anyExp: string;
  availability: string;
  availableNow: string;
  openNowOnly: string;
  emergencyOnly: string;
  verifiedOnly: string;
  featuredOnly: string;
  feeWaived: string;
  sortBy: string;
  sortRelevance: string;
  sortRating: string;
  sortReviews: string;
  sortPriceLow: string;
  sortPriceHigh: string;
  sortExperience: string;
  sortNearest: string;
  results: string;
  result: string;
  filters: string;
  clearFilters: string;
  emptyTitle: string;
  emptyBody: string;
  emptyCta: string;
  placeholder: string;
  voice: string;
  listening: string;
  loadMore: string;
  loading: string;
  noResults: string;
}

export function SearchClient({
  locale,
  categories,
  cities,
  initialFilters,
  initialResults,
  dictLabels: L,
}: {
  locale: "en" | "ar";
  categories: Category[];
  cities: City[];
  initialFilters: SearchFilters;
  initialResults: SearchResult;
  dictLabels: Labels;
}) {
  const router = useRouter();

  const [filters, setFilters] = useState<SearchFilters>(initialFilters);
  const [query, setQuery] = useState(initialFilters.query ?? "");
  const [results, setResults] = useState<SearchResult>(initialResults);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [debouncedLoading, setDebouncedLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const debouncedQuery = useDebounce(query, 220);
  const searchSeq = useRef(0);
  const { addSearch } = useSearchHistory();
  const {
    latitude,
    longitude,
    loading: geoLoading,
    error: geoError,
    requestPosition,
    calculateDistance,
    isSupported: geoSupported,
  } = useGeolocation();

  const hasMore = results.items.length < results.total;
  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.category) n++;
    if (filters.city) n++;
    if (filters.area) n++;
    if (filters.minRating) n++;
    if (filters.priceMin != null || filters.priceMax != null) n++;
    if (filters.minExp) n++;
    if (filters.verifiedOnly) n++;
    if (filters.featuredOnly) n++;
    if (filters.emergencyOnly) n++;
    if (filters.openNowOnly) n++;
    if (filters.availableNow) n++;
    if (filters.feeWaivedOnly) n++;
    if (filters.sort && filters.sort !== "relevance") n++;
    return n;
  }, [filters]);

  /** Fetch results for the current filters (resets pagination). */
  const runSearch = useCallback(
    async (next: SearchFilters, pageNum = 1) => {
      const seq = ++searchSeq.current;
      setLoading(true);
      if (pageNum === 1) setDebouncedLoading(true);
      try {
        const params = new URLSearchParams();
        if (next.query) params.set("q", next.query);
        if (next.category) params.set("category", next.category);
        if (next.city) params.set("city", next.city);
        if (next.area) params.set("area", next.area);
        if (next.minRating) params.set("rating", String(next.minRating));
        if (next.priceMin != null) params.set("min", String(next.priceMin));
        if (next.priceMax != null) params.set("max", String(next.priceMax));
        if (next.minExp) params.set("exp", String(next.minExp));
        if (next.verifiedOnly) params.set("verified", "1");
        if (next.featuredOnly) params.set("featured", "1");
        if (next.emergencyOnly) params.set("emergency", "1");
        if (next.openNowOnly) params.set("open", "1");
        if (next.availableNow) params.set("available", "1");
        if (next.feeWaivedOnly) params.set("feeWaived", "1");
        if (next.sort && next.sort !== "relevance") params.set("sort", next.sort);
        params.set("page", String(pageNum));
        const res = await fetch(`/api/workers?${params.toString()}`);
        const data = (await res.json()) as SearchResult;
        if (seq !== searchSeq.current) return;
        setResults((prev) =>
          pageNum === 1 ? data : { ...data, items: [...prev.items, ...data.items] }
        );
        setPage(pageNum);
      } finally {
        if (seq === searchSeq.current) {
          setLoading(false);
          setDebouncedLoading(false);
        }
      }
    },
    []
  );

  /** Sync URL when filters change (deep-linkable searches). */
  useEffect(() => {
    const qs = filtersToSearchParams(filters);
    router.replace(`/search${qs}`, { scroll: false });
    runSearch(filters, 1);
    // Track search in history
    if (filters.query || filters.category || filters.city) {
      addSearch({
        query: filters.query ?? "",
        category: filters.category,
        city: filters.city,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  /** Autocomplete via API. */
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/search/suggest?q=${encodeURIComponent(debouncedQuery)}&locale=${locale}`)
      .then((r) => r.json())
      .then((d: { suggestions: Suggestion[] }) => !cancelled && setSuggestions(d.suggestions ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, locale]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    runSearch(filters, page + 1);
  }, [hasMore, loading, page, filters, runSearch]);

  const sentinel = useInfiniteScroll(loadMore, hasMore);

  // Virtual scrolling for large result lists
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: results.items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 280, // estimated card height
    overscan: 5,
  });

  const update = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value, page: undefined }));
  };

  const clearAll = () => {
    setQuery("");
    setFilters({});
  };

  const city = cities.find((c) => c.slug === filters.city);
  const areaOptions = city?.areas ?? [];

  const { listening, supported, toggle } = useVoiceSearch((transcript) => {
    setQuery(transcript);
    setFilters((f) => ({ ...f, query: transcript }));
  });

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      {/* ─── Sidebar (desktop) ─── */}
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-6 rounded-2xl border border-ink-200/80 bg-white p-5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
          <FilterControls
            filters={filters}
            update={update}
            categories={categories}
            cities={cities}
            city={city}
            areaOptions={areaOptions}
            clearAll={clearAll}
            L={L}
            locale={locale}
          />
        </div>
      </aside>

      {/* ─── Main ─── */}
      <div>
        {/* search history */}
        <SearchHistory
          className="mb-4"
          onSelect={(entry) => {
            setQuery(entry.query);
            setFilters((f) => ({
              ...f,
              query: entry.query,
              category: entry.category,
              city: entry.city,
            }));
          }}
        />

        {/* search + sort row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setFilters((f) => ({ ...f, query: e.target.value }));
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSuggestOpen(false);
                  runSearch({ ...filters, query }, 1);
                }
              }}
              placeholder={L.placeholder}
              className="ps-10 pe-20"
              aria-label={L.placeholder}
            />
            {supported && (
              <button
                type="button"
                onClick={toggle}
                title={L.voice}
                aria-label={L.voice}
                className={cn(
                  "absolute end-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition-colors",
                  listening ? "bg-red-500 text-white animate-pulse-soft" : "text-ink-400 hover:bg-brand-500/10 hover:text-brand-600"
                )}
              >
                <Mic className="size-4" />
              </button>
            )}
            <AnimatePresence>
              {suggestOpen && suggestions.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="glass-strong absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl p-1.5 shadow-lift"
                >
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSuggestOpen(false);
                        if (s.type === "category" || s.type === "worker") {
                          router.push(s.href);
                        } else {
                          setQuery(s.labelEn);
                          update("city", s.href.split("=")[1]);
                        }
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 hover:bg-brand-500/10 dark:text-ink-200"
                    >
                      <Search className="size-3.5 text-ink-400" />
                      {locale === "ar" ? s.labelAr : s.labelEn}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* location-based search */}
          {geoSupported && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!latitude || !longitude) {
                  requestPosition();
                } else {
                  update("sort", "nearest");
                }
              }}
              disabled={geoLoading}
              className={cn(
                "gap-2",
                filters.sort === "nearest" && "border-brand-500 bg-brand-500/10 text-brand-600"
              )}
            >
              <MapPin className="size-4" />
              {geoLoading
                ? (locale === "ar" ? "جارٍ تحديد الموقع…" : "Locating…")
                : filters.sort === "nearest"
                ? (locale === "ar" ? "قريب مني" : "Near Me")
                : (locale === "ar" ? "ابحث القريب مني" : "Find Near Me")}
            </Button>
          )}

          {/* sort */}
          <Select value={filters.sort ?? "relevance"} onValueChange={(v) => update("sort", v as SearchFilters["sort"])}>
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder={L.sortBy} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">{L.sortRelevance}</SelectItem>
              <SelectItem value="rating">{L.sortRating}</SelectItem>
              <SelectItem value="reviews">{L.sortReviews}</SelectItem>
              <SelectItem value="priceLow">{L.sortPriceLow}</SelectItem>
              <SelectItem value="priceHigh">{L.sortPriceHigh}</SelectItem>
              <SelectItem value="experience">{L.sortExperience}</SelectItem>
              <SelectItem value="nearest">{L.sortNearest}</SelectItem>
            </SelectContent>
          </Select>

          {/* mobile filters */}
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <SlidersHorizontal className="size-4" />
                {L.filters}
                {activeCount > 0 && (
                  <Badge variant="solid" className="size-5 justify-center p-0 text-[10px]">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{L.filters}</DialogTitle>
              </DialogHeader>
              <FilterControls
                filters={filters}
                update={update}
                categories={categories}
                cities={cities}
                city={city}
                areaOptions={areaOptions}
                clearAll={clearAll}
                L={L}
                locale={locale}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* active chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-ink-500 dark:text-ink-400">
            {formatNumber(results.total)} {results.total === 1 ? L.result : L.results}
          </p>
          {activeCount > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-500/20 dark:text-brand-400"
            >
              <X className="size-3" /> {L.clearFilters}
            </button>
          )}
          {listening && (
            <span className="flex items-center gap-1.5 rounded-full bg-red-500/10 px-3 py-1 text-xs font-bold text-red-600 dark:text-red-400">
              <span className="size-1.5 animate-ping rounded-full bg-red-500" /> {L.listening}
            </span>
          )}
        </div>

        {/* Screen reader announcement for search results */}
        <SearchResultsAnnouncement count={results.total} isLoading={debouncedLoading} />

        {/* results */}
        <div className="mt-6">
          {debouncedLoading && results.items.length === 0 ? (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <WorkerCardSkeleton key={i} />
              ))}
            </div>
          ) : results.items.length === 0 ? (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-ink-300 bg-white/60 px-6 py-20 text-center dark:border-ink-700 dark:bg-ink-900/40">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 dark:bg-ink-800">
                <Search className="size-8" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-ink-900 dark:text-ink-50">{L.emptyTitle}</h3>
              <p className="mt-1.5 max-w-sm text-sm text-ink-500 dark:text-ink-400">{L.emptyBody}</p>
              <Button variant="outline" className="mt-6" onClick={clearAll}>
                {L.emptyCta}
              </Button>
            </div>
          ) : results.items.length > 12 ? (
            // Virtual scrolling for large result sets (>12 items)
            <div ref={parentRef} className="h-[800px] overflow-auto">
              <div
                className="relative grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
                style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const worker = results.items[virtualRow.index];
                  return (
                    <div
                      key={worker.id}
                      className="absolute inset-x-0 top-0 grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <WorkerCard worker={worker} index={virtualRow.index} />
                    </div>
                  );
                })}
              </div>
              {loading && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <WorkerCardSkeleton key={`s-${i}`} />
                  ))}
                </div>
              )}
              <div ref={sentinel} className="h-4" aria-hidden />
            </div>
          ) : (
            // Standard grid for small result sets
            <>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence mode="popLayout">
                  {results.items.map((w, i) => (
                    <WorkerCard key={w.id} worker={w} index={i} />
                  ))}
                </AnimatePresence>
              </div>
              {loading && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <WorkerCardSkeleton key={`s-${i}`} />
                  ))}
                </div>
              )}
              <div ref={sentinel} className="h-4" aria-hidden />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Filter panel ─────────────────────────── */

function FilterControls({
  filters,
  update,
  categories,
  cities,
  city,
  areaOptions,
  clearAll,
  L,
  locale,
}: {
  filters: SearchFilters;
  update: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  categories: Category[];
  cities: City[];
  city?: City;
  areaOptions: City["areas"];
  clearAll: () => void;
  L: Labels;
  locale: "en" | "ar";
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-900 dark:text-ink-50">
          <SlidersHorizontal className="size-4 text-brand-500" />
          {L.filters}
        </h2>
        <button
          onClick={clearAll}
          className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          {L.clearFilters}
        </button>
      </div>

      <div className="space-y-2">
        <Label>{L.category}</Label>
        <Select
          value={filters.category ?? "all"}
          onValueChange={(v) => update("category", v === "all" ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L.anyRating}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {locale === "ar" ? c.nameAr : c.nameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{L.city}</Label>
        <Select value={filters.city ?? "all"} onValueChange={(v) => update("city", v === "all" ? undefined : v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">—</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3" />
                  {locale === "ar" ? c.nameAr : c.nameEn}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {city && (
        <div className="space-y-2">
          <Label>{L.area}</Label>
          <Select value={filters.area ?? "all"} onValueChange={(v) => update("area", v === "all" ? undefined : v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">—</SelectItem>
              {areaOptions.map((a) => (
                <SelectItem key={a.slug} value={a.slug}>
                  {locale === "ar" ? a.nameAr : a.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>{L.rating}</Label>
        <Select value={String(filters.minRating ?? "0")} onValueChange={(v) => update("minRating", v === "0" ? undefined : Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{L.anyRating}</SelectItem>
            {[4.5, 4, 3.5, 3].map((r) => (
              <SelectItem key={r} value={String(r)}>
                <Rating value={r} size={12} /> {r}+
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{L.priceRange}</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            placeholder={locale === "ar" ? "الحد الأدنى" : "Min"}
            value={filters.priceMin ?? ""}
            onChange={(e) => update("priceMin", e.target.value ? Number(e.target.value) : undefined)}
            className="h-9"
          />
          <span className="text-ink-400">–</span>
          <Input
            type="number"
            min={0}
            placeholder={locale === "ar" ? "الحد الأقصى" : "Max"}
            value={filters.priceMax ?? ""}
            onChange={(e) => update("priceMax", e.target.value ? Number(e.target.value) : undefined)}
            className="h-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{L.experience}</Label>
        <Select
          value={String(filters.minExp ?? "0")}
          onValueChange={(v) => update("minExp", v === "0" ? undefined : Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">{L.anyExp}</SelectItem>
            {[3, 5, 8, 10, 15].map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}+ {L.experience}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label>{L.availability}</Label>
        <ToggleRow checked={!!filters.availableNow} onCheckedChange={(v) => update("availableNow", v || undefined)} label={L.availableNow} />
        <ToggleRow checked={!!filters.openNowOnly} onCheckedChange={(v) => update("openNowOnly", v || undefined)} label={L.openNowOnly} />
        <ToggleRow checked={!!filters.emergencyOnly} onCheckedChange={(v) => update("emergencyOnly", v || undefined)} label={L.emergencyOnly} />
        <ToggleRow checked={!!filters.verifiedOnly} onCheckedChange={(v) => update("verifiedOnly", v || undefined)} label={L.verifiedOnly} />
        <ToggleRow checked={!!filters.featuredOnly} onCheckedChange={(v) => update("featuredOnly", v || undefined)} label={L.featuredOnly} />
        {/* M5 — fee-waived workers (Enterprise) as a first-class filter; the
            same exemption source as the card badge (docs/booking-take-rate.md). */}
        <ToggleRow checked={!!filters.feeWaivedOnly} onCheckedChange={(v) => update("feeWaivedOnly", v || undefined)} label={L.feeWaived} />
      </div>
    </div>
  );
}

function ToggleRow({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-1 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/60">
      <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}
