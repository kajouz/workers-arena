"use client";

/**
 * §5/§6 — the /admin fee-rules panel (docs/fee-rules.md): edit the platform's
 * take-rate rules and publish them as a new VERSION.
 *
 * Design rules this panel follows:
 *  • Money is entered in major units and percentages; the action converts to
 *    minor units / basis points. Admins never type bps.
 *  • The per-tier money preview is computed with the SAME pure engine the
 *    adapters use (computeFee), so what an admin sees on a sample $80 job is
 *    exactly what a worker would be charged under that rule.
 *  • Publishing never rewrites history: each save is a new version, and the
 *    recent snapshots list below shows fees stamped under older versions.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Check, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { saveFeeRulesAction, type FeeRuleRow, type FeeRulesPayload } from "@/app/actions/fee-rules";
import {
  FEE_LADDER_PRESET,
  FEE_PLAN_TIERS,
  computeFee,
  mergeFeeRule,
  type FeePlanTier,
  type FeeRule,
  type FeeRuleSet,
  type PlatformFeeSnapshot,
} from "@/lib/data/fee-rules";

/** The sample job the preview prices (minor units) — a typical small job. */
const SAMPLE_MINOR = 8_000; // $80

/**
 * Exact money for the pricing editor, from minor units. Deliberately NOT
 * `formatPrice`: that formatter rounds to whole dollars (the app's display
 * convention), which would render a $5.60 fee as "$6" — useless when the admin
 * is choosing the rate. A pricing screen must show cents.
 */
function money(minor: number): string {
  return `$${(minor / 100).toFixed(2)}`;
}

type Draft = { label: string } & FeeRulesPayload;

function rowFromRule(rule: FeeRule): FeeRuleRow {
  return {
    ratePct: rule.rateBps / 100,
    min: rule.minMinor / 100,
    max: (rule.maxMinor ?? 0) / 100,
    fixed: rule.fixedMinor / 100,
    exempt: rule.exempt,
  };
}

/** The tier's EFFECTIVE rule today (defaults merged with its override) — the
 * starting point of every tier row, so an admin sees the real numbers. */
function effectiveTierRule(ruleSet: FeeRuleSet, tier: FeePlanTier): FeeRule {
  return mergeFeeRule(ruleSet.defaults, ruleSet.planTiers[tier]);
}

/** Draft row → an engine rule, for the preview (mirrors the action's units). */
function ruleFromRow(row: FeeRuleRow): FeeRule {
  return {
    rateBps: Math.round(row.ratePct * 100),
    minMinor: Math.round(row.min * 100),
    maxMinor: Math.round(row.max * 100),
    fixedMinor: Math.round(row.fixed * 100),
    exempt: row.exempt,
  };
}

function draftFrom(ruleSet: FeeRuleSet): Draft {
  const planTiers: Record<string, FeeRuleRow> = {};
  for (const tier of FEE_PLAN_TIERS) planTiers[tier] = rowFromRule(effectiveTierRule(ruleSet, tier));
  return {
    label: ruleSet.label ?? "",
    defaults: rowFromRule(ruleSet.defaults),
    planTiers,
  };
}

