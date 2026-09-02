"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Bell, User, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

interface TabItem {
  id: string;
  href: string;
  icon: typeof Home;
  labelKey: string;
  labelAr: string;
}

const tabs: TabItem[] = [
  { id: "home", href: "/", icon: Home, labelKey: "nav.home", labelAr: "الرئيسية" },
  { id: "search", href: "/search", icon: Search, labelKey: "nav.search", labelAr: "بحث" },
  { id: "bookings", href: "/bookings", icon: Briefcase, labelKey: "nav.bookings", labelAr: "حجوزاتي" },
  { id: "notifications", href: "/notifications", icon: Bell, labelKey: "nav.notifications", labelAr: "إشعارات" },
  { id: "dashboard", href: "/dashboard", icon: User, labelKey: "nav.dashboard", labelAr: "لوحة التحكم" },
];

export function MobileTabBar() {
  const pathname = usePathname();
  const { locale, t } = useLocale();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch unread notification count
  useEffect(() => {
    async function fetchUnread() {
      try {
        const res = await fetch("/api/notifications/unread-count");
        if (res.ok) {
          const data = await res.json();
          setUnreadCount(data.count || 0);
        }
      } catch {
        // Silent fail
      }
    }
    fetchUnread();
    // Poll every 30 seconds
    const interval = setInterval(fetchUnread, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 lg:hidden">
      {/* Safe area padding for iOS */}
      <div className="bg-white/95 dark:bg-ink-950/95 backdrop-blur-xl border-t border-ink-200 dark:border-ink-800 pb-safe">
        <div className="flex items-center justify-around px-2 py-1">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || 
              (tab.href !== "/" && pathname.startsWith(tab.href));
            const Icon = tab.icon;
            const label = locale === "ar" ? tab.labelAr : t(tab.labelKey);

            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-[60px]",
                  isActive
                    ? "text-brand-600 dark:text-brand-400"
                    : "text-ink-400 dark:text-ink-500 hover:text-ink-600 dark:hover:text-ink-300"
                )}
              >
                <div className="relative">
                  <Icon className="size-5" />
                  {tab.id === "notifications" && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
