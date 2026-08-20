"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Animated Heart / Favorite Button ─── */
export function AnimatedHeart({
  initial = false,
  onToggle,
  size = "md",
}: {
  initial?: boolean;
  onToggle?: (liked: boolean) => void;
  size?: "sm" | "md" | "lg";
}) {
  const [liked, setLiked] = useState(initial);
  const [bursting, setBursting] = useState(false);

  const sizes = {
    sm: "size-8",
    md: "size-10",
    lg: "size-12",
  };

  const iconSizes = {
    sm: "size-4",
    md: "size-5",
    lg: "size-6",
  };

  const toggle = useCallback(() => {
    const next = !liked;
    setLiked(next);
    if (next) {
      setBursting(true);
      setTimeout(() => setBursting(false), 600);
    }
    onToggle?.(next);
  }, [liked, onToggle]);

  return (
    <button
      onClick={toggle}
      className={cn(
        "relative flex items-center justify-center rounded-full transition-colors",
        sizes[size],
        liked
          ? "bg-red-50 text-red-500 dark:bg-red-950/40"
          : "bg-ink-100 text-ink-400 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-500 dark:hover:bg-ink-700"
      )}
      aria-label={liked ? "Remove from favorites" : "Add to favorites"}
    >
      <motion.div
        animate={liked ? { scale: [1, 1.3, 1] } : { scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <Heart
          className={cn(iconSizes[size], liked && "fill-current")}
        />
      </motion.div>

      {/* Burst particles */}
      <AnimatePresence>
        {bursting && (
          <>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute size-1.5 rounded-full bg-red-400"
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{
                  scale: [0, 1, 0],
                  x: Math.cos((i * 60 * Math.PI) / 180) * 20,
                  y: Math.sin((i * 60 * Math.PI) / 180) * 20,
                  opacity: [1, 1, 0],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </button>
  );
}

/* ─── Press Scale Wrapper ─── */
export function Pressable({
  children,
  className,
  onPress,
}: {
  children: React.ReactNode;
  className?: string;
  onPress?: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      onClick={onPress}
      className={cn(
        "cursor-pointer rounded-xl transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

/* ─── Fade In on Mount ─── */
export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Staggered List ─── */
export function StaggeredList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggeredItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ─── Slide Indicator (for tabs) ─── */
export function SlideIndicator({
  activeIndex,
  count,
  className,
}: {
  activeIndex: number;
  count: number;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1.5", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="h-1.5 rounded-full"
          animate={{
            width: i === activeIndex ? 24 : 6,
            backgroundColor:
              i === activeIndex
                ? "var(--color-brand-500)"
                : "var(--color-ink-200)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      ))}
    </div>
  );
}

/* ─── Number Counter ─── */
export function AnimatedNumber({
  value,
  duration = 0.8,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.span
      className={cn("tabular-nums", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      key={value}
    >
      <motion.span
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration, ease: "easeOut" }}
      >
        {value.toLocaleString()}
      </motion.span>
    </motion.span>
  );
}

/* ─── Toast Slide ─── */
export function SlideUp({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
