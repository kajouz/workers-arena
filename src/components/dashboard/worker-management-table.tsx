"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldCheck, Search, ArrowUpRight, Download, ChevronDown } from "lucide-react";
import type { SubscriptionPlan, Worker } from "@/lib/data/types";
import { isPlanFeeExempt } from "@/lib/data/booking-ui";
import { categoryBySlug } from "@/lib/data/categories";
import { PLANS } from "@/lib/data/subscriptions";
import { changeWorkerPlanAction } from "@/app/actions/business";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GradientAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Admin worker audit (docs/booking-take-rate.md): every worker with their
 * subscription plan and status, plus a fee-waived filter — so admins can
 * compare which Enterprise (fee-waived) subscriptions are live in the DB
 * against the ones the /search filter surfaces. Pure client-side over the
 * workers passed by the admin page (getAllWorkers — stamped by both adapters).
 */
export function WorkerManagementTable({
  workers,
  init,
}: {
  workers: Worker[];
  /** URL-persisted audit state (admin page parses ?wm=&sort=&feeWaived=) —
   * used as initial values only; changes sync back via router.replace so the
   * audit view is shareable and survives reloads. */
  init?: { query?: string; sort?: "name" | "planAsc" | "planDesc"; feeWaivedOnly?: boolean };
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [feeWaivedOnly, setFeeWaivedOnly] = useState(init?.feeWaivedOnly ?? false);
  const [query, setQuery] = useState(init?.query ?? "");
  const [sort, setSort] = useState<"name" | "planAsc" | "planDesc">(init?.sort ?? "planAsc");
  /** Row currently applying a plan change (the select locks while in flight). */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Pending plan change awaiting the Apply confirmation — choosing a tier in
   * the select only STAGES it; the server action fires on Apply, so an
   * accidental select change can't alter a subscription instantly. */
  const [pending, setPending] = useState<{ worker: Worker; plan: SubscriptionPlan } | null>(null);
  /** The Apply button — focused on dialog open so Enter commits and the flow
   * is keyboard-first (the primary action gets focus by default). */
  const applyRef = useRef<HTMLButtonElement>(null);

  /** Mirror the audit state into the URL — /admin?wm=…&sort=…&feeWaived=1 —
   * omitting defaults so the cleanest possible URL encodes the view. */
  const syncUrl = (q: string, s: typeof sort, f: boolean) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("wm", q.trim());
    if (s !== "planAsc") p.set("sort", s);
    if (f) p.set("feeWaived", "1");
    const qs = p.toString();
    router.replace(`/admin${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const updateQuery = (v: string) => {
    setQuery(v);
    syncUrl(v, sort, feeWaivedOnly);
  };
  const updateSort = (v: typeof sort) => {
    setSort(v);
    syncUrl(query, v, feeWaivedOnly);
  };
  const updateFeeWaived = (v: boolean) => {
    setFeeWaivedOnly(v);
    syncUrl(query, sort, v);
  };

  /** Inline plan correction — fire the admin action for the CONFIRMED pending
   * change, toast, refresh so the badge/audit chips/status reflect the new
   * tier. Only reachable via the confirm dialog's Apply button. */
  const applyPlanChange = async () => {
    if (!pending || busyId) return;
    const { worker, plan } = pending;
    setBusyId(worker.id);
    setPending(null);
    const res = await changeWorkerPlanAction(worker.id, plan);
    setBusyId(null);
    if (res.ok) {
      toast("success", t("admin.planChanged"));
      router.refresh();
    } else {
      toast("error", t("common.noResults"));
    }
  };

  const feeWaivedCount = workers.filter((w) => isPlanFeeExempt(w.subscription.plan)).length;

  // Name/category search + plan-tier sort, mirroring the /search UX — the
  // query matches both locales (the active locale's name + the category), so
  // searching in either language finds the row.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameOf = (w: Worker) => (locale === "ar" ? w.nameAr : w.nameEn).toLowerCase();
    const catOf = (w: Worker) => {
      const cat = categoryBySlug(w.categorySlug);
      const name = cat ? (locale === "ar" ? cat.nameAr : cat.nameEn) : w.categorySlug;
      return name.toLowerCase();
    };
    const PLAN_RANK: Record<string, number> = { basic: 0, professional: 1, premium: 2, enterprise: 3 };
    return workers
      .filter((w) => !feeWaivedOnly || isPlanFeeExempt(w.subscription.plan))
      .filter((w) => {
        if (!q) return true;
        return (
          nameOf(w).includes(q) ||
          catOf(w).includes(q) ||
          w.citySlug.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sort === "name") return nameOf(a).localeCompare(nameOf(b));
        const ra = PLAN_RANK[a.subscription.plan] ?? 0;
        const rb = PLAN_RANK[b.subscription.plan] ?? 0;
        return sort === "planDesc" ? rb - ra : ra - rb;
      });
  }, [workers, feeWaivedOnly, query, sort, locale]);

  // Enterprise audit at a glance — live (fee-waived AND searchable) vs expired
  // (fee-waived but hidden from public search until renewed). Counts run over
  // ALL workers, not the filtered view, so the audit never shrinks with it.
  const enterpriseLive = workers.filter(
    (w) => isPlanFeeExempt(w.subscription.plan) && w.subscription.status === "active"
  ).length;
  const enterpriseExpired = workers.filter(
    (w) => isPlanFeeExempt(w.subscription.plan) && w.subscription.status === "expired"
  ).length;

  const statusMeta: Record<string, { labelKey: string; cls: string; dot: string }> = {
    active: { labelKey: "dashboard.planStatus", cls: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
    expiring: { labelKey: "admin.expiring", cls: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
    expired: { labelKey: "subscription.expired", cls: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  };
  const statusOf = (w: Worker) => statusMeta[w.subscription.status] ?? statusMeta.active!;

  /** CSV of the CURRENT filtered/sorted view — the same rows the table shows
   * (name + city, category, plan, status — localized like the table), escaped
   * per RFC 4180 and downloaded as a fresh file, so the offline audit always
   * matches what the admin is looking at. */
  const exportCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const catOf = (w: Worker) => {
      const cat = categoryBySlug(w.categorySlug);
      return cat ? (locale === "ar" ? cat.nameAr : cat.nameEn) : w.categorySlug;
    };
    const nameOf = (w: Worker) => (locale === "ar" ? w.nameAr : w.nameEn);
    const header = [t("admin.name"), t("search.city"), t("search.category"), t("admin.plan"), t("admin.status")];
    const rows = visible.map((w) => [
      nameOf(w),
      w.citySlug,
      catOf(w),
      t(`plans.${w.subscription.plan}`),
      t(statusOf(w).labelKey),
    ]);
    const csv = [header, ...rows].map((r) => r.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worker-management-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const planBadge = (plan: string) => {
    const exempt = isPlanFeeExempt(plan);
    const tone: Record<string, string> = {
      basic: "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300",
      professional: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
      premium: "bg-brand-500/10 text-brand-700 dark:text-brand-400",
    };
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
          exempt
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            : tone[plan] ?? "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
        )}
      >
        {exempt && <ShieldCheck className="size-3" />}
        {t(`plans.${plan}`)}
      </span>
    );
  };

  return (
    <div>
      {/* Enterprise audit chips — hidden when a state has no rows so the card
          reads cleanly for platforms without an Enterprise tier. */}
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        {enterpriseLive > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="size-3" />
            {enterpriseLive} {t("admin.enterpriseLive")}
          </span>
        )}
        {enterpriseExpired > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400">
            <ShieldCheck className="size-3" />
            {enterpriseExpired} {t("admin.enterpriseExpired")}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <Input
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder={t("admin.searchPlaceholder")}
            aria-label={t("admin.searchPlaceholder")}
            className="h-9 ps-9"
          />
        </div>
        <Select value={sort} onValueChange={(v) => updateSort(v as typeof sort)}>
          <SelectTrigger className="h-9 w-auto gap-2 text-xs" aria-label={t("search.sortBy")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">{t("admin.sortName")}</SelectItem>
            <SelectItem value="planAsc">{t("admin.sortPlanAsc")}</SelectItem>
            <SelectItem value="planDesc">{t("admin.sortPlanDesc")}</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-600 dark:text-ink-300">
          <Switch checked={feeWaivedOnly} onCheckedChange={updateFeeWaived} />
          {t("search.feeWaived")}
        </label>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 px-3 text-xs font-bold text-ink-600 transition-colors hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800"
          title={`${t("admin.exportCsv")} (${visible.length})`}
        >
          <Download className="size-3.5" />
          {t("admin.exportCsv")}
        </button>
      </div>
      <p className="px-6 pb-2 text-xs font-semibold text-ink-500 dark:text-ink-400">
        {visible.length} {t("search.results")}
        {feeWaivedOnly && (
          <span className="ms-1 font-bold text-emerald-600 dark:text-emerald-400">
            · {feeWaivedCount} {t("worker.feeWaived")}
          </span>
        )}
      </p>

      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-ink-100 text-start text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
              <th className="px-6 py-2.5 text-start font-semibold">{t("common.viewProfile")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("search.category")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("admin.plan")}</th>
              <th className="px-6 py-2.5 text-end font-semibold">{t("admin.status")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((w) => {
              const st = statusOf(w);
              return (
                <tr
                  key={w.id}
                  className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <GradientAvatar name={w.nameEn} hue={w.hue} className="size-9" />
                      <div>
                        <p className="font-bold text-ink-900 dark:text-ink-50">
                          {locale === "ar" ? w.nameAr : w.nameEn}
                        </p>
                        <p className="text-xs text-ink-400">{w.citySlug}</p>
                        {/* M5 audit deep link — jump from the DB row to what the
                            customer sees. Enterprise rows open the fee-waived
                            search (proving the exemption surfaces); other rows
                            open the plain name search (the fee filter would
                            return nothing for them). */}
                        <Link
                          href={`/search?${isPlanFeeExempt(w.subscription.plan) ? "feeWaived=1&" : ""}q=${encodeURIComponent(w.nameEn)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                        >
                          {t("admin.viewSearchResult")}
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-500 dark:text-ink-400">
                    {(() => {
                      const cat = categoryBySlug(w.categorySlug);
                      return locale === "ar" ? (cat?.nameAr ?? w.categorySlug) : (cat?.nameEn ?? w.categorySlug);
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {/* Inline plan change — an invisible select overlaid on the
                        badge (same look, fully accessible); choosing a new tier
                        fires the admin action and refreshes the page. */}
                    <div className="relative inline-flex items-center">
                      {planBadge(w.subscription.plan)}
                      <select
                        aria-label={t("admin.changePlan")}
                        value={w.subscription.plan}
                        disabled={busyId === w.id}
                        onChange={(e) => {
                          const target = e.target.value as SubscriptionPlan;
                          // Stage the change; Apply in the confirm dialog fires it.
                          if (target !== w.subscription.plan) setPending({ worker: w, plan: target });
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
                        title={`${t("admin.changePlan")}: ${t(`plans.${w.subscription.plan}`)}`}
                      >
                        {(Object.keys(PLANS) as SubscriptionPlan[]).map((p) => (
                          <option key={p} value={p}>
                            {t(`plans.${p}`)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute end-1 size-3 text-current opacity-60" />
                    </div>
                  </td>
                  <td className="px-6 py-3">
                    <span className={cn("flex items-center justify-end gap-1.5 text-xs font-bold", st.cls)}>
                      <span className={cn("size-1.5 rounded-full", st.dot)} />
                      {t(st.labelKey)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-ink-400">
                  {t("common.noResults")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Plan-change confirmation — an accidental tier change can't fire
          instantly: the select only stages, this dialog's Apply commits. The
          body interpolates the worker + from → to + price from the same PLANS
          catalog the badges render, so the copy can't drift. */}
      <Dialog
        open={!!pending}
        onOpenChange={(next) => {
          // While the action is in flight the dialog is locked (the X, overlay
          // and Esc all funnel through here — same pattern as the refund dialog).
          if (!busyId && !next) setPending(null);
        }}
      >
        <DialogContent
          // Keyboard-first confirmation: the primary action (Apply) is focused
          // the moment the dialog opens, so Enter commits immediately and Esc
          // (Radix's native close, funnelled through onOpenChange above)
          // cancels — no tabbing required for the happy path.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            applyRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("admin.planChangeConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {pending &&
                t("admin.planChangeConfirmBody")
                  .replaceAll("{name}", locale === "ar" ? pending.worker.nameAr : pending.worker.nameEn)
                  .replaceAll("{from}", t(`plans.${pending.worker.subscription.plan}`))
                  .replaceAll("{to}", t(`plans.${pending.plan}`))
                  .replaceAll("{price}", `$${PLANS[pending.plan].price}`)}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={!!busyId}>
              {t("common.cancel")}
            </Button>
            <Button ref={applyRef} onClick={applyPlanChange} disabled={!!busyId}>
              {busyId ? t("common.loading") : t("common.apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
