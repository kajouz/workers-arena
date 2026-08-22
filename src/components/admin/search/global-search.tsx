"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Users, Briefcase, FileText, CreditCard, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  type: "worker" | "customer" | "booking" | "invoice";
  title: string;
  subtitle: string;
  status?: string;
  url: string;
}

interface GlobalSearchProps {
  onNavigate?: (url: string) => void;
  className?: string;
}

/**
 * Global Search component for admin dashboard
 * Searches across workers, customers, bookings, and invoices
 */
export function GlobalSearch({ onNavigate, className }: GlobalSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search function (simulated - would connect to API)
  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);

    // Simulated search results - in production, this would call an API
    await new Promise((resolve) => setTimeout(resolve, 300));

    const mockResults: SearchResult[] = [
      {
        id: "w1",
        type: "worker",
        title: "Khaled Al-Harbi",
        subtitle: "Plumbing • Verified",
        status: "verified",
        url: "/admin/workers/khaled-al-harbi",
      },
      {
        id: "w2",
        type: "worker",
        title: "Ali Hassan",
        subtitle: "Carpentry • Premium",
        status: "premium",
        url: "/admin/workers/ali-hassan",
      },
      {
        id: "c1",
        type: "customer",
        title: "Sara Customer",
        subtitle: "sara@example.com • 3 bookings",
        url: "/admin/customers?search=sara",
      },
      {
        id: "b1",
        type: "booking",
        title: "BK-1001",
        subtitle: "Sink repair • Khaled Al-Harbi",
        status: "requested",
        url: "/admin/bookings/BK-1001",
      },
      {
        id: "i1",
        type: "invoice",
        title: "WA-2024-00123",
        subtitle: "Khaled Al-Harbi • SAR 119",
        status: "paid",
        url: "/admin/invoices?search=WA-2024",
      },
    ];

    // Filter based on query
    const filtered = mockResults.filter(
      (r) =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    );

    setResults(filtered);
    setLoading(false);
    setSelectedIndex(0);
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, performSearch]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  };

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false);
    if (onNavigate) {
      onNavigate(result.url);
    } else {
      window.location.href = result.url;
    }
  };

  const getTypeIcon = (type: SearchResult["type"]) => {
    switch (type) {
      case "worker":
        return <Briefcase className="w-4 h-4" />;
      case "customer":
        return <Users className="w-4 h-4" />;
      case "booking":
        return <FileText className="w-4 h-4" />;
      case "invoice":
        return <CreditCard className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: SearchResult["type"]) => {
    switch (type) {
      case "worker":
        return "bg-blue-100 text-blue-700";
      case "customer":
        return "bg-green-100 text-green-700";
      case "booking":
        return "bg-orange-100 text-orange-700";
      case "invoice":
        return "bg-purple-100 text-purple-700";
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Search trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        <Search className="w-4 h-4" />
        <span>Search...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-200 rounded">
          ⌘K
        </kbd>
      </button>

      {/* Search modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />

          {/* Search panel */}
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden">
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <Search className="w-5 h-5 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search workers, customers, bookings, invoices..."
                className="flex-1 text-lg outline-none"
              />
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-[400px] overflow-y-auto">
              {loading && (
                <div className="p-8 text-center text-gray-500">
                  <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto" />
                  <p className="mt-2">Searching...</p>
                </div>
              )}

              {!loading && query.length >= 2 && results.length === 0 && (
                <div className="p-8 text-center text-gray-500">
                  <p>No results found for &quot;{query}&quot;</p>
                </div>
              )}

              {!loading && results.length > 0 && (
                <div className="py-2">
                  {/* Group by type */}
                  {(["worker", "customer", "booking", "invoice"] as const).map((type) => {
                    const typeResults = results.filter((r) => r.type === type);
                    if (typeResults.length === 0) return null;

                    return (
                      <div key={type}>
                        <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                          {type}s
                        </div>
                        {typeResults.map((result) => {
                          const index = results.indexOf(result);
                          return (
                            <button
                              key={result.id}
                              onClick={() => handleSelect(result)}
                              onMouseEnter={() => setSelectedIndex(index)}
                              className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors",
                                index === selectedIndex && "bg-gray-50"
                              )}
                            >
                              <div className={cn("p-2 rounded-lg", getTypeColor(result.type))}>
                                {getTypeIcon(result.type)}
                              </div>
                              <div className="flex-1 text-left">
                                <p className="font-medium text-gray-900">{result.title}</p>
                                <p className="text-sm text-gray-500">{result.subtitle}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

              {query.length < 2 && (
                <div className="p-8 text-center text-gray-500">
                  <p>Type at least 2 characters to search</p>
                  <p className="mt-1 text-sm">
                    Search across workers, customers, bookings, and invoices
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t bg-gray-50 text-xs text-gray-500">
              <div className="flex items-center justify-between">
                <span>
                  <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">↑↓</kbd> to navigate
                  <span className="mx-2">•</span>
                  <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">Enter</kbd> to select
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-gray-200 rounded">Esc</kbd> to close
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
