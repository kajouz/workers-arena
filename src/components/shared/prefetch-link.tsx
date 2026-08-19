"use client";

import { useRef, useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface PrefetchLinkProps {
  href: string;
  children: React.ReactNode;
  prefetch?: boolean;
  prefetchDelay?: number;
  className?: string;
  activeClassName?: string;
  onPrefetch?: (href: string) => void;
}

/**
 * Link component with intelligent prefetching
 * Prefetches route data on hover after a delay
 */
export function PrefetchLink({
  href,
  children,
  prefetch = true,
  prefetchDelay = 200,
  className,
  activeClassName,
  onPrefetch,
}: PrefetchLinkProps) {
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isPrefetched, setIsPrefetched] = useState(false);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const isActive = pathname === href || pathname.startsWith(href + "/");

  const handleMouseEnter = useCallback(() => {
    if (!prefetch || isPrefetched) return;

    timeoutRef.current = setTimeout(() => {
      router.prefetch(href);
      setIsPrefetched(true);
      onPrefetch?.(href);
    }, prefetchDelay);
  }, [prefetch, prefetchDelay, href, router, isPrefetched, onPrefetch]);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  return (
    <Link
      href={href}
      className={cn(
        className,
        isActive && activeClassName
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
    </Link>
  );
}

/**
 * Prefetch on viewport entry (for below-the-fold links)
 */
interface PrefetchOnViewProps {
  href: string;
  children: React.ReactNode;
  rootMargin?: string;
  className?: string;
}

export function PrefetchOnView({
  href,
  children,
  rootMargin = "200px",
  className,
}: PrefetchOnViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [hasPrefetched, setHasPrefetched] = useState(false);

  const handlePrefetch = useCallback(() => {
    if (hasPrefetched) return;
    router.prefetch(href);
    setHasPrefetched(true);
  }, [href, router, hasPrefetched]);

  return (
    <div ref={ref} className={className}>
      <Link
        href={href}
        onMouseEnter={handlePrefetch}
        onFocus={handlePrefetch}
      >
        {children}
      </Link>
    </div>
  );
}

/**
 * Prefetch manager for batch prefetching
 */
export class PrefetchManager {
  private prefetched = new Set<string>();
  private queue: string[] = [];
  private isProcessing = false;

  constructor(
    private router: any,
    private maxConcurrent = 3,
    private delay = 100
  ) {}

  /**
   * Add URL to prefetch queue
   */
  add(href: string) {
    if (this.prefetched.has(href)) return;
    this.queue.push(href);
    this.process();
  }

  /**
   * Prefetch multiple URLs
   */
  addBatch(href: string[]) {
    href.forEach((h) => this.add(h));
  }

  /**
   * Process prefetch queue
   */
  private async process() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;

    while (this.queue.length > 0 && this.prefetched.size < this.maxConcurrent) {
      const href = this.queue.shift();
      if (href && !this.prefetched.has(href)) {
        this.prefetched.add(href);
        try {
          await this.router.prefetch(href);
        } catch (error) {
          console.error(`[PrefetchManager] Failed to prefetch ${href}:`, error);
        }
        await new Promise((resolve) => setTimeout(resolve, this.delay));
      }
    }

    this.isProcessing = false;

    // Process remaining
    if (this.queue.length > 0) {
      this.process();
    }
  }

  /**
   * Clear prefetch cache
   */
  clear() {
    this.prefetched.clear();
    this.queue = [];
  }

  /**
   * Get prefetched URLs
   */
  getPrefetched(): string[] {
    return Array.from(this.prefetched);
  }
}

/**
 * Hook for prefetch manager
 */
export function usePrefetchManager() {
  const router = useRouter();
  const managerRef = useRef<PrefetchManager | null>(null);

  if (!managerRef.current) {
    managerRef.current = new PrefetchManager(router);
  }

  return managerRef.current;
}
