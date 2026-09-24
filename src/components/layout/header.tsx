"use client";

import { Link } from "@/components/i18n/link";
import { useActivePathname } from "@/hooks/use-active-pathname";
import { Menu, LayoutDashboard, ShieldCheck, Megaphone, LogOut, User as UserIcon, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notification-bell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/components/providers/locale-provider";
import type { SessionRole } from "@/lib/auth-demo";
import { invalidateSession, useSession } from "@/hooks/use-session";
import { logoutAction } from "@/app/actions/auth";
import { toast } from "@/components/ui/toast";
import { useInstallPrompt } from "@/hooks/use-install-prompt"

/**
 * `session` is a THREE-state prop:
 *   • a role  — the server resolved it (the app surface, which is per-user)
 *   • null    — the server checked and nobody is signed in
 *   • omitted — the server could not know, because this page is prerendered
 *               and its HTML is shared by every reader. The header asks
 *               /api/session after hydration instead.
 *
 * The distinction matters: while the answer is pending the account area shows
 * a neutral placeholder, never "Sign in". Collapsing "unknown" into "signed
 * out" is what makes a logged-in reader watch their account menu get replaced
 * by a sign-in button a moment after the page paints.
 */
export function Header({ session }: { session?: SessionRole | null }) {
  const { locale, t } = useLocale();
  // Locale-STRIPPED path — `usePathname()` returns `/en/search`, so every
  // `startsWith(href)` comparison here used to silently fail and NO nav item
  // ever showed as active (finding 1).
  const pathname = useActivePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { canInstall, isInstalled, install } = useInstallPrompt();
  const [installing, setInstalling] = useState(false);
  const account = useSession(session);
  const role = account.role;
  const signedIn = account.status === "known" && role !== null;
  const signedOut = account.status === "known" && role === null;

  const handleInstall = async () => {
    setInstalling(true);
    await install();
    setInstalling(false);
  };

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
    role === "admin" ? "/admin" : role === "company" ? "/company" : "/dashboard";
  const DashboardIcon =
    role === "admin" ? ShieldCheck : role === "company" ? Megaphone : LayoutDashboard;

  return (
    <header className="sticky top-0 z-header pt-[env(safe-area-inset-top)]">
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
            {signedIn && (
              <>
                <NotificationBell />
                <Link
                  href={dashboardHref}
                  data-tour="profile"
                  className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-ink-700 transition-colors hover:bg-ink-100 sm:inline-flex dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <DashboardIcon className="size-4" />
                  {role === "admin"
                    ? t("nav.admin")
                    : role === "company"
                      ? t("nav.company")
                      : t("nav.dashboard")}
                </Link>
                {/* 44px mobile touch target (was 32px — below the platform minimum).
                    Points at the DASHBOARD — it used to send signed-in users to
                    /auth/register (the sign-up page) on every tap (finding 10). */}
                <Link href={dashboardHref}>
                  <Button variant="ghost" className="h-11 w-11 sm:hidden" aria-label={t("nav.dashboard")}>
                    <UserIcon className="size-4" />
                  </Button>
                </Link>
              </>
            )}

            <LanguageSwitcher />
            <ThemeToggle />

            {signedIn && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  logoutAction();
                  invalidateSession();
                  toast("info", t("common.logout"));
                }}
                aria-label={t("common.logout")}
                title={t("common.logout")}
                className="hidden sm:inline-flex"
              >
                <LogOut className="size-4" />
              </Button>
            )}
            {signedOut && (
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
            {account.status === "pending" && (
              /* Reserves the width the resolved state will take, so the header
                 does not reflow when the answer arrives. aria-hidden + a
                 polite busy flag: there is nothing here for a screen reader to
                 announce yet. */
              <span
                aria-hidden
                className="hidden h-8 w-[8.5rem] animate-pulse rounded-lg bg-ink-200/60 sm:block dark:bg-ink-800/60"
              />
            )}

            {canInstall && !isInstalled && (
              <Button
                variant="ghost"
                onClick={handleInstall}
                disabled={installing}
                aria-label={t("mobileInstall.install")}
                title={t("mobileInstall.install")}
                className="relative h-11 w-11 text-brand-600 hover:bg-brand-500/10 sm:h-8 sm:w-8 sm:rounded-lg dark:text-brand-400"
              >
                <Download className="size-4" />
                <span className="absolute -top-0.5 -end-0.5 size-2 rounded-full bg-emerald-400 animate-pulse" />
              </Button>
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
            {signedIn && (
              <>
                <Link
                  href={dashboardHref}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-base font-medium text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <DashboardIcon className="size-5" />
                  {role === "admin" ? t("nav.admin") : role === "company" ? t("nav.company") : t("nav.dashboard")}
                </Link>
                {/* Logout lives in the mobile menu too — it was `sm:inline-flex`
                    only, so a signed-in phone user had NO way to sign out
                    (finding 10). */}
                <button
                  onClick={() => {
                    logoutAction();
                    invalidateSession();
                    toast("info", t("common.logout"));
                    setMobileOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-xl px-3.5 py-3 text-base font-medium text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800"
                >
                  <LogOut className="size-5" />
                  {t("common.logout")}
                </button>
              </>
            )}
            {signedOut && (
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
