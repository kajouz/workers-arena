"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Mic, Sparkles, TrendingUp, UserRound, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/components/providers/locale-provider";
import { useDebounce } from "@/hooks/use-debounce";
import { useVoiceSearch } from "@/hooks/use-voice-search";
import type { Suggestion } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function SearchBar({ popular }: { popular: { en: string; ar: string; href: string }[] }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounced = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    fetch(`/api/search/suggest?q=${encodeURIComponent(debounced)}&locale=${locale}`)
      .then((r) => r.json())
      .then((data: { suggestions: Suggestion[] }) => {
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      })
      .finally(() => !cancelled && setSearching(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, locale]);

  const go = (q: string) => {
    setOpen(false);
    const clean = q.trim();
    if (!clean) return;
    router.push(`/search?q=${encodeURIComponent(clean)}`);
  };

  const { listening, supported, toggle } = useVoiceSearch((transcript) => {
    setQuery(transcript);
    setTimeout(() => go(transcript), 350);
  });

  const selectSuggestion = (s: Suggestion) => {
    setOpen(false);
    setQuery("");
    if (s.type === "category" || s.type === "worker") router.push(s.href);
    else router.push(`${s.href}&q=${encodeURIComponent(s.labelEn)}`);
  };

  return (
    <div className="relative w-full max-w-2xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(query);
        }}
        className="glass-strong flex items-center gap-1.5 rounded-2xl p-1.5 shadow-lift sm:gap-2 sm:p-2"
        role="search"
      >
        <span className="ps-1.5 text-ink-400 sm:ps-2">
          <Search className="size-4 sm:size-5" />
        </span>
        {/* min-w-0 + w-0: the input's intrinsic size (~177px) used to set the
            form's min-content, which stretched the hero grid track past the
            360px viewport and clipped the search bar + H1 off-screen (Galaxy
            Note 9 report). w-0 zeroes the flex base; flex-1 distributes the
            real available space. */}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("hero.searchPlaceholder")}
          className="h-10 w-0 min-w-0 flex-1 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none sm:h-11 sm:text-base dark:text-ink-50"
          aria-label={t("common.search")}
        />
        {searching && (
          <span className="size-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        )}
        {supported && (
          <button
            type="button"
            onClick={toggle}
            aria-label={t("search.voice")}
            title={t("search.voice")}
            className={cn(
              // p-3 + -m-1: a 40px+ tap box that doesn't change the visual
              // rhythm of the pill (the old p-2.5 left a 28px-wide target).
              "-m-1 rounded-xl p-3 transition-colors",
              listening
                ? "bg-red-500 text-white animate-pulse-soft"
                : "text-ink-400 hover:bg-brand-500/10 hover:text-brand-600"
            )}
          >
            <Mic className="size-5" />
          </button>
        )}
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-700 px-3 text-xs font-bold text-white transition-all hover:bg-brand-800 active:scale-95 sm:h-11 sm:gap-2 sm:px-5 sm:text-sm"
        >
          {t("common.search")}
          <Search className="size-3.5 sm:size-4" />
        </button>
      </form>

      {/* Autocomplete */}
      <AnimatePresence>
        {open && (query.trim().length >= 2 || suggestions.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="glass-strong absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl p-2 shadow-lift"
          >
            {suggestions.length > 0 ? (
              <>
                <p className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-400">
                  {t("search.suggestionTitle")}
                </p>
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => selectSuggestion(s)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start text-sm text-ink-700 transition-colors hover:bg-brand-500/10 hover:text-ink-900 dark:text-ink-200 dark:hover:text-ink-50"
                  >
                    {s.type === "category" ? (
                      <Sparkles className="size-4 shrink-0 text-brand-500" />
                    ) : s.type === "worker" ? (
                      <UserRound className="size-4 shrink-0 text-sky-500" />
                    ) : (
                      <TrendingUp className="size-4 shrink-0 text-emerald-500" />
                    )}
                    <span className="font-medium">{locale === "ar" ? s.labelAr : s.labelEn}</span>
                    <span className="ms-auto text-xs capitalize text-ink-400">{s.type}</span>
                  </button>
                ))}
              </>
            ) : (
              <p className="px-3 py-2.5 text-sm text-ink-500 dark:text-ink-400">
                {query.trim().length >= 2 ? t("common.noResults") : t("search.popularTitle")}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Popular chips */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:mt-4 sm:gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 sm:text-xs dark:text-ink-500">
          {t("hero.popular")}
        </span>
        {popular.map((p) => (
          <a
            key={p.en}
            href={p.href}
            onClick={(e) => {
              e.preventDefault();
              router.push(`${p.href}&q=${encodeURIComponent(p.en)}`);
            }}
            className="rounded-full border border-white/40 bg-white/60 px-2 py-0.5 text-[10px] font-semibold text-ink-600 backdrop-blur-sm transition-all hover:border-brand-500/50 hover:text-brand-600 sm:px-3 sm:py-1 sm:text-xs dark:border-ink-700 dark:bg-ink-900/60 dark:text-ink-300 dark:hover:text-brand-400"
          >
            {locale === "ar" ? p.ar : p.en}
          </a>
        ))}
        {/* M5 — the fee-waiver perk as a first-class hero chip: jumps straight
            to the fee-waived search filter, the same /search?feeWaived=1 the
            search sidebar toggle produces (docs/booking-take-rate.md). */}
        <a
          href="/search?feeWaived=1"
          onClick={(e) => {
            e.preventDefault();
            router.push("/search?feeWaived=1");
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 backdrop-blur-sm transition-all hover:bg-emerald-500/20 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400"
        >
          <ShieldCheck className="size-3.5" />
          {t("hero.noPlatformFee")}
        </a>
      </div>
    </div>
  );
}
