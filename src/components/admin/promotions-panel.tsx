"use client";

/**
 * §24 — the /admin promotions panel (docs/fee-rules.md → promotions).
 *
 * Edit the platform's promotion campaigns and publish them as a new fee-rule
 * VERSION. A campaign can:
 *   • re-rate the take rate for a window (optionally scoped to a plan tier, a
 *     category, and/or a code, and optionally waiving the fee entirely)
 *   • grant platform credits to a worker who buys a plan inside the window
 *
 * Two things this panel refuses to fake:
 *  1. The rate/floor/cap fields feed the SAME engine the adapters price with,
 *     so a campaign's economics are exactly what a quote will be charged.
 *  2. "Priced X quotes" is read from the immutable fee snapshots (the
 *     `promotionId` they recorded) — never a counter that can drift.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Check, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { saveFeePromotionsAction } from "@/app/actions/fee-rules";
import {
  FEE_PLAN_TIERS,
  computeFee,
  type FeePlanTier,
  type FeePromotion,
  type FeeRuleSet,
  type PlatformFeeSnapshot,
} from "@/lib/data/fee-rules";
import type { CreditLedgerEntry } from "@/lib/data/credit-ledger";
import type { PromotionAttribution } from "@/lib/data/fee-rules-store";

/** The sample job the per-campaign preview prices (minor units). */
const SAMPLE_MINOR = 8_000; // $80

