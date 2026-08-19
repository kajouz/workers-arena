"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MessageSquare, Eye, ChevronUp, Pin, Lock, Clock } from "lucide-react";
import type { ForumPost as ForumPostType, ForumCategory } from "@/lib/forum/types";
import { FORUM_CATEGORIES } from "@/lib/forum/types";
import { useLocale } from "@/components/providers/locale-provider";
import { cn, formatNumber } from "@/lib/utils";

interface ForumPostProps {
  post: ForumPostType;
  index?: number;
}

/**
 * Forum post card component
 */
export function ForumPostCard({ post, index = 0 }: ForumPostProps) {
  const { locale } = useLocale();
  const category = FORUM_CATEGORIES[post.category];
  const timeAgo = getTimeAgo(post.createdAt);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
    >
      <Link
        href={`/forum/${post.id}`}
        className={cn(
          "group block rounded-2xl border bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift dark:bg-ink-900",
          post.isPinned
            ? "border-brand-500/40 ring-1 ring-brand-500/20"
            : "border-ink-200/80 dark:border-ink-800"
        )}
      >
        <div className="flex gap-4">
          {/* Vote count */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex size-12 flex-col items-center justify-center rounded-xl bg-ink-50 dark:bg-ink-800">
              <ChevronUp className="size-4 text-ink-400" />
              <span className="text-sm font-bold text-ink-700 dark:text-ink-200">
                {post.upvotes - post.downvotes}
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              {post.isPinned && (
                <Pin className="size-4 shrink-0 text-brand-500" />
              )}
              {post.isLocked && (
                <Lock className="size-4 shrink-0 text-ink-400" />
              )}
              <h3 className="text-base font-bold text-ink-900 dark:text-ink-50 group-hover:text-brand-600 dark:group-hover:text-brand-400 line-clamp-2">
                {post.title}
              </h3>
            </div>

            <p className="mt-1.5 text-sm text-ink-500 dark:text-ink-400 line-clamp-2">
              {post.content.slice(0, 200)}...
            </p>

            {/* Tags */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {category?.icon} {locale === "ar" ? category?.nameAr : category?.nameEn}
              </span>
              {post.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-bold text-brand-600 dark:text-brand-400"
                >
                  #{tag}
                </span>
              ))}
            </div>

            {/* Meta */}
            <div className="mt-3 flex items-center gap-4 text-xs text-ink-400 dark:text-ink-500">
              <span className="font-medium text-ink-600 dark:text-ink-300">
                {post.authorName}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {timeAgo}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="size-3" />
                {formatNumber(post.views)}
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="size-3" />
                {post.answerCount} {locale === "ar" ? "إجابات" : "answers"}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

/**
 * Forum answer component
 */
export function ForumAnswer({
  answer,
  isAccepted,
}: {
  answer: {
    id: string;
    content: string;
    authorName: string;
    authorRole: string;
    createdAt: Date;
    upvotes: number;
    downvotes: number;
    isAccepted: boolean;
  };
  isAccepted: boolean;
}) {
  const [votes, setVotes] = useState(answer.upvotes - answer.downvotes);

  return (
    <div
      className={cn(
        "rounded-2xl border p-4",
        isAccepted
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-ink-200/80 bg-white dark:border-ink-800 dark:bg-ink-900"
      )}
    >
      <div className="flex gap-4">
        {/* Vote controls */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={() => setVotes((v) => v + 1)}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-brand-500 dark:hover:bg-ink-800"
          >
            <ChevronUp className="size-5" />
          </button>
          <span className="text-sm font-bold text-ink-700 dark:text-ink-200">{votes}</span>
          <button
            onClick={() => setVotes((v) => v - 1)}
            className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-red-500 dark:hover:bg-ink-800"
          >
            <ChevronUp className="size-5 rotate-180" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1">
          {isAccepted && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              ✓ Accepted Answer
            </div>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-ink-700 dark:text-ink-200 whitespace-pre-wrap">{answer.content}</p>
          </div>
          <div className="mt-4 flex items-center gap-3 text-xs text-ink-400">
            <span className="font-medium text-ink-600 dark:text-ink-300">
              {answer.authorName}
            </span>
            <span>{answer.authorRole}</span>
            <span>{getTimeAgo(answer.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Forum category filter
 */
export function ForumCategoryFilter({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (category: string) => void;
}) {
  const { locale } = useLocale();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange("all")}
        className={cn(
          "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
          selected === "all"
            ? "bg-brand-500 text-white"
            : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
        )}
      >
        All
      </button>
      {Object.entries(FORUM_CATEGORIES).map(([key, value]) => (
        <button
          key={key}
          onClick={() => onChange(key as ForumCategory)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
            selected === key
              ? "bg-brand-500 text-white"
              : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
          )}
        >
          {value.icon} {locale === "ar" ? value.nameAr : value.nameEn}
        </button>
      ))}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}
