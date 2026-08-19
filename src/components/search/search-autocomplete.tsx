"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, TrendingUp, Clock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSearchHistory } from "@/hooks/use-search-history";
import { cn } from "@/lib/utils";

interface Suggestion {
  type: "recent" | "trending" | "category" | "worker";
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: Suggestion) => void;
  placeholder?: string;
  className?: string;
}

// Mock trending searches - in production, this would come from an API
const TRENDING_SEARCHES: Suggestion[] = [
  { type: "trending", label: "Emergency plumber", href: "/search?category=plumbing&emergency=1" },
  { type: "trending", label: "AC repair Beirut", href: "/search?q=AC+repair&city=beirut" },
  { type: "trending", label: "Electrician near me", href: "/search?category=electrical&sort=nearest" },
  { type: "trending", label: "Home cleaning", href: "/search?category=cleaning" },
];

/**
 * Enhanced search autocomplete with recent and trending suggestions.
 */
export function SearchAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Search workers, services, or categories...",
  className,
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const { history, addSearch, clearHistory } = useSearchHistory();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Combine recent and trending suggestions
  useEffect(() => {
    const recentSuggestions: Suggestion[] = history.slice(0, 3).map((item) => ({
      type: "recent" as const,
      label: item.query || item.category || item.city || "Recent search",
      href: `/search?${new URLSearchParams({
        ...(item.query ? { q: item.query } : {}),
        ...(item.category ? { category: item.category } : {}),
        ...(item.city ? { city: item.city } : {}),
      }).toString()}`,
      icon: <Clock className="size-4" />,
    }));

    const trendingSuggestions: Suggestion[] = TRENDING_SEARCHES.slice(0, 3).map((item) => ({
      ...item,
      icon: <TrendingUp className="size-4" />,
    }));

    // Filter based on input value
    const filtered = [...recentSuggestions, ...trendingSuggestions].filter(
      (s) => !value || s.label.toLowerCase().includes(value.toLowerCase())
    );

    setSuggestions(filtered.slice(0, 6));
  }, [value, history]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter" && value.trim()) {
      addSearch({ query: value.trim() });
      setIsOpen(false);
    }
  };

  const handleSelect = (suggestion: Suggestion) => {
    onChange(suggestion.label);
    onSelect(suggestion);
    setIsOpen(false);
    if (suggestion.type === "recent") {
      addSearch({ query: suggestion.label });
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="ps-10 pe-10"
          aria-label={placeholder}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          role="combobox"
        />
        {value && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute end-2 top-1/2 -translate-y-1/2"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <X className="size-4" />
          </Button>
        )}
      </div>

      <AnimatePresence>
        {isOpen && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lift dark:border-ink-800 dark:bg-ink-900"
            role="listbox"
          >
            {/* Recent searches */}
            {suggestions.some((s) => s.type === "recent") && (
              <div className="border-b border-ink-100 px-3 py-2 dark:border-ink-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
                    Recent
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px]"
                    onClick={() => {
                      clearHistory();
                      setIsOpen(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}

            <div className="max-h-64 overflow-y-auto">
              {suggestions.map((suggestion, i) => (
                <button
                  key={`${suggestion.type}-${i}`}
                  onClick={() => handleSelect(suggestion)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-ink-700 hover:bg-ink-50 dark:text-ink-200 dark:hover:bg-ink-800"
                  role="option"
                >
                  <span className="text-ink-400">{suggestion.icon}</span>
                  <span className="flex-1 truncate">{suggestion.label}</span>
                  {suggestion.type === "trending" && (
                    <span className="text-[10px] font-bold text-brand-500">Trending</span>
                  )}
                </button>
              ))}
            </div>

            {/* Keyboard hint */}
            <div className="border-t border-ink-100 px-3 py-2 dark:border-ink-800">
              <p className="text-[11px] text-ink-400">
                Press <kbd className="rounded bg-ink-100 px-1 py-0.5 text-[10px] font-mono dark:bg-ink-800">Enter</kbd> to search
                {" · "}
                <kbd className="rounded bg-ink-100 px-1 py-0.5 text-[10px] font-mono dark:bg-ink-800">Esc</kbd> to close
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
