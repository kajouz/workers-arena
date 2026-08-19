"use client";

import { cn } from "@/lib/utils";

/**
 * Base skeleton component with shimmer animation.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton rounded-lg", className)}
      {...props}
    />
  );
}

/**
 * Worker card skeleton for search results and grids.
 */
export function WorkerCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900">
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/**
 * Worker profile page skeleton.
 */
export function WorkerProfileSkeleton() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Hero skeleton */}
      <Skeleton className="h-64 w-full rounded-3xl" />
      
      {/* Content skeleton */}
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        </div>
        
        <div className="space-y-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * Search page skeleton.
 */
export function SearchPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      
      <div className="mt-8 grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Sidebar skeleton */}
        <div className="hidden lg:block">
          <div className="sticky top-24 space-y-6 rounded-2xl border border-ink-200/80 bg-white p-5 shadow-soft dark:border-ink-800 dark:bg-ink-900">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        </div>
        
        {/* Results skeleton */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <WorkerCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Dashboard page skeleton.
 */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <Skeleton className="h-8 w-1/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_350px]">
        <Skeleton className="h-96 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Bookings page skeleton.
 */
export function BookingsSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Skeleton className="h-8 w-1/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      
      <div className="mt-8 flex gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-lg" />
        ))}
      </div>
      
      <div className="mt-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/**
 * Page loading overlay with spinner.
 */
export function PageLoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm dark:bg-ink-950/80">
      <div className="flex flex-col items-center gap-4">
        <div className="size-10 animate-spin rounded-full border-4 border-ink-200 border-t-brand-500" />
        <p className="text-sm font-medium text-ink-500">Loading...</p>
      </div>
    </div>
  );
}
