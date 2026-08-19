"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "wa-search-history";
const MAX_HISTORY = 10;

export interface SearchHistoryEntry {
  query: string;
  category?: string;
  city?: string;
  timestamp: number;
}

/**
 * Hook to manage search history with localStorage persistence.
 * Stores the last 10 searches and provides methods to add, remove, and clear history.
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);

  // Load history from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage errors
    }
  }, [history]);

  const addSearch = useCallback(
    (entry: Omit<SearchHistoryEntry, "timestamp">) => {
      setHistory((prev) => {
        // Remove duplicate if exists
        const filtered = prev.filter(
          (h) =>
            h.query !== entry.query ||
            h.category !== entry.category ||
            h.city !== entry.city
        );
        // Add new entry at the beginning
        const newHistory = [
          { ...entry, timestamp: Date.now() },
          ...filtered,
        ].slice(0, MAX_HISTORY);
        return newHistory;
      });
    },
    []
  );

  const removeSearch = useCallback((index: number) => {
    setHistory((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return {
    history,
    addSearch,
    removeSearch,
    clearHistory,
  };
}
