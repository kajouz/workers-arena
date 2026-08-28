"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Eye,
  MessageSquareText,
  Star,
  Zap,
  Crown,
  CalendarClock,
  ArrowUpRight,
  PencilLine,
  ImagePlus,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Wallet,
} from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import type { SessionUser } from "@/lib/auth-demo";
import type { AnalyticsOverview, Booking, BookingMessage, BookingSlot, Invoice, LedgerEntry, RecurringBooking, Worker, WorkerBalance } from "@/lib/data/types";
import type { WorkerEmailPreview } from "@/app/dashboard/page";
import { PLANS, subscriptionStatus, daysUntil } from "@/lib/data/subscriptions";
import { computeResponseRate } from "@/lib/data/booking-ui";
import { WithdrawDialog } from "./withdraw-dialog";
import { StatCard } from "./stat-card";
import { AreaChart } from "./charts";
import { BookingsPanel } from "./bookings/bookings-panel";
import { AvailabilityPanel } from "./bookings/availability-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Rating } from "@/components/ui/rating";
import { GradientAvatar } from "@/components/ui/avatar";
import { formatNumber, formatDate, formatCompact, formatPrice } from "@/lib/utils";
import { Price } from "@/components/shared/price";
import { RenewDialog } from "./renew-dialog";
import { UpgradeDialog } from "./upgrade-dialog";
import { VerificationBanner } from "./verification-banner";
import { WorkerRevenueTools } from "./worker-revenue-tools";

