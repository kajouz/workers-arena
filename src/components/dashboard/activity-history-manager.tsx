"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Filter, Loader2, Search } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GradientAvatar } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/utils";
import { ActivityTypeChips, type ActivityTypeFilterValue } from "./activity-type-chips";
import type { ActivityPage } from "@/lib/data/activity";
import type { ActivityEntry } from "@/lib/data/types";

const PAGE_SIZE = 20;

/**
 * Verification workflow codes — kept in sync with ACTION_CODES in
 * src/lib/data/activity.ts (inlined here for the same client-bundle reason).
 */
const CODE_REQUEST = "VERIFICATION_REQUEST_SUBMITTED";
const CODE_VERIFIED = "WORKER_VERIFIED";
const CODE_DECLINED = "VERIFICATION_DECLINED";
const CODE_BOOKING_REQUESTED = "BOOKING_REQUESTED";
const CODE_BOOKING_CONFIRMED = "BOOKING_CONFIRMED";
const CODE_BOOKING_CANCELLED = "BOOKING_CANCELLED";

/** Dot color per activity entry (matches the admin dashboard feed). */
function typeHue(act: ActivityEntry): string {
  // Verification splits by side of the workflow: request (amber) vs admin
  // decision (emerald approved / red declined).
  if (act.type === "verification") {
    if (act.code === CODE_REQUEST) return "bg-amber-400";
    if (act.code === CODE_VERIFIED) return "bg-emerald-500";
    if (act.code === CODE_DECLINED) return "bg-red-500";
    return "bg-violet-500"; // legacy / uncoded verification rows
  }
  // Booking lifecycle — same colors as the booking funnel buckets, so the
  // history page and the funnel card tell one story.
  if (act.type === "booking") {
    if (act.code === CODE_BOOKING_REQUESTED) return "bg-amber-400";
    if (act.code === CODE_BOOKING_CONFIRMED) return "bg-emerald-500";
    if (act.code === CODE_BOOKING_CANCELLED) return "bg-red-500";
    return "bg-sky-500"; // legacy / uncoded booking rows
  }
  switch (act.type) {
    case "payment":
      return "bg-emerald-500";
    case "company":
      return "bg-sky-500";
    case "review":
      return "bg-amber-500";
    case "worker":
      return "bg-brand-500";
    default:
      return "bg-ink-400";
  }
}

export function ActivityHistoryManager({ initial }: { initial: ActivityPage }) {
  const { locale, t } = useLocale();
  const [data, setData] = useState<ActivityPage>(initial);
  const [page, setPage] = useState(1);
  const [actor, setActor] = useState("");
  const [type, setType] = useState<ActivityTypeFilterValue>("");
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  async function load(nextPage: number, nextActor: string, nextType: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(PAGE_SIZE) });
      if (nextActor.trim()) params.set("actor", nextActor.trim());
      if (nextType) params.set("type", nextType);
      const res = await fetch(`/api/admin/activity?${params.toString()}`);
      if (!res.ok) return;
      const json = (await res.json()) as ActivityPage;
      setData(json);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    void load(1, actor, type);
  }

  /** Chips apply immediately (the Apply button now covers the actor search). */
  function onTypeChange(v: ActivityTypeFilterValue) {
    setType(v);
    void load(1, actor, v);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-400">
              <Search className="size-3" /> {t("admin.activityHistoryActor")}
            </label>
            <Input
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder={t("admin.activityHistoryActorPlaceholder")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-400">
              <Filter className="size-3" /> {t("admin.activityHistoryType")}
            </label>
            <ActivityTypeChips value={type} onChange={onTypeChange} />
          </div>
          <Button onClick={applyFilters} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Filter className="size-4" />}
            {t("admin.activityHistoryApply")}
          </Button>
        </CardContent>
      </Card>

      {/* Result count */}
      <p className="text-sm text-ink-500 dark:text-ink-400">
        {t("admin.activityHistoryCount", { total: data.total })}
      </p>

      {/* Table */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-start text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
                  <th className="px-6 py-3 text-start font-semibold">{t("admin.activityHistoryEvent")}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t("admin.activityHistoryCode")}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t("admin.activityHistoryActor")}</th>
                  <th className="px-4 py-3 text-start font-semibold">{t("admin.activityHistoryType")}</th>
                  <th className="px-6 py-3 text-end font-semibold">{t("admin.activityHistoryWhen")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-14 text-center text-sm text-ink-400">
                      {t("admin.activityHistoryEmpty")}
                    </td>
                  </tr>
                )}
                {data.items.map((act, i) => (
                  <motion.tr
                    key={act.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-start gap-3">
                        <span className={`mt-1.5 size-2 shrink-0 rounded-full ${typeHue(act)}`} />
                        <p className="font-medium text-ink-800 dark:text-ink-100">
                          {act.bookingNo ? (
                            <Link
                              href={`/admin/bookings/${act.bookingNo}`}
                              className="text-brand-600 transition-colors hover:underline dark:text-brand-400"
                              title={`${locale === "ar" ? act.actionAr : act.actionEn} (${act.bookingNo})`}
                            >
                              {locale === "ar" ? act.actionAr : act.actionEn}
                            </Link>
                          ) : (
                            (locale === "ar" ? act.actionAr : act.actionEn)
                          )}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="font-mono text-[11px]">{act.code ?? act.type.toUpperCase()}</Badge>
                    </td>
                    <td className="px-4 py-3.5">
                      {act.actorUser ? (
                        <div
                          className="relative flex w-fit max-w-[240px] items-center gap-2.5 rounded-full py-0.5 pe-3 ps-1 transition-colors hover:bg-ink-100/70 dark:hover:bg-ink-800/60"
                          title={`${act.actor} · ${act.actorUser.email}`}
                        >
                          <GradientAvatar name={act.actor} hue={act.actorUser.hue} className="size-7" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-800 dark:text-ink-100">
                              {act.actor}
                            </p>
                            <p className="truncate text-[11px] text-ink-400" dir="ltr">
                              {act.actorUser.email}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <Badge variant="outline" className="font-mono text-xs">{act.actor}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="text-xs">{t(`admin.activityType.${act.type}`)}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-end text-ink-500 dark:text-ink-400">{timeAgo(act.time, locale)}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-400">
          {t("admin.activityHistoryPage")} {page} / {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void load(page - 1, actor, type)}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" /> {t("admin.activityHistoryPrev")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => void load(page + 1, actor, type)}
          >
            {t("admin.activityHistoryNext")} <ChevronRight className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
