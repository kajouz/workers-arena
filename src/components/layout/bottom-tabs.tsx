"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Home, Search, Calendar, Heart, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

interface Tab {
  href: string;
  labelKey: string;
  icon: typeof Home;
  match?: (pathname: string) => boolean;
  badgeKey?: string;
}

const TABS: Tab[] = [
  {
    href: "/",
    labelKey: "nav.home",
    icon: Home,
    match: (p) => p === "/",
  },
  {
    href: "/search",
    labelKey: "nav.findWorkers",
    icon: Search,
    match: (p) => p.startsWith("/search") || p.startsWith("/categories"),
  },
  {
    href: "/bookings",
    labelKey: "booking.myBookings",
    icon: Calendar,
    match: (p) => p.startsWith("/bookings"),
  },
  {
    href: "/favorites",
    labelKey: "nav.favorites",
    icon: Heart,
    match: (p) => p.startsWith("/favorites"),
  },
  {
    href: "/dashboard",
    labelKey: "nav.dashboard",
    icon: User,
    match: (p) =>
      p.startsWith("/dashboard") ||
      p.startsWith("/admin") ||
      p.startsWith("/workers/") ||
      p === "/login",
  },
];

export function BottomTabs({ badge }: { badge?: Record<string, number> }) {
  const pathname = usePathname();
  const { t } = useLocale();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-100 bg-white/90 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-950/90 lg:hidden"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {TABS.map((tab) => {
          const active = tab.match?.(pathname) ?? pathname === tab.href;
          const Icon = tab.icon;
          const count = badge?.[tab.badgeKey ?? tab.labelKey];

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 py-1.5",
                "min-h-[44px] min-w-[44px] touch-manipulation",
                "transition-colors",
                active
                  ? "text-brand-500"
                  : "text-ink-400 hover:text-ink-600 dark:text-ink-500 dark:hover:text-ink-300"
              )}
              aria-current={active ? "page" : undefined}
            >
              <div className="relative">
                <Icon className="size-6" strokeWidth={active ? 2.5 : 2} />

                {/* Badge */}
                {count && count > 0 && (
                  <span className="absolute -right-2 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {count > 9 ? "9+" : count}
                  </span>
                )}
              </div>

              <span className="text-[11px] font-medium leading-tight text-ink-700 dark:text-ink-300">
                {t(tab.labelKey)}
              </span>

              {/* Active indicator */}
              {active && (
                <motion.div
                  layoutId="bottom-tab-indicator"
                  className="absolute -top-px left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-brand-500"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </Link>
          );
        })}
      </div>

      {/* Safe area spacer for iPhone */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
