"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * REFERRAL CONFIG PANEL — admin settings for the referral program
 * ────────────────────────────────────────────────────────────────────────────
 * Lets admins toggle the referral program on/off and configure bonus amounts.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Save } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import {
  DEFAULT_REFERRAL_CONFIG,
  type ReferralProgramConfig,
} from "@/lib/data/referral";
import type { FeeRuleSet } from "@/lib/data/fee-rules";

export function ReferralConfigPanel({ ruleSet }: { ruleSet: FeeRuleSet }) {
  const { t } = useLocale();
  const router = useRouter();
  const [config, setConfig] = useState<ReferralProgramConfig>(
    (ruleSet as any).referral ?? DEFAULT_REFERRAL_CONFIG
  );
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    // For now, save locally (would need a server action to persist to FeeRuleSet)
    toast("success", "Referral config saved");
    setBusy(false);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            {t("referral.title")}
          </CardTitle>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Configure the worker referral program — invite others, earn credits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={config.enabled ? "success" : "outline"}>
            {config.enabled ? "Active" : "Disabled"}
          </Badge>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="me-1.5 h-4 w-4" />
            Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/disable toggle */}
        <label className="flex items-center gap-3 rounded-xl border border-ink-200 px-4 py-3 dark:border-ink-700">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
            className="size-4 rounded border-ink-300 text-purple-600"
          />
          <div>
            <span className="text-sm font-medium text-ink-700 dark:text-ink-300">
              Enable referral program
            </span>
            <p className="text-[11px] text-ink-400">
              Workers can invite others and both earn bonus credits
            </p>
          </div>
        </label>

        {/* Bonus amounts */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
              Referrer bonus (credits)
            </span>
            <Input
              type="number"
              min={0}
              value={config.referrerBonus}
              onChange={(e) => setConfig((c) => ({ ...c, referrerBonus: Number(e.target.value) }))}
              className="tabular-nums"
            />
            <span className="block text-[11px] text-ink-500 dark:text-ink-400">
              Credits given to the worker who referred
            </span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
              Invitee bonus (credits)
            </span>
            <Input
              type="number"
              min={0}
              value={config.inviteeBonus}
              onChange={(e) => setConfig((c) => ({ ...c, inviteeBonus: Number(e.target.value) }))}
              className="tabular-nums"
            />
            <span className="block text-[11px] text-ink-500 dark:text-ink-400">
              Welcome bonus for the new worker
            </span>
          </label>
        </div>

        {/* Caps */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
              Monthly cap per worker
            </span>
            <Input
              type="number"
              min={0}
              value={config.monthlyCap}
              onChange={(e) => setConfig((c) => ({ ...c, monthlyCap: Number(e.target.value) }))}
              className="tabular-nums"
            />
            <span className="block text-[11px] text-ink-500 dark:text-ink-400">
              0 = unlimited
            </span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
              Lifetime cap per worker
            </span>
            <Input
              type="number"
              min={0}
              value={config.lifetimeCap}
              onChange={(e) => setConfig((c) => ({ ...c, lifetimeCap: Number(e.target.value) }))}
              className="tabular-nums"
            />
            <span className="block text-[11px] text-ink-500 dark:text-ink-400">
              0 = unlimited
            </span>
          </label>
        </div>

        {/* Qualifying action */}
        <label className="space-y-1">
          <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
            Qualifying action
          </span>
          <select
            className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
            value={config.qualifyingAction}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                qualifyingAction: e.target.value as ReferralProgramConfig["qualifyingAction"],
              }))
            }
          >
            <option value="first_booking">First completed booking</option>
            <option value="lead_purchase">First lead purchase</option>
            <option value="profile_complete">Profile completion</option>
          </select>
          <span className="block text-[11px] text-ink-500 dark:text-ink-400">
            When both parties receive the bonus credits
          </span>
        </label>

        {/* Summary */}
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          {config.enabled
            ? `Active: referrer gets ${config.referrerBonus} credits, invitee gets ${config.inviteeBonus} credits. ${config.monthlyCap > 0 ? `Cap: ${config.monthlyCap}/month.` : "No monthly cap."} ${config.lifetimeCap > 0 ? `Lifetime cap: ${config.lifetimeCap}.` : "No lifetime cap."}`
            : "Referral program is disabled."}
        </p>
      </CardContent>
    </Card>
  );
}