export function WorkerDashboard({
  session,
  analytics,
  worker,
  invoices,
  bookings,
  messagesByBooking,
  previewsByBooking,
  recurrings,
  slots,
  balance,
  payouts,
  nowSeed,
}: {
  session: SessionUser;
  analytics: AnalyticsOverview;
  worker: Worker;
  invoices: Invoice[];
  bookings: Booking[];
  /** §2.3 chat — each booking's negotiation thread, keyed by booking id. */
  messagesByBooking: Record<string, BookingMessage[]>;
  /** "Preview email" — the WORKER-facing email each booking's state implies
   * (workerEmailPreviewFor), keyed by booking id. The rows render the same
   * bilingual dialog the customer + admin surfaces use. */
  previewsByBooking: Record<string, WorkerEmailPreview>;
  /** M1 recurring contracts (§7 #1) — the BookingsPanel's Recurring tab. */
  recurrings: RecurringBooking[];
  slots: BookingSlot[];
  /** Payouts (docs/payouts.md) — spendable balance + withdrawal history. */
  balance: WorkerBalance;
  payouts: LedgerEntry[];
  /** Date.now() at server render time — the rows' hydration-safe now seed. */
  nowSeed: number;
}) {
  const { locale, t } = useLocale();
  const sub = worker.subscription;
  const subStatus = subscriptionStatus(sub);
  const daysLeft = Math.max(0, daysUntil(sub.expiresAt));
  const viewsData = analytics.viewsSeries.slice(0, 18).map((p) => p.value);
  const leadsData = analytics.leadsSeries.slice(0, 18).map((p) => p.value);
  const responseRate = computeResponseRate(bookings);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <GradientAvatar name={session.name} hue={session.hue} className="size-14" />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
              {t("dashboard.greeting").replace("{name}", session.name.split(" ")[0])}
            </h1>
            <p className="text-sm text-ink-500 dark:text-ink-400">{t("dashboard.subtitle")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <PencilLine className="size-4" /> {t("dashboard.editProfile")}
          </Button>
          <Button asChild>
            <Link href={`/workers/${worker.slug}`}>
              {t("dashboard.viewLive")} <ArrowUpRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("dashboard.profileViews")} value={worker.views} icon={<Eye className="size-5" />} trend={18} spark={viewsData} color="#f97316" index={0} />
        <StatCard label={t("dashboard.totalLeads")} value={worker.leads} icon={<MessageSquareText className="size-5" />} trend={32} spark={leadsData} color="#0ea5e9" index={1} />
        <StatCard label={t("dashboard.avgRating")} value={worker.rating.toFixed(1)} icon={<Star className="size-5" />} trend={4} color="#f59e0b" index={2} />
        <StatCard
          label={t("dashboard.responseRate")}
          value={responseRate === null ? t("booking.noData") : `${responseRate}%`}
          icon={<Zap className="size-5" />}
          color="#10b981"
          index={3}
        />
      </div>

      {/* verification + expiry banners */}
      <div className="mt-8 space-y-3">
        <VerificationBanner worker={worker} />
        {subStatus === "expired" && (
          <Card className="border-red-500/30 bg-red-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm font-bold text-red-600 dark:text-red-400">{t("subscription.expiredBanner")}</p>
              <RenewDialog worker={worker} />
            </CardContent>
          </Card>
        )}
        {subStatus === "expiring" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{t("subscription.expiringBanner")}</p>
              <RenewDialog worker={worker} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Revenue Tools — credits, tokens, commission, promoted profiles */}
      <div className="mt-8">
        <WorkerRevenueTools />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* chart + reviews */}
        <div className="space-y-6 lg:col-span-2">
          {/* bookings — M1 worker panel (docs/booking-scheduling.md §6) */}
          <BookingsPanel bookings={bookings} messagesByBooking={messagesByBooking} previewsByBooking={previewsByBooking} recurrings={recurrings} worker={worker} nowSeed={nowSeed} />

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{t("dashboard.viewsTitle")}</CardTitle>
              <Badge variant="success">
                <TrendingUp className="size-3" /> +18%
              </Badge>
            </CardHeader>
            <CardContent>
              <AreaChart data={viewsData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.recentReviews")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {worker.reviews.slice(0, 3).map((r) => (
                <div key={r.id} className="flex items-start gap-3 rounded-xl border border-ink-100 p-4 dark:border-ink-800">
                  <GradientAvatar name={r.author} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-ink-900 dark:text-ink-50">{r.author}</p>
                      <Rating value={r.rating} size={11} />
                    </div>
                    <p className="clamp-2 mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
                      {locale === "ar" ? r.textAr : r.textEn}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* sidebar */}
        <div className="space-y-6">
          {/* subscription */}
          <Card className="overflow-hidden">
            <div className={`bg-gradient-to-br p-5 text-white ${subStatus === "expired" ? "from-red-500 to-rose-600" : "from-violet-500 to-fuchsia-600"}`}>
              <div className="flex items-center justify-between">
                <Badge className="border-white/25 bg-white/15 text-white">
                  <Crown className="size-3" /> {locale === "ar" ? PLANS[sub.plan].labelAr : PLANS[sub.plan].labelEn}
                </Badge>
                <Badge variant={subStatus === "expired" ? "danger" : "success"} className="bg-white/15 text-white">
                  ● {subStatus === "expired" ? t("subscription.expired") : t("dashboard.planStatus")}
                </Badge>
              </div>
              <p className="mt-4 text-2xl font-black">
                ${sub.price} {(sub.period === "annual" ? t("plans.perYear") : t("plans.perMonth")).trim()}
              </p>
              <p className="mt-1 text-xs text-white/75">
                {t("dashboard.planExpires").replace("{date}", formatDate(sub.expiresAt, locale))}
              </p>
            </div>
            <CardContent className="space-y-4 pt-5">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink-500 dark:text-ink-400">
                    {t("dashboard.daysLeft").replace("{days}", String(daysLeft))}
                  </span>
                  <span className="font-bold text-ink-900 dark:text-ink-50">
                    {subStatus === "expired" ? 0 : Math.min(100, Math.round((daysLeft / (sub.period === "annual" ? 365 : 30)) * 100))}%
                  </span>
                </div>
                <Progress value={subStatus === "expired" ? 0 : Math.min(100, Math.round((daysLeft / (sub.period === "annual" ? 365 : 30)) * 100))} />
              </div>
              <RenewDialog worker={worker} />
              {/* §Lebanon — paid upgrades (verification / featured / emergency)
                  paid via the manual OMT/Whish methods (BUSINESS-MODEL §5.1). */}
              <UpgradeDialog worker={worker} />
            </CardContent>
          </Card>

          {/* availability — M2 editor (docs/booking-scheduling.md §6) */}
          <AvailabilityPanel slots={slots} worker={worker} />

          {/* invoices — subscription renewals (advertising invoices live on the company dashboard) */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Receipt className="size-4 text-brand-500" />
              <CardTitle className="text-base">{t("dashboard.invoices")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoices.length === 0 && (
                <p className="py-3 text-center text-sm text-ink-400">{t("dashboard.invoicesEmpty")}</p>
              )}
              {invoices.slice(0, 4).map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-xl bg-ink-50 px-4 py-2.5 dark:bg-ink-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">{inv.number}</p>
                    <p className="truncate text-xs text-ink-400">{locale === "ar" ? inv.descriptionAr : inv.descriptionEn}</p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-black text-ink-900 dark:text-ink-50">${formatCompact(inv.amount)}</p>
                    <Badge variant={inv.status === "paid" ? "success" : "outline"} className="mt-0.5 text-[10px]">
                      {t(`company.status${inv.status[0].toUpperCase()}${inv.status.slice(1)}`)}
                    </Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* payouts — worker earnings ledger (docs/payouts.md) */}
          <Card>
            <CardHeader className="flex-row items-center gap-2">
              <Wallet className="size-4 text-brand-500" />
              <CardTitle className="text-base">{t("dashboard.payoutsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("dashboard.payoutsAvailable")}</p>
                  <p className="text-2xl font-black text-ink-900 dark:text-ink-50">
                    {formatPrice(balance.availableMinor / 100, balance.currency, locale)}
                  </p>
                </div>
                {balance.pendingMinor > 0 && (
                  <div className="text-end">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t("dashboard.payoutsPending")}</p>
                    <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {formatPrice(balance.pendingMinor / 100, balance.currency, locale)}
                    </p>
                  </div>
                )}
              </div>
              <WithdrawDialog workerId={worker.id} balance={balance} />
              {payouts.length > 0 ? (
                <div className="space-y-1.5 border-t border-ink-100 pt-3 dark:border-ink-800">
                  {payouts.slice(0, 4).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 text-ink-600 dark:text-ink-300">
                        <Badge
                          variant={
                            p.status === "processed" ? "success" : p.status === "rejected" ? "danger" : "outline"
                          }
                          className="text-[10px]"
                        >
                          {t(`dashboard.payoutStatus${p.status[0].toUpperCase()}${p.status.slice(1)}`)}
                        </Badge>
                        <span className="text-ink-400">{formatDate(p.time, locale)}</span>
                      </span>
                      <span className="font-bold text-ink-900 dark:text-ink-50">
                        {formatPrice(Math.abs(p.amount) / 100, p.currency, locale)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="pt-1 text-xs text-ink-400">{t("dashboard.payoutsEmpty")}</p>
              )}
            </CardContent>
          </Card>

          {/* completion */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.profileCompletion")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="relative flex size-16 items-center justify-center">
                  <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="4" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="4"
                      strokeDasharray={`${(worker.completion / 100) * 100} 100`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute text-sm font-black text-ink-900 dark:text-ink-50">{worker.completion}%</span>
                </div>
                <ul className="space-y-1 text-xs text-ink-500 dark:text-ink-400">
                  {[t("dashboard.tip1"), t("dashboard.tip2"), t("dashboard.tip3")].map((tip) => (
                    <li key={tip} className="flex items-start gap-1.5">
                      <ShieldCheck className="mt-0.5 size-3 shrink-0 text-brand-500" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
              <Button variant="outline" size="sm" className="mt-4 w-full">
                <ImagePlus className="size-4" /> {t("dashboard.addPortfolio")}
              </Button>
            </CardContent>
          </Card>

          {/* pricing hint */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("worker.priceRange")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Price amount={worker.priceMin} currency={worker.currency} locale={locale} className="text-2xl font-black text-brand-600 dark:text-brand-400" />
              <span className="text-ink-400"> – </span>
              <Price amount={worker.priceMax} currency={worker.currency} locale={locale} className="text-2xl font-black text-brand-600 dark:text-brand-400" />
              <p className="mt-2 text-xs text-ink-400">{formatNumber(worker.views)} {t("common.viewCount")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
