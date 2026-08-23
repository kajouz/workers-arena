"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LayoutDashboard, ShieldCheck, Megaphone, LogOut, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/components/providers/locale-provider";
import type { SessionUser } from "@/lib/auth-demo";
import { logoutAction } from "@/app/actions/auth";
import { toast } from "@/components/ui/toast";

export function Header({
  session,
  initialTheme = "light",
}: {
  session: SessionUser | null;
  initialTheme?: "light" | "dark";
}) {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: "/", label: t("nav.home") },
    { href: "/search", label: t("nav.findWorkers") },
    { href: "/categories", label: t("nav.categories") },
    { href: "/favorites", label: t("nav.favorites"), tour: "favorites" },
    { href: "/company", label: t("nav.advertise") ?? "Advertise" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const dashboardHref =
    session?.role === "admin" ? "/admin" : session?.role === "company" ? "/company" : "/dashboard";
  const DashboardIcon =
    session?.role === "admin" ? ShieldCheck : session?.role === "company" ? Megaphone : LayoutDashboard;

  return (
    <header className="sticky top-0 z-40">
      <div className="glass-strong border-x-0 border-t-0">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Logo textClassName="hidden sm:inline" />

          {/* Desktop nav */}
          <nav className="ms-6 hidden items-center gap-1 lg:flex" aria-label="Main">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                {...('tour' in link && link.tour ? { 'data-tour': link.tour as string } : {})}
                className={cn(
                  "relative rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50",
                  isActive(link.href) && "text-ink-900 dark:text-ink-50"
                )}
              >
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-brand-500" />
                )}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex shrink-0 items-center gap-1.5">
            {session && (
              <>
                <NotificationBell />
                <Link
                  href={dashboardHref}
                  data-tour="profile"
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 sm:inline-flex dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <DashboardIcon className="size-4" />
                  {session.role === "admin"
                    ? t("nav.admin")
                    : session.role === "company"
                      ? t("nav.company")
                      : t("nav.dashboard")}
                </Link>
                <Link href="/auth/register">
                  <Button variant="ghost" size="icon-sm" className="sm:hidden" aria-label={t("nav.listService")}>
                    <UserIcon className="size-4" />
                  </Button>
                </Link>
              </>
            )}

            <LanguageSwitcher />
            <ThemeToggle initialTheme={initialTheme} />

            {session ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  logoutAction();
                  toast("info", t("common.logout"));
                }}
                aria-label={t("common.logout")}
                title={t("common.logout")}
                className="hidden sm:inline-flex"
              >
                <LogOut className="size-4" />
              </Button>
            ) : (
              <>
                <Link href="/auth/login" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    {t("common.login")}
                  </Button>
                </Link>
                <Link href="/auth/register" className="hidden sm:block">
                  <Button size="sm">{t("nav.listService")}</Button>
                </Link>
              </>
            )}

            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label={t("common.menu")}>
              <Menu className="size-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="top-6 max-w-sm translate-y-0 sm:mx-auto">
          <DialogHeader>
            <DialogTitle>{t("common.menu")}</DialogTitle>
          </DialogHeader>
          <nav className="flex flex-col gap-1" aria-label="Mobile">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "rounded-xl px-3.5 py-3 text-base font-medium text-ink-700 transition-colors hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800",
                  isActive(link.href) && "bg-brand-500/10 text-brand-700 dark:text-brand-400"
                )}
              >
                {link.label}
              </Link>
            ))}
            {session && (
              <Link
                href={dashboardHref}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-base font-medium text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
              >
                <DashboardIcon className="size-5" />
                {session.role === "admin" ? t("nav.admin") : session.role === "company" ? t("nav.company") : t("nav.dashboard")}
              </Link>
            )}
            {!session && (
              <>
                <Link href="/auth/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="mt-2 w-full">
                    {t("common.login")}
                  </Button>
                </Link>
                <Link href="/auth/register" onClick={() => setMobileOpen(false)}>
                  <Button className="mt-2 w-full">{t("nav.listService")}</Button>
                </Link>
              </>
            )}
          </nav>
        </DialogContent>
      </Dialog>
    </header>
  );
}
