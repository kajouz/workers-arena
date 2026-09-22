"use client";

/**
 * §Settlement — the admin reconciliation card.
 *
 * The take rate is only real money when the platform handled the money. This
 * card is the audit that proves it: what the platform *stamped* as its fee
 * versus what it actually *collected*, how much worker earnings are legitimately
 * blocked on a customer paying, and how much of an outside-platform fee claim is
 * still to recover. `unbackedMinor` is the invariant's canary — ledger money
 * credited for a job that never collected — and it should only ever read $0.00.
 *
 * All the arithmetic lives in the pure engine (src/lib/data/booking-settlement.ts);
 * this file only lays it out.
 */

import { AlertTriangle, Landmark } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice } from "@/lib/utils";
import { TENANT_CURRENCY } from "@/lib/currency";
import {
  reconcileSettlements,
  reconciliationQueue,
  type SettlementJob,
  type SettlementState,
} from "@/lib/data/booking-settlement";

/** Badge intent per settlement state (variants that exist on Badge). */
const STATE_BADGE: Record<SettlementState, "success" | "secondary" | "solid" | "outline" | "danger"> = {
  funded: "success",
  "part-funded": "solid",
  "awaiting-customer": "outline",
  "awaiting-confirmation": "secondary",
  "outside-platform": "secondary",
  overpaid: "danger",
  "no-quote": "outline",
};

/** How many queue rows to show before the view gets long. */
const QUEUE_LIMIT = 8;

export function SettlementReconciliationCard({ jobs }: { jobs: SettlementJob[] }) {
  const { locale, t } = useLocale();
  const tally = reconcileSettlements(jobs);
  const queue = reconciliationQueue(jobs).slice(0, QUEUE_LIMIT);
  const money = (minor: number) => formatPrice(minor / 100, TENANT_CURRENCY, locale);

  return (
    <Card className={tally.unbackedMinor > 0 ? "border-red-500/40" : undefined}>
      <CardHeader className="flex-row items-center gap-2">
        <Landmark className="size-4 shrink-0 text-brand-500" />
        <CardTitle className="min-w-0 text-base">{t("admin.settlementTitle")}</CardTitle>
        {tally.blockedJobs > 0 && <Badge variant="danger">{tally.blockedJobs}</Badge>}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-500 dark:text-ink-400">{t("admin.settlementSubtitle")}</p>

        {/* The canary: fees stamped vs. fees actually held. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric
            label={t("admin.settlementStamped")}
            value={money(tally.feeStampedMinor)}
            hint={t("admin.settlementStampedHint", { jobs: tally.jobs })}
          />
          <Metric
            label={t("admin.settlementCollected")}
            value={money(tally.feeCollectedMinor)}
            hint={t("admin.settlementCollectedHint")}
          />
          <Metric
            label={t("admin.settlementUncollected")}
            value={money(tally.feeUncollectedMinor)}
            hint={t("admin.settlementUncollectedHint")}
          />
          <Metric
            label={t("admin.settlementUnbacked")}
            value={money(tally.unbackedMinor)}
            hint={t("admin.settlementUnbackedHint")}
            danger={tally.unbackedMinor > 0}
          />
        </div>

        {/* Worker money: what the ledger holds, what it still owes, what is stuck. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label={t("admin.settlementJobValue")}
            value={money(tally.jobValueMinor)}
            hint={t("admin.settlementJobValueHint", { collected: money(tally.collectedMinor) })}
          />
          <Metric
            label={t("admin.settlementOwed")}
            value={money(tally.owedMinor)}
            hint={t("admin.settlementOwedHint", { jobs: tally.blockedJobs })}
          />
          <Metric
            label={t("admin.settlementBlocked")}
            value={money(tally.blockedMinor)}
            hint={t("admin.settlementBlockedHint")}
            danger={tally.blockedMinor > 0}
          />
        </div>

        {/* Outside-platform fee claims — collectable against credit balances, never accrued. */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label={t("admin.settlementOutsideClaim")}
            value={money(tally.feeClaimMinor)}
            hint={t("admin.settlementOutsideClaimHint", { jobs: tally.byState["outside-platform"] })}
          />
          <Metric
            label={t("admin.settlementOutsideRecovered")}
            value={money(tally.feeClaimCollectedMinor)}
            hint={t("admin.settlementOutsideRecoveredHint")}
          />
          <Metric
            label={t("admin.settlementOutsideOutstanding")}
            value={money(tally.feeClaimOutstandingMinor)}
            hint={t("admin.settlementOutsideOutstandingHint")}
          />
        </div>

        {/* The worklist: worst first (unbacked → claims → blocked → part-funded). */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("admin.settlementQueueTitle")}</p>
          {queue.length === 0 ? (
            <p className="py-2 text-sm text-ink-400">{t("admin.settlementQueueClear")}</p>
          ) : (
            <div className="space-y-1.5">
              {queue.map((job) => (
                <div
                  key={job.bookingId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-50 px-3 py-2 dark:bg-ink-800"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink-900 dark:text-ink-50">
                      {locale === "ar" ? job.workerNameAr : job.workerNameEn}
                    </p>
                    <p className="truncate text-[11px] text-ink-400">
                      {job.number}
                      {job.reference ? ` · ${job.reference}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.blockedOnCollection && <AlertTriangle className="size-3.5 text-amber-500" />}
                    <Badge variant={STATE_BADGE[job.settlement.state]} className="font-medium">
                      {t(`admin.settlementState.${job.settlement.state}`)}
                    </Badge>
                    {job.dueMinor > 0 && (
                      <span className="text-sm font-black tabular-nums text-ink-900 dark:text-ink-50">
                        {money(job.dueMinor)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  hint,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        danger ? "border-red-500/30 bg-red-500/5" : "border-ink-100 dark:border-ink-800"
      }`}
    >
      <p className="text-xs font-medium text-ink-500 dark:text-ink-400">{label}</p>
      <p className={`mt-1 text-lg font-bold tabular-nums ${danger ? "text-red-600 dark:text-red-400" : ""}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-400">{hint}</p>
    </div>
  );
}
