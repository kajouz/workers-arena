"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLocale } from "@/components/providers/locale-provider";

interface BookingThread {
  bookingId: string;
  workerName: string;
  workerSlug: string;
  jobTitle: string;
  status: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount: number;
  otherPartyRole: "customer" | "worker";
  customerName?: string;
}

interface ChatThreadListProps {
  /** "worker" or "customer" — determines which bookings to list and how to link. */
  role: "worker" | "customer";
}

export default function ChatThreadList({ role }: ChatThreadListProps) {
  const { t } = useLocale();
  const [threads, setThreads] = useState<BookingThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread" | "active">("all");

  useEffect(() => {
    async function fetchThreads() {
      try {
        // Fetch bookings that have messages
        const res = await fetch("/api/bookings");
        if (res.ok) {
          const data = await res.json();
          const bookings = data.bookings || data || [];

          // Map to thread format
          const threadList: BookingThread[] = bookings
            .filter(
              (b: { status?: string }) =>
                b.status !== "CANCELLED" && b.status !== "DECLINED"
            )
            .map(
              (b: {
                id: string;
                workerName?: string;
                workerSlug?: string;
                jobTitle?: string;
                status?: string;
                customerName?: string;
                messages?: { text: string; time: string }[];
              }) => ({
                bookingId: b.id,
                workerName: b.workerName || "Worker",
                workerSlug: b.workerSlug || "",
                jobTitle: b.jobTitle || "Service",
                status: b.status || "REQUESTED",
                customerName: b.customerName || "Customer",
                lastMessage: b.messages?.[b.messages.length - 1]?.text,
                lastMessageTime:
                  b.messages?.[b.messages.length - 1]?.time,
                unreadCount: 0,
                otherPartyRole: role === "worker" ? "customer" : "worker",
              })
            );

          setThreads(threadList);
        }
      } catch (err) {
        console.error("Failed to fetch chat threads:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchThreads();
  }, [role]);

  const filteredThreads = threads.filter((thread) => {
    if (filter === "unread") return thread.unreadCount > 0;
    if (filter === "active")
      return (
        thread.status === "REQUESTED" ||
        thread.status === "CONFIRMED" ||
        thread.status === "IN_PROGRESS"
      );
    return true;
  });

  const formatTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return t("chat.justNow");
      if (diffMins < 60) return `${diffMins}m`;
      if (diffHours < 24) return `${diffHours}h`;
      if (diffDays < 7) return `${diffDays}d`;
      return date.toLocaleDateString();
    } catch {
      return "";
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "REQUESTED":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "CONFIRMED":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "IN_PROGRESS":
        return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "COMPLETED":
        return "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400";
      default:
        return "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400";
    }
  };

  const getLink = (thread: BookingThread) => {
    if (role === "worker") {
      return `/dashboard?tab=bookings&booking=${thread.bookingId}`;
    }
    return `/bookings?booking=${thread.bookingId}`;
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2">
        {(["all", "unread", "active"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-brand-500 text-white"
                : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-400"
            }`}
          >
            {f === "all" ? t("chat.all") : f === "unread" ? t("chat.unread") : t("chat.active")}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {filteredThreads.length === 0 ? (
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center dark:border-ink-700 dark:bg-ink-900">
          <p className="text-sm text-ink-500">{t("chat.noConversations")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredThreads.map((thread) => (
            <Link
              key={thread.bookingId}
              href={getLink(thread)}
              className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm dark:border-ink-700 dark:bg-ink-900 dark:hover:border-brand-600"
            >
              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                {role === "worker"
                  ? thread.customerName?.[0] || "C"
                  : thread.workerName?.[0] || "W"}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="truncate text-sm font-semibold text-ink-800 dark:text-ink-200">
                    {role === "worker"
                      ? thread.customerName
                      : thread.workerName}
                  </h4>
                  <span className="text-[10px] text-ink-400">
                    {formatTime(thread.lastMessageTime)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {thread.jobTitle}
                </p>
                {thread.lastMessage && (
                  <p className="mt-1 truncate text-xs text-ink-400 dark:text-ink-500">
                    {thread.lastMessage}
                  </p>
                )}
              </div>

              {/* Status & unread */}
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColor(thread.status)}`}
                >
                  {thread.status}
                </span>
                {thread.unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-bold text-white">
                    {thread.unreadCount}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