function money(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

/** A campaign on the page: the engine shape, edited in % / major units. */
interface PromoDraft {
  id: string;
  label: string;
  enabled: boolean;
  ratePct: number;
  min: number;
  max: number;
  fixed: number;
  exempt: boolean;
  bonusCredits: number;
  code: string;
  planTier: "" | FeePlanTier;
  categorySlug: string;
  startsAt: string;
  endsAt: string;
}

function ymd(iso?: string): string {
  if (!iso) return "";
  return Number.isFinite(Date.parse(iso)) ? iso.slice(0, 10) : "";
}

/** A campaign on the page. Unset fields fall back to the PLATFORM's current
 * rule so the admin sees — and keeps — the real floor/cap: a campaign that
 * only re-rates must not silently drop the $5 floor by sending an explicit 0. */
function toDraft(promo: FeePromotion, ruleSet: FeeRuleSet): PromoDraft {
  return {
    id: promo.id,
    label: promo.label,
    enabled: promo.enabled !== false,
    ratePct: promo.rateBps / 100,
    min: (promo.minMinor ?? ruleSet.defaults.minMinor) / 100,
    max: ((promo.maxMinor !== undefined ? promo.maxMinor : ruleSet.defaults.maxMinor) ?? 0) / 100,
    fixed: (promo.fixedMinor ?? ruleSet.defaults.fixedMinor) / 100,
    exempt: Boolean(promo.exempt),
    bonusCredits: promo.bonusCredits ?? 0,
    code: promo.promoCode ?? "",
    planTier: promo.planTier ?? "",
    categorySlug: promo.categorySlug ?? "",
    startsAt: ymd(promo.startsAt),
    endsAt: ymd(promo.endsAt),
  };
}

/** The draft in engine units, with the fields the admin left blank omitted
 * (an empty date is an open-ended bound, not the epoch; an empty scope means
 * "any"). A blank max means uncapped — the same convention the engine uses. */
function toPromotion(draft: PromoDraft): FeePromotion {
  return {
    id: draft.id,
    label: draft.label.trim(),
    rateBps: Math.round(draft.ratePct * 100),
    minMinor: Math.round(draft.min * 100),
    maxMinor: draft.max > 0 ? Math.round(draft.max * 100) : null,
    fixedMinor: Math.round(draft.fixed * 100),
    exempt: draft.exempt,
    bonusCredits: Math.max(0, Math.trunc(draft.bonusCredits)),
    ...(draft.code.trim() ? { promoCode: draft.code.trim() } : {}),
    ...(draft.planTier ? { planTier: draft.planTier } : {}),
    ...(draft.categorySlug ? { categorySlug: draft.categorySlug } : {}),
    ...(draft.startsAt ? { startsAt: new Date(`${draft.startsAt}T00:00:00.000Z`).toISOString() } : {}),
    ...(draft.endsAt ? { endsAt: new Date(`${draft.endsAt}T23:59:59.000Z`).toISOString() } : {}),
    ...(draft.enabled ? {} : { enabled: false }),
  };
}

/** A campaign previewed against the sample job (and the current live rule for
 * the fields the campaign does not set), so the admin sees its economics
 * before publishing. */
function previewFor(draft: PromoDraft, ruleSet: FeeRuleSet) {
  const promo = toPromotion(draft);
  const rule = {
    rateBps: promo.rateBps,
    minMinor: promo.minMinor ?? ruleSet.defaults.minMinor,
    maxMinor: promo.maxMinor !== undefined ? promo.maxMinor : ruleSet.defaults.maxMinor,
    fixedMinor: promo.fixedMinor ?? ruleSet.defaults.fixedMinor,
    exempt: Boolean(promo.exempt),
  };
  return computeFee(SAMPLE_MINOR, rule);
}

export function PromotionsPanel({
  ruleSet,
  attribution,
  snapshots,
  grants,
  categories,
}: {
  ruleSet: FeeRuleSet;
  attribution: PromotionAttribution[];
  snapshots: PlatformFeeSnapshot[];
  grants: CreditLedgerEntry[];
  categories: { slug: string; nameEn: string }[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [drafts, setDrafts] = useState<PromoDraft[]>(() => ruleSet.promotions.map((p) => toDraft(p, ruleSet)));
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<PromoDraft>) =>
    setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const add = () =>
    setDrafts((rows) => [
      ...rows,
      {
        id: `promo-${Date.now().toString(36)}`,
        label: "",
        enabled: true,
        ratePct: ruleSet.defaults.rateBps / 100,
        min: ruleSet.defaults.minMinor / 100,
        max: (ruleSet.defaults.maxMinor ?? 0) / 100,
        fixed: ruleSet.defaults.fixedMinor / 100,
        exempt: false,
        bonusCredits: 0,
        code: "",
        planTier: "",
        categorySlug: "",
        startsAt: "",
        endsAt: "",
      },
    ]);

  const remove = (index: number) => setDrafts((rows) => rows.filter((_, i) => i !== index));

  const save = async () => {
    if (busy) return;
    if (drafts.some((d) => !d.label.trim())) {
      toast("error", t("promotions.labelRequired"));
      return;
    }
    setBusy(true);
    const res = await saveFeePromotionsAction(drafts.map(toPromotion));
    setBusy(false);
    if (res.ok) {
      toast("success", t("promotions.saved").replace("{version}", String(res.version ?? ruleSet.version + 1)));
      router.refresh();
    } else {
      toast("error", res.error === "unauthorized" ? t("feeRules.unauthorized") : t("promotions.error"));
    }
  };

  const attributionById = useMemo(() => {
    const map = new Map<string, PromotionAttribution>();
    for (const row of attribution) map.set(row.promotionId, row);
    return map;
  }, [attribution]);

  const grantsById = useMemo(() => {
    const map = new Map<string, { count: number; credits: number }>();
    for (const grant of grants) {
      if (!grant.promotionId) continue;
      const row = map.get(grant.promotionId) ?? { count: 0, credits: 0 };
      row.count += 1;
      row.credits += grant.amount;
      map.set(grant.promotionId, row);
    }
    return map;
  }, [grants]);

  const quotedSnapshots = snapshots.filter((s) => s.promotionId).slice(0, 5);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BadgePercent className="size-4 shrink-0 text-brand-500" />
          {t("promotions.title")}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={add} disabled={busy}>
            <Plus className="size-3.5" /> {t("promotions.add")}
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Check className="size-3.5" /> {t("promotions.save")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-400">{t("promotions.subtitle")}</p>

        {drafts.length === 0 && <p className="py-3 text-center text-sm text-ink-400">{t("promotions.empty")}</p>}

        {drafts.map((draft, index) => {
          const preview = previewFor(draft, ruleSet);
          const stats = attributionById.get(draft.id);
          const granted = grantsById.get(draft.id);
          return (
            <div key={draft.id} className="rounded-xl border border-ink-100 p-3 dark:border-ink-800">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-[12rem] flex-1"
                  placeholder={t("promotions.labelPlaceholder")}
                  value={draft.label}
                  onChange={(e) => update(index, { label: e.target.value })}
                />
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-ink-500 dark:text-ink-400">
                  <Switch checked={draft.enabled} onCheckedChange={(v: boolean) => update(index, { enabled: v })} />
                  {draft.enabled ? t("promotions.enabled") : t("promotions.paused")}
                </label>
                <Button size="sm" variant="ghost" onClick={() => remove(index)} aria-label={t("promotions.remove")}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Field label={t("promotions.rate")}>
                  <Input inputMode="decimal" value={String(draft.ratePct)} onChange={(e) => update(index, { ratePct: Number(e.target.value) })} />
                </Field>
                <Field label={t("promotions.min")}>
                  <Input inputMode="decimal" value={String(draft.min)} onChange={(e) => update(index, { min: Number(e.target.value) })} />
                </Field>
                <Field label={t("promotions.max")}>
                  <Input inputMode="decimal" value={String(draft.max)} onChange={(e) => update(index, { max: Number(e.target.value) })} />
                </Field>
                <Field label={t("promotions.fixed")}>
                  <Input inputMode="decimal" value={String(draft.fixed)} onChange={(e) => update(index, { fixed: Number(e.target.value) })} />
                </Field>
                <Field label={t("promotions.window")}>
                  <div className="flex items-center gap-1.5">
                    <Input type="date" value={draft.startsAt} onChange={(e) => update(index, { startsAt: e.target.value })} />
                    <Input type="date" value={draft.endsAt} onChange={(e) => update(index, { endsAt: e.target.value })} />
                  </div>
                </Field>
                <Field label={t("promotions.plan")}>
                  <select
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                    value={draft.planTier}
                    onChange={(e) => update(index, { planTier: e.target.value as "" | FeePlanTier })}
                  >
                    <option value="">{t("promotions.anyPlan")}</option>
                    {FEE_PLAN_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {t(`feeRules.tier.${tier}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("promotions.category")}>
                  <select
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                    value={draft.categorySlug}
                    onChange={(e) => update(index, { categorySlug: e.target.value })}
                  >
                    <option value="">{t("promotions.anyCategory")}</option>
                    {categories.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.nameEn}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("promotions.code")}>
                  <Input placeholder={t("promotions.codePlaceholder")} value={draft.code} onChange={(e) => update(index, { code: e.target.value })} />
                </Field>
                <Field label={t("promotions.bonus")}>
                  <Input inputMode="numeric" value={String(draft.bonusCredits)} onChange={(e) => update(index, { bonusCredits: Number(e.target.value) })} />
                </Field>
                <Field label={t("promotions.waive")}>
                  <div className="flex h-10 items-center">
                    <Switch checked={draft.exempt} onCheckedChange={(v: boolean) => update(index, { exempt: v })} />
                  </div>
                </Field>
              </div>

              <p className="mt-2 text-[11px] text-ink-400">
                {t("promotions.preview")
                  .replace("{amount}", money(SAMPLE_MINOR))
                  .replace("{fee}", preview.exempt ? t("feeRules.previewWaived") : money(preview.feeMinor))
                  .replace("{net}", money(SAMPLE_MINOR - preview.feeMinor))}
              </p>
              {(stats || granted) && (
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-400">
                  {stats && (
                    <Badge variant="secondary">
                      {t("promotions.pricedBadge")
                        .replace("{count}", String(stats.count))
                        .replace("{fee}", money(stats.feeMinor))
                        .replace("{gmv}", money(stats.gmvMinor))}
                    </Badge>
                  )}
                  {granted && (
                    <Badge variant="secondary">
                      {t("promotions.grantedBadge").replace("{credits}", String(granted.credits)).replace("{workers}", String(granted.count))}
                    </Badge>
                  )}
                </p>
              )}
            </div>
          );
        })}

        <p className="text-[11px] leading-relaxed text-ink-400">{t("promotions.hint")}</p>

        {/* Which quotes each campaign actually priced (snapshot attribution). */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {t("promotions.quotesTitle")}
            </p>
            {quotedSnapshots.length === 0 ? (
              <p className="py-2 text-xs text-ink-400">{t("promotions.quotesEmpty")}</p>
            ) : (
              <div className="space-y-1.5">
                {quotedSnapshots.map((s) => (
                  <div key={s.id} className="rounded-xl bg-ink-50 px-3 py-2 text-[11px] dark:bg-ink-800">
                    <span className="font-bold text-ink-900 dark:text-ink-50">{money(s.feeMinor)}</span>
                    <span className="text-ink-400">
                      {" · "}
                      {t("promotions.quoteLine")
                        .replace("{quote}", money(s.subtotalMinor))
                        .replace("{rate}", String(s.rateBps / 100))
                        .replace("{date}", s.computedAt.slice(0, 10))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {t("promotions.grantsTitle")}
            </p>
            {grants.length === 0 ? (
              <p className="py-2 text-xs text-ink-400">{t("promotions.grantsEmpty")}</p>
            ) : (
              <div className="space-y-1.5">
                {grants.slice(0, 5).map((g) => (
                  <div key={g.id} className="rounded-xl bg-ink-50 px-3 py-2 text-[11px] dark:bg-ink-800">
                    <span className="font-bold text-ink-900 dark:text-ink-50">
                      +{g.amount} {t("promotions.credits")}
                    </span>
                    <span className="text-ink-400">
                      {" · "}
                      {g.reason} · {g.createdAt.slice(0, 10)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </label>
  );
}
