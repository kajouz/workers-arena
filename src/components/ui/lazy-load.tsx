"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LazyLoadProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  className?: string;
  onVisible?: () => void;
}

/**
 * Lazy load component using Intersection Observer
 */
export function LazyLoad({
  children,
  fallback,
  rootMargin = "100px",
  threshold = 0,
  className,
  onVisible,
}: LazyLoadProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          onVisible?.();
          observer.unobserve(element);
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [rootMargin, threshold, onVisible]);

  return (
    <div ref={ref} className={className}>
      {isVisible ? children : fallback ?? null}
    </div>
  );
}

/**
 * Lazy load images with Intersection Observer
 */
interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  width?: number;
  height?: number;
  rootMargin?: string;
}

export function LazyImage({
  src,
  alt,
  className,
  placeholderClassName,
  width,
  height,
  rootMargin = "200px",
}: LazyImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [rootMargin]);

  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)}>
      {/* Placeholder */}
      {!isLoaded && (
        <div
          className={cn(
            "absolute inset-0 animate-pulse bg-ink-100 dark:bg-ink-800",
            placeholderClassName
          )}
          style={{ width, height }}
        />
      )}

      {/* Image */}
      {isVisible && (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={cn(
            "transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            hasError && "hidden"
          )}
        />
      )}

      {/* Error state */}
      {hasError && (
        <div className="flex items-center justify-center bg-ink-100 dark:bg-ink-800">
          <span className="text-sm text-ink-400">Failed to load</span>
        </div>
      )}
    </div>
  );
}

/**
 * Lazy load component with skeleton fallback
 */
interface LazyWithSkeletonProps {
  children: ReactNode;
  skeleton: ReactNode;
  rootMargin?: string;
  className?: string;
}

export function LazyWithSkeleton({
  children,
  skeleton,
  rootMargin = "100px",
  className,
}: LazyWithSkeletonProps) {
  return (
    <LazyLoad
      fallback={skeleton}
      rootMargin={rootMargin}
      className={className}
    >
      {children}
    </LazyLoad>
  );
}

/**
 * Lazy load videos
 */
interface LazyVideoProps {
  src: string;
  className?: string;
  poster?: string;
  rootMargin?: string;
}

export function LazyVideo({
  src,
  className,
  poster,
  rootMargin = "300px",
}: LazyVideoProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      { rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [rootMargin]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {isVisible ? (
        <video
          src={src}
          poster={poster}
          controls
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-ink-100 dark:bg-ink-800">
          <span className="text-ink-400">Loading video...</span>
        </div>
      )}
    </div>
  );
}
