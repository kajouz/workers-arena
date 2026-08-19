"use client";

import { useEffect, useRef, useCallback, useState } from "react";

interface UseInfiniteScrollOptions {
  threshold?: number;
  rootMargin?: string;
  enabled?: boolean;
  onLoadMore: () => Promise<void> | void;
  hasMore: boolean;
  loading?: boolean;
}

interface UseInfiniteScrollReturn {
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Enhanced infinite scroll hook using Intersection Observer
 */
export function useInfiniteScroll({
  threshold = 0,
  rootMargin = "100px",
  enabled = true,
  onLoadMore,
  hasMore,
  loading = false,
}: UseInfiniteScrollOptions): UseInfiniteScrollReturn {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || loading) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      await onLoadMore();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more");
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [hasMore, loading, onLoadMore]);

  useEffect(() => {
    if (!enabled || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      {
        threshold,
        rootMargin,
        root: containerRef.current,
      }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
      observer.disconnect();
    };
  }, [enabled, hasMore, loading, loadMore, threshold, rootMargin]);

  const retry = useCallback(() => {
    setError(null);
    loadMore();
  }, [loadMore]);

  return {
    sentinelRef,
    containerRef,
    isLoading,
    error,
    retry,
  };
}

/**
 * Virtual infinite scroll for large lists
 */
interface UseVirtualInfiniteScrollOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
  onLoadMore?: () => Promise<void> | void;
  hasMore?: boolean;
}

interface UseVirtualInfiniteScrollReturn {
  virtualItems: {
    index: number;
    offsetTop: number;
    height: number;
  }[];
  totalHeight: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isLoading: boolean;
}

export function useVirtualInfiniteScroll({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 5,
  onLoadMore,
  hasMore = false,
}: UseVirtualInfiniteScrollOptions): UseVirtualInfiniteScrollReturn {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);

      // Check if we need to load more
      if (
        hasMore &&
        onLoadMore &&
        container.scrollTop + containerHeight >= container.scrollHeight - 200
      ) {
        setIsLoading(true);
        Promise.resolve(onLoadMore()).finally(() => setIsLoading(false));
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerHeight, hasMore, onLoadMore]);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const virtualItems = Array.from({ length: endIndex - startIndex }, (_, i) => ({
    index: startIndex + i,
    offsetTop: (startIndex + i) * itemHeight,
    height: itemHeight,
  }));

  return {
    virtualItems,
    totalHeight: itemCount * itemHeight,
    containerRef,
    isLoading,
  };
}

/**
 * Infinite scroll with page numbers (for traditional pagination)
 */
interface UsePaginationInfiniteScrollOptions {
  initialPage?: number;
  pageSize?: number;
  totalItems: number;
  onLoadPage: (page: number) => Promise<any[]>;
}

interface UsePaginationInfiniteScrollReturn {
  items: any[];
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  reset: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
}

export function usePaginationInfiniteScroll({
  initialPage = 1,
  pageSize = 20,
  totalItems,
  onLoadPage,
}: UsePaginationInfiniteScrollOptions): UsePaginationInfiniteScrollReturn {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(initialPage);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const hasMore = items.length < totalItems;

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);
    setError(null);

    try {
      const newItems = await onLoadPage(page);
      setItems((prev) => [...prev, ...newItems]);
      setPage((p) => p + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [page, isLoading, hasMore, onLoadPage]);

  const reset = useCallback(() => {
    setItems([]);
    setPage(initialPage);
    setError(null);
  }, [initialPage]);

  useEffect(() => {
    if (!sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => {
      if (sentinel) observer.unobserve(sentinel);
      observer.disconnect();
    };
  }, [hasMore, isLoading, loadMore]);

  return {
    items,
    page,
    hasMore,
    isLoading,
    error,
    loadMore,
    reset,
    sentinelRef,
  };
}
