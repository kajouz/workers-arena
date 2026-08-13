"use client";

import Link from "next/link";
import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";
import type { Notification } from "@/lib/data/types";
import { markAllReadAction, markReadAction } from "@/app/actions/business";
import { toast } from "@/components/ui/toast";
import { cn, timeAgo } from "@/lib/utils";

const TYPE_DOT: Record<Notification["type"], string> = {
  subscription: "bg-violet-500",
  verification: "bg-emerald-500",
  lead: "bg-sky-500",
  review: "bg-amber-500",
  system: "bg-ink-400",
  campaign: "bg-fuchsia-500",
  bookingRequest: "bg-orange-500",
  bookingConfirmed: "bg-emerald-500",
  bookingDeclined: "bg-red-500",
  bookingCancelled: "bg-red-400",
  bookingReminder: "bg-amber-500",
  bookingCompleted: "bg-teal-500",
  bookingPaid: "bg-emerald-500",
  bookingRescheduled: "bg-sky-500",
  bookingRefund: "bg-emerald-500",
  campaignRefunded: "bg-emerald-500",
};

export function NotificationBell() {
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setUnread(d.unread ?? 0);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markRead = async (id: string) => {
    const f = new FormData();
    f.set("id", id);
    await markReadAction(f);
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, read: true } : x)));
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAll = async () => {
    await markAllReadAction();
    setItems((xs) => xs.map((x) => ({ ...x, read: true })));
    setUnread(0);
    toast("success", t("notifications.markAll"));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl p-2 text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800 dark:hover:text-ink-50"
        aria-label={t("notifications.title")}
        title={t("notifications.title")}
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-black text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-lift dark:border-ink-700 dark:bg-ink-900">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3 dark:border-ink-800">
            <p className="text-sm font-black text-ink-900 dark:text-ink-50">{t("notifications.title")}</p>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400">
                <CheckCheck className="size-3.5" /> {t("notifications.markAll")}
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-ink-400">{t("notifications.empty")}</p>
            )}
            {items.slice(0, 6).map((n) => (
              <Link
                key={n.id}
                href={n.href ?? "/notifications"}
                onClick={() => !n.read && markRead(n.id)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50",
                  !n.read && "bg-brand-500/5"
                )}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", TYPE_DOT[n.type])} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                    {locale === "ar" ? n.titleAr : n.titleEn}
                  </span>
                  <span className="clamp-2 block text-xs text-ink-500 dark:text-ink-400">
                    {locale === "ar" ? n.bodyAr : n.bodyEn}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-400">{timeAgo(n.time, locale)}</span>
                </span>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" />}
              </Link>
            ))}
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-100 px-4 py-2.5 text-center text-xs font-bold text-brand-600 hover:bg-ink-50 dark:border-ink-800 dark:text-brand-400 dark:hover:bg-ink-800/50"
          >
            {t("notifications.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