export function FeeRulesPanel({
  ruleSet,
  versions,
  snapshots,
}: {
  ruleSet: FeeRuleSet;
  versions: FeeRuleSet[];
  snapshots: PlatformFeeSnapshot[];
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(ruleSet));
  const [busy, setBusy] = useState(false);

  const setDefault = (patch: Partial<FeeRuleRow>) =>
    setDraft((d) => ({ ...d, defaults: { ...d.defaults, ...patch } }));
  const setTier = (tier: FeePlanTier, patch: Partial<FeeRuleRow>) =>
    setDraft((d) => ({ ...d, planTiers: { ...d.planTiers, [tier]: { ...d.planTiers[tier], ...patch } } }));

  const applyPreset = () => {
    // The §5 ladder (12/9/7/5/4%) keeps the submitted floor/cap/fixed and
    // only re-rates the tiers — an admin can adopt it, tweak it, then publish.
    setDraft((d) => {
      const planTiers: Record<string, FeeRuleRow> = { ...d.planTiers };
      const base = ruleFromRow(d.defaults);
      for (const tier of FEE_PLAN_TIERS) {
        planTiers[tier] = rowFromRule(mergeFeeRule(base, FEE_LADDER_PRESET[tier]));
      }
      return { ...d, planTiers };
    });
    toast("success", t("feeRules.presetApplied"));
  };

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const res = await saveFeeRulesAction({
      label: draft.label,
      defaults: draft.defaults,
      planTiers: draft.planTiers,
    });
    setBusy(false);
    if (res.ok) {
      toast("success", t("feeRules.saved").replace("{version}", String(res.version ?? ruleSet.version + 1)));
      router.refresh();
    } else {
      toast("error", res.error === "unauthorized" ? t("feeRules.unauthorized") : t("feeRules.error"));
    }
  };

  const preview = useMemo(() => {
    const rows = FEE_PLAN_TIERS.map((tier) => {
      const rule = ruleFromRow(draft.planTiers[tier] ?? draft.defaults);
      const fee = computeFee(SAMPLE_MINOR, rule);
      return { tier, rule, fee };
    });
    return rows;
  }, [draft]);


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgePercent className="size-4 shrink-0 text-brand-500" />
            {t("feeRules.title")}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {t("feeRules.versionLabel").replace("{version}", String(ruleSet.version))}
            </Badge>
            <Button size="sm" variant="outline" onClick={applyPreset} disabled={busy}>
              <RotateCcw className="size-3.5" /> {t("feeRules.applyPreset")}
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              <Check className="size-3.5" /> {t("feeRules.save")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-xs leading-relaxed text-ink-400">{t("feeRules.subtitle")}</p>

          {/* Baseline rule */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {t("feeRules.defaultsTitle")}
            </p>
            <RuleRowInputs row={draft.defaults} onChange={setDefault} labels={t} />
          </div>

          {/* Per-tier overrides */}
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {t("feeRules.tiersTitle")}
            </p>
            <div className="space-y-3">
              {FEE_PLAN_TIERS.map((tier) => (
                <div key={tier} className="rounded-xl border border-ink-100 p-3 dark:border-ink-800">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-ink-900 dark:text-ink-50">{t(`feeRules.tier.${tier}`)}</p>
                    <p className="text-[11px] text-ink-400">
                      {t("feeRules.previewOn")
                        .replace("{amount}", money(SAMPLE_MINOR))
                        .replace(
                          "{fee}",
                          preview.find((p) => p.tier === tier)?.fee.exempt
                            ? t("feeRules.previewWaived")
                            : money(preview.find((p) => p.tier === tier)?.fee.feeMinor ?? 0)
                        )
                        .replace(
                          "{net}",
                          money(SAMPLE_MINOR - (preview.find((p) => p.tier === tier)?.fee.feeMinor ?? 0))
                        )}
                    </p>
                  </div>
                  <RuleRowInputs row={draft.planTiers[tier]} onChange={(patch) => setTier(tier, patch)} labels={t} />
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-400">{t("feeRules.historyNote")}</p>
        </CardContent>
      </Card>

      {/* Versions + snapshots — the audit trail */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("feeRules.versionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {versions.slice(0, 5).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-ink-50 px-4 py-2.5 text-xs dark:bg-ink-800"
              >
                <span className="font-mono font-bold text-ink-900 dark:text-ink-50">v{v.version}</span>
                <span className="min-w-0 flex-1 truncate text-ink-500 dark:text-ink-400">{v.label ?? "—"}</span>
                <span className="shrink-0 text-ink-400">{v.defaults.rateBps / 100}%</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("feeRules.snapshotsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {snapshots.length === 0 ? (
              <p className="py-3 text-center text-sm text-ink-400">{t("feeRules.snapshotsEmpty")}</p>
            ) : (
              snapshots.slice(0, 6).map((s) => (
                <div key={s.id} className="rounded-xl bg-ink-50 px-4 py-2.5 text-xs dark:bg-ink-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-ink-900 dark:text-ink-50">{money(s.feeMinor)}</span>
                    <span className="flex items-center gap-1.5 text-ink-400">
                      <Badge variant="secondary">{t(`feeRules.tier.${s.planTier}`)}</Badge>
                      <span className="font-mono">
                        {s.rateBps / 100}% · v{s.ruleVersion}
                      </span>
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {t("feeRules.snapshotLine")
                      .replace("{quote}", money(s.subtotalMinor))
                      .replace("{net}", money(s.netMinor))
                      .replace("{date}", s.computedAt.slice(0, 10))}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** The five numeric inputs + waive switch of one rule (shared by the baseline
 * row and every tier row). */
function RuleRowInputs({
  row,
  onChange,
  labels,
}: {
  row: FeeRuleRow;
  onChange: (patch: Partial<FeeRuleRow>) => void;
  labels: (key: string) => string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Field label={labels("feeRules.rate")}>
        <Input
          inputMode="decimal"
          value={String(row.ratePct)}
          onChange={(e) => onChange({ ratePct: Number(e.target.value) })}
        />
      </Field>
      <Field label={labels("feeRules.min")}>
        <Input inputMode="decimal" value={String(row.min)} onChange={(e) => onChange({ min: Number(e.target.value) })} />
      </Field>
      <Field label={labels("feeRules.max")}>
        <Input inputMode="decimal" value={String(row.max)} onChange={(e) => onChange({ max: Number(e.target.value) })} />
      </Field>
      <Field label={labels("feeRules.fixed")}>
        <Input
          inputMode="decimal"
          value={String(row.fixed)}
          onChange={(e) => onChange({ fixed: Number(e.target.value) })}
        />
      </Field>
      <Field label={labels("feeRules.waive")}>
        <div className="flex h-9 items-center">
          <Switch checked={row.exempt} onCheckedChange={(v: boolean) => onChange({ exempt: v })} />
        </div>
      </Field>
    </div>
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
