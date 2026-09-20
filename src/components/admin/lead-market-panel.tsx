"use client";

/**
 * §7–§10 — the /admin lead-marketplace panel (docs/lead-marketplace.md).
 *
 * Edits the policy that the pure engine resolves every lead against: the price
 * per grade, how many matched workers see a request, the offer window, whether
 * leads are exclusive, what a viewer may see of the customer's contact details,
 * and the matching weights. Publishing appends a NEW rule version (never edits
 * history), so an offer already created keeps the price it was quoted at.
 *
 * The panel's other half is the audit: every offer the marketplace created and
 * every credit the ledger holds, plus the admin adjustment form — the three
 * things that make the marketplace's money inspectable rather than opaque.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Coins, Handshake, MessageCircle, Save, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  LEAD_GRADES,
  DEFAULT_LEAD_MARKET_CONFIG,
  DEFAULT_WHATSAPP_TEMPLATES,
  DEFAULT_EMAIL_TEMPLATES,
  DEFAULT_SMS_TEMPLATES,
  leadMarketConfig,
  type ContactReveal,
  type ContactRevealPolicy,
  type LeadGrade,
  type LeadOffer,
  type MatchingWeights,
  type LeadMarketConfig,
  type WhatsAppTemplates,
  type EmailTemplates,
  type SmsTemplates,
  type NotificationChannelConfig,
} from "@/lib/data/lead-market";
import type { LeadRebate } from "@/lib/data/lead-rebate";
import type { CreditLedgerEntry } from "@/lib/data/credit-ledger";
import type { LeadRefundRequest } from "@/lib/data/lead-refunds";
import type { FeeRuleSet } from "@/lib/data/fee-rules";
import type { SurgeReport } from "@/lib/data/surge-report";
import { suggestEmergencyPriceAdjustment } from "@/lib/data/surge-report";
import { decideLeadRefundAction, grantWorkerCreditsAction, saveLeadMarketConfigAction } from "@/app/actions/leads";
import { sendWhatsAppLeadNotification, sendBatchWhatsAppNotifications } from "@/app/actions/whatsapp-leads";

const WEIGHT_KEYS: Array<keyof MatchingWeights> = [
  "category",
  "area",
  "city",
  "rating",
  "reviews",
  "responseRate",
  "availability",
  "planTier",
  "emergency",
  "verified",
];

const REVEAL_KEYS: Array<keyof ContactRevealPolicy> = [
  "beforePurchase",
  "afterPurchase",
  "afterPurchaseFreeTier",
  "afterBooking",
];

const REVEAL_STATES: ContactReveal[] = ["hidden", "masked", "revealed"];

/** Which i18n label each reveal rule wears. */
const REVEAL_LABEL: Record<keyof ContactRevealPolicy, string> = {
  beforePurchase: "adminRevealBefore",
  afterPurchase: "adminRevealAfter",
  afterPurchaseFreeTier: "adminRevealAfterFree",
  afterBooking: "adminRevealAfterBooking",
};

export function LeadMarketPanel({
  ruleSet,
  offers,
  credits,
  rebates,
  ratings,
  refundRequests,
  surgeReport,
}: {
  ruleSet: FeeRuleSet;
  offers: LeadOffer[];
  credits: CreditLedgerEntry[];
  /** §11 — rebates applied to completed jobs (the audit list + totals). */
  rebates: LeadRebate[];
  /** §12 — worker quality ratings of purchased leads. */
  ratings?: import("@/lib/data/lead-rating").LeadRating[];
  refundRequests?: LeadRefundRequest[];
  /** Phase 2 — the 30-day emergency-surge report; drives the one-click price suggestion. */
  surgeReport?: SurgeReport | null;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<LeadMarketConfig>(() => leadMarketConfig(ruleSet));
  const [templates, setTemplates] = useState<WhatsAppTemplates>(() =>
    draft.whatsappTemplates ?? DEFAULT_WHATSAPP_TEMPLATES
  );
  const [emailTpls, setEmailTpls] = useState<EmailTemplates>(() =>
    draft.emailTemplates ?? DEFAULT_EMAIL_TEMPLATES
  );
  const [smsTpls, setSmsTpls] = useState<SmsTemplates>(() =>
    draft.smsTemplates ?? DEFAULT_SMS_TEMPLATES
  );
  const [notifyChannels, setNotifyChannels] = useState<NotificationChannelConfig>(() =>
    draft.notifyChannels ?? { whatsapp: true, email: true, sms: false }
  );
  const [templateGrade, setTemplateGrade] = useState<LeadGrade>("bronze");
  const [templateLocale, setTemplateLocale] = useState<"en" | "ar">("en");
  const [templateTab, setTemplateTab] = useState<"whatsapp" | "email" | "sms">("whatsapp");
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState({ workerId: "", amount: "10", reason: "" });
  const [granting, setGranting] = useState(false);
  const [refundBusy, setRefundBusy] = useState<string | null>(null);
  const [refundDrafts, setRefundDrafts] = useState<Record<string, { credits: string; note: string }>>({});

  const setPrice = (grade: LeadGrade, value: number) =>
    setDraft((d) => ({ ...d, prices: { ...d.prices, [grade]: value } }));
  const setWeight = (key: keyof MatchingWeights, value: number) =>
    setDraft((d) => ({ ...d, weights: { ...d.weights, [key]: value } }));
  const setReveal = (key: keyof ContactRevealPolicy, value: ContactReveal) =>
    setDraft((d) => ({ ...d, reveal: { ...d.reveal, [key]: value } }));
  const setRebate = (patch: Partial<LeadMarketConfig["rebate"]>) =>
    setDraft((d) => ({ ...d, rebate: { ...d.rebate, ...patch } }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    const res = await saveLeadMarketConfigAction({
      // Spread into plain records: the action validates by KEY and rebuilds the
      // typed shapes, so an unknown grade/weight key can never be stored.
      prices: { ...draft.prices },
      maxWorkersPerLead: draft.maxWorkersPerLead,
      offerTtlMinutes: draft.offerTtlMinutes,
      exclusive: draft.exclusive,
      reveal: draft.reveal,
      weights: { ...draft.weights },
      rebate: draft.rebate,
      whatsappTemplates: {
        en: { ...templates.en },
        ar: { ...templates.ar },
      },
      emailTemplates: {
        en: { ...emailTpls.en },
        ar: { ...emailTpls.ar },
      },
      smsTemplates: {
        en: { ...smsTpls.en },
        ar: { ...smsTpls.ar },
      },
      notifyChannels,
    });
    setBusy(false);
    if (res.ok) {
      toast("success", t("leadMarket.adminSaved", { version: res.version ?? 0 }));
      router.refresh();
      return;
    }
    toast("error", res.error === "unauthorized" ? t("leadMarket.adminUnauthorized") : t("leadMarket.adminError"));
  };

  const submitGrant = async () => {
    if (granting) return;
    setGranting(true);
    const res = await grantWorkerCreditsAction({
      workerId: grant.workerId.trim(),
      amount: Number(grant.amount),
      reason: grant.reason.trim(),
    });
    setGranting(false);
    if (res.ok) {
      toast("success", t("leadMarket.adminGranted"));
      setGrant((g) => ({ ...g, workerId: "", reason: "" }));
      router.refresh();
      return;
    }
    toast("error", t("leadMarket.adminGrantError"));
  };

  // §11 — what the rebate has actually given back so far (money, not credits),
  // read off the append-only rows rather than a running total.
  const rebateTotals = rebates.reduce(
    (sum, r) => ({ count: sum.count + 1, rebateMinor: sum.rebateMinor + r.rebateMinor, feeMinor: sum.feeMinor + r.feeMinor }),
    { count: 0, rebateMinor: 0, feeMinor: 0 }
  );
  const money = (minor: number) => `$${(minor / 100).toFixed(2)}`;

  // The engine's own normalizer clamps the draft for display, so the preview
  // shows what would actually be charged if this policy were published.
  const normalized = leadMarketConfig({ ...ruleSet, leadMarket: draft } as FeeRuleSet);
  const resetDefaults = () => setDraft(DEFAULT_LEAD_MARKET_CONFIG);

  // Phase 2 — when the surge verdict is decisive, offer the matching base
  // price as a one-click prefill of the emergency input (never auto-published;
  // the admin still reviews and saves).
  const applySuggestedEmergencyPrice = (price: number) =>
    setPrice("emergency", price);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            {t("leadMarket.adminTitle")}
          </CardTitle>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.adminSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">v{ruleSet.version}</Badge>
          <Button variant="outline" size="sm" onClick={resetDefaults}>
            {t("leadMarket.adminReset")}
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            <Save className="me-1.5 h-4 w-4" />
            {t("leadMarket.adminSave")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Prices per grade (§7) */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">{t("leadMarket.adminPricesTitle")}</h3>
          <SurgePriceSuggestion
            report={surgeReport ?? null}
            currentPrice={draft.prices.emergency}
            onApply={applySuggestedEmergencyPrice}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {LEAD_GRADES.map((grade) => (
              <label key={grade} className="space-y-1">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t(`leadMarket.grade.${grade}`)}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    value={draft.prices[grade]}
                    onChange={(e) => setPrice(grade, Number(e.target.value))}
                    className="tabular-nums"
                  />
                  <span className="shrink-0 text-xs text-ink-500 dark:text-ink-400">{t("promotions.credits")}</span>
                </div>
                <span className="block text-[11px] text-ink-500 dark:text-ink-400">{t(`leadMarket.gradeHint.${grade}`)}</span>
              </label>
            ))}
          </div>
        </section>

        {/* Distribution & ownership (§9) */}
        <section className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" />
            {t("leadMarket.adminLimitsTitle")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.adminMaxWorkers")}</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={draft.maxWorkersPerLead}
                onChange={(e) => setDraft((d) => ({ ...d, maxWorkersPerLead: Number(e.target.value) }))}
                className="tabular-nums"
              />
              <span className="block text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.adminMaxWorkersHint")}</span>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.adminTtl")}</span>
              <Input
                type="number"
                min={5}
                max={10080}
                value={draft.offerTtlMinutes}
                onChange={(e) => setDraft((d) => ({ ...d, offerTtlMinutes: Number(e.target.value) }))}
                className="tabular-nums"
              />
              <span className="block text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.adminTtlHint")}</span>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.adminExclusive")}</span>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-ink-200 px-3 dark:border-ink-700">
                <input
                  type="checkbox"
                  checked={draft.exclusive}
                  onChange={(e) => setDraft((d) => ({ ...d, exclusive: e.target.checked }))}
                  className="size-4 rounded border-ink-300 text-brand-600"
                />
                <Badge variant={draft.exclusive ? "premium" : "outline"} className="font-medium">
                  {draft.exclusive ? t("leadMarket.exclusiveBadge") : t("leadMarket.sharedBadge")}
                </Badge>
              </div>
              <span className="block text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.adminExclusiveHint")}</span>
            </label>
          </div>
        </section>

        {/* Contact reveal (§10) */}
        <section className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4" />
            {t("leadMarket.adminRevealTitle")}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {REVEAL_KEYS.map((key) => (
              <label key={key} className="space-y-1">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">
                  {t(`leadMarket.${REVEAL_LABEL[key]}`)}
                </span>
                <select
                  className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                  value={draft.reveal[key]}
                  onChange={(e) => setReveal(key, e.target.value as ContactReveal)}
                >
                  {REVEAL_STATES.map((state) => (
                    <option key={state} value={state}>
                      {t(`leadMarket.revealState.${state}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.adminRevealHint")}</p>
        </section>

        {/* Matching weights (§8) */}
        <section className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="text-sm font-semibold">{t("leadMarket.adminWeightsTitle")}</h3>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.adminWeightsHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {WEIGHT_KEYS.map((key) => (
              <label key={key} className="space-y-1">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t(`leadMarket.weight.${key}`)}</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.weights[key]}
                  onChange={(e) => setWeight(key, Number(e.target.value))}
                  className="tabular-nums"
                />
              </label>
            ))}
          </div>
        </section>

        {/* §11 — the lead rebate: what a bought lead gives back when its job
            completes. Bounded by the fee, so the platform never pays out more
            than it earned. */}
        <section className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Coins className="h-4 w-4" />
            {t("leadMarket.adminRebateTitle")}
          </h3>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.adminRebateHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.adminRebateEnabled")}</span>
              <div className="flex h-10 items-center gap-2 rounded-xl border border-ink-200 px-3 dark:border-ink-700">
                <input
                  type="checkbox"
                  checked={draft.rebate.enabled}
                  onChange={(e) => setRebate({ enabled: e.target.checked })}
                  className="size-4 rounded border-ink-300 text-brand-600"
                />
                <span className="text-xs text-ink-500 dark:text-ink-400">
                  {draft.rebate.enabled ? t("leadMarket.rebateOn") : t("leadMarket.rebateOff")}
                </span>
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.adminRebatePct")}</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.rebate.pctBps / 100}
                onChange={(e) => setRebate({ pctBps: Math.round(Number(e.target.value) * 100) })}
                className="tabular-nums"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-ink-600 dark:text-ink-300">{t("leadMarket.adminRebateCeiling")}</span>
              <Input
                type="number"
                min={0}
                value={draft.rebate.maxMinor === null ? "" : draft.rebate.maxMinor / 100}
                placeholder={t("leadMarket.adminRebateNoCeiling")}
                onChange={(e) =>
                  setRebate({ maxMinor: e.target.value.trim() === "" ? null : Math.round(Number(e.target.value) * 100) })
                }
                className="tabular-nums"
              />
            </label>
          </div>

          {/* What it has actually cost the platform so far. */}
          {rebates.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.adminRebatesEmpty")}</p>
          ) : (
            <>
              <p className="text-xs font-medium text-ink-600 dark:text-ink-300">
                {t("leadMarket.adminRebateTotals", {
                  count: rebateTotals.count,
                  rebate: money(rebateTotals.rebateMinor),
                  fee: money(rebateTotals.feeMinor),
                })}
              </p>
              <ul className="space-y-1 text-xs text-ink-600 dark:text-ink-300">
                {rebates.slice(0, 10).map((rebate) => (
                  <li key={rebate.id} className="flex flex-wrap items-center gap-x-2 border-b border-ink-50 pb-1 dark:border-ink-800/60">
                    <Badge variant="success" className="font-medium tabular-nums">
                      −{money(rebate.rebateMinor)}
                    </Badge>
                    <span>
                      {t("leadMarket.adminRebateLine", {
                        lead: rebate.leadId,
                        worker: rebate.workerId,
                        fee: money(rebate.feeMinor),
                        effective: money(rebate.effectiveFeeMinor),
                        limited: t(`leadMarket.rebateLimit.${rebate.limitedBy}`),
                        date: formatDate(rebate.createdAt, locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* §Notification channels + per-grade templates */}
        <section className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle className="h-4 w-4" />
            {t("leadMarket.notificationChannelsTitle")}
          </h3>
          <p className="text-[11px] text-ink-500 dark:text-ink-400">{t("leadMarket.notificationChannelsHint")}</p>

          {/* Channel toggles */}
          <div className="flex flex-wrap gap-3">
            {(["whatsapp", "email", "sms"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 dark:border-ink-700">
                <input
                  type="checkbox"
                  checked={notifyChannels[ch]}
                  onChange={(e) => setNotifyChannels((prev) => ({ ...prev, [ch]: e.target.checked }))}
                  className="size-4 rounded border-ink-300 text-brand-600"
                />
                <span className="text-xs font-medium text-ink-700 dark:text-ink-300 capitalize">{ch}</span>
              </label>
            ))}
          </div>

          {/* Template tabs */}
          <div className="flex gap-1 border-b border-ink-100 dark:border-ink-800">
            {(["whatsapp", "email", "sms"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setTemplateTab(tab)}
                className={`border-b-2 px-3 py-1.5 text-xs font-medium transition ${
                  templateTab === tab
                    ? "border-brand-500 text-brand-600 dark:text-brand-400"
                    : "border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400"
                }`}
              >
                {tab === "whatsapp" ? "WhatsApp" : tab === "email" ? "Email" : "SMS"}
              </button>
            ))}
          </div>

          {/* Grade + locale picker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {LEAD_GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => setTemplateGrade(g)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    templateGrade === g
                      ? "bg-brand-500 text-white"
                      : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
                  }`}
                >
                  {t(`leadMarket.grade.${g}`)}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["en", "ar"] as const).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setTemplateLocale(loc)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                    templateLocale === loc
                      ? "bg-brand-500 text-white"
                      : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
                  }`}
                >
                  {loc.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* WhatsApp template textarea */}
          {templateTab === "whatsapp" && (
            <>
              <textarea
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                rows={10}
                value={templates[templateLocale][templateGrade]}
                onChange={(e) =>
                  setTemplates((prev) => ({
                    ...prev,
                    [templateLocale]: { ...prev[templateLocale], [templateGrade]: e.target.value },
                  }))
                }
              />
              {/* Preview */}
              <div className="rounded-xl border border-ink-200 bg-emerald-50 p-3 dark:border-ink-700 dark:bg-emerald-950/20">
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{t("whatsapp.preview")}</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-emerald-900 dark:text-emerald-200">
                  {templates[templateLocale][templateGrade]
                    .replace(/\{workerName\}/g, "Ahmad")
                    .replace(/\{grade\}/g, templateGrade)
                    .replace(/\{leadNumber\}/g, "QR-2026-00042")
                    .replace(/\{matchScore\}/g, "85")
                    .replace(/\{priceCredits\}/g, "9")
                    .replace(/\{boardUrl\}/g, "https://workers-arena.vercel.app/dashboard/leads")
                    .replace(/\{adminName\}/g, "Admin")
                  }
                </pre>
              </div>
              <button
                onClick={() => setTemplates(DEFAULT_WHATSAPP_TEMPLATES)}
                className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
              >
                {t("whatsapp.resetDefaults")}
              </button>
            </>
          )}

          {/* Email template editor */}
          {templateTab === "email" && (
            <>
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">Subject</span>
                <input
                  type="text"
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                  value={emailTpls[templateLocale][templateGrade].subject}
                  onChange={(e) =>
                    setEmailTpls((prev) => ({
                      ...prev,
                      [templateLocale]: {
                        ...prev[templateLocale],
                        [templateGrade]: { ...prev[templateLocale][templateGrade], subject: e.target.value },
                      },
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-ink-600 dark:text-ink-300">Body</span>
                <textarea
                  className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                  rows={12}
                  value={emailTpls[templateLocale][templateGrade].body}
                  onChange={(e) =>
                    setEmailTpls((prev) => ({
                      ...prev,
                      [templateLocale]: {
                        ...prev[templateLocale],
                        [templateGrade]: { ...prev[templateLocale][templateGrade], body: e.target.value },
                      },
                    }))
                  }
                />
              </label>
              {/* Preview */}
              <div className="rounded-xl border border-ink-200 bg-blue-50 p-3 dark:border-ink-700 dark:bg-blue-950/20">
                <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">Email Preview</p>
                <p className="mt-1 font-mono text-xs font-semibold text-blue-900 dark:text-blue-200">
                  Subject: {emailTpls[templateLocale][templateGrade].subject
                    .replace(/\{workerName\}/g, "Ahmad")
                    .replace(/\{grade\}/g, templateGrade)
                    .replace(/\{leadNumber\}/g, "QR-2026-00042")
                    .replace(/\{matchScore\}/g, "85")
                    .replace(/\{priceCredits\}/g, "9")
                    .replace(/\{boardUrl\}/g, "https://workers-arena.vercel.app/dashboard/leads")
                    .replace(/\{adminName\}/g, "Admin")
                  }
                </p>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-blue-900 dark:text-blue-200">
                  {emailTpls[templateLocale][templateGrade].body
                    .replace(/\{workerName\}/g, "Ahmad")
                    .replace(/\{grade\}/g, templateGrade)
                    .replace(/\{leadNumber\}/g, "QR-2026-00042")
                    .replace(/\{matchScore\}/g, "85")
                    .replace(/\{priceCredits\}/g, "9")
                    .replace(/\{boardUrl\}/g, "https://workers-arena.vercel.app/dashboard/leads")
                    .replace(/\{adminName\}/g, "Admin")
                  }
                </pre>
              </div>
              <button
                onClick={() => setEmailTpls(DEFAULT_EMAIL_TEMPLATES)}
                className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
              >
                {t("whatsapp.resetDefaults")}
              </button>
            </>
          )}

          {/* SMS template editor */}
          {templateTab === "sms" && (
            <>
              <textarea
                className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 font-mono text-xs text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                rows={4}
                value={smsTpls[templateLocale][templateGrade]}
                onChange={(e) =>
                  setSmsTpls((prev) => ({
                    ...prev,
                    [templateLocale]: { ...prev[templateLocale], [templateGrade]: e.target.value },
                  }))
                }
              />
              <p className="text-[11px] text-ink-400">
                {smsTpls[templateLocale][templateGrade].length}/160 characters
              </p>
              {/* Preview */}
              <div className="rounded-xl border border-ink-200 bg-amber-50 p-3 dark:border-ink-700 dark:bg-amber-950/20">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">SMS Preview</p>
                <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-amber-900 dark:text-amber-200">
                  {smsTpls[templateLocale][templateGrade]
                    .replace(/\{workerName\}/g, "Ahmad")
                    .replace(/\{grade\}/g, templateGrade)
                    .replace(/\{leadNumber\}/g, "QR-2026-00042")
                    .replace(/\{matchScore\}/g, "85")
                    .replace(/\{priceCredits\}/g, "9")
                    .replace(/\{boardUrl\}/g, "https://workers-arena.vercel.app/dashboard/leads")
                    .replace(/\{adminName\}/g, "Admin")
                  }
                </pre>
              </div>
              <button
                onClick={() => setSmsTpls(DEFAULT_SMS_TEMPLATES)}
                className="text-xs text-ink-400 hover:text-ink-600 dark:hover:text-ink-300"
              >
                {t("whatsapp.resetDefaults")}
              </button>
            </>
          )}

          {/* Placeholder reference */}
          <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-800/50">
            <p className="text-[11px] font-medium text-ink-600 dark:text-ink-300">{t("whatsapp.placeholders")}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {["{workerName}", "{grade}", "{leadNumber}", "{matchScore}", "{priceCredits}", "{boardUrl}", "{adminName}"].map((p) => (
                <code key={p} className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] text-ink-700 dark:bg-ink-700 dark:text-ink-300">
                  {p}
                </code>
              ))}
            </div>
          </div>
        </section>

        {/* Live offers the marketplace created (audit) */}
        <section className="space-y-2 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="text-sm font-semibold">{t("leadMarket.adminOffersTitle")}</h3>
          {offers.length === 0 ? (
            <p className="text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.adminOffersEmpty")}</p>
          ) : (
            <ul className="space-y-1 text-xs text-ink-600 dark:text-ink-300">
              {offers.slice(0, 12).map((offer) => (
                <li key={offer.id} className="flex flex-wrap items-center gap-x-2 border-b border-ink-50 pb-1 dark:border-ink-800/60">
                  <Badge
                    variant={
                      offer.status === "purchased"
                        ? "success"
                        : offer.status === "offered"
                          ? "default"
                          : "outline"
                    }
                    className="font-medium"
                  >
                    {offer.status}
                  </Badge>
                  <span className="flex-1">
                    {offer.leadNumber} · {t(`leadMarket.grade.${offer.grade}`)} · match {offer.matchScore} ·{" "}
                    {offer.priceCredits} {t("promotions.credits")} · {offer.pricingMultiplier ? `${offer.pricingMultiplier}×` : "1×"} · {offer.pricingReason ?? t("leadMarket.smartPricingBase")} · {formatDate(offer.offeredAt, locale)}
                  </span>
                  {offer.status === "offered" && (
                    <WhatsAppNotifyButton offer={offer} workerName={offer.workerId} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Lead-quality refund queue (Phase 1) */}
        <section className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
          <h3 className="text-sm font-semibold">{t("leadMarket.refundQueueTitle")}</h3>
          {(refundRequests ?? []).length === 0 ? (
            <p className="text-sm text-ink-500">{t("leadMarket.refundQueueEmpty")}</p>
          ) : (
            <ul className="space-y-2 text-xs">
              {(refundRequests ?? []).slice(0, 12).map((request) => {
                const draftRefund = refundDrafts[request.id] ?? { credits: String(request.requestedCredits), note: "" };
                const decide = async (approve: boolean) => {
                  if (refundBusy === request.id) return;
                  setRefundBusy(request.id);
                  const result = await decideLeadRefundAction({
                    requestId: request.id,
                    approve,
                    ...(approve ? { approvedCredits: Math.max(0, Math.trunc(Number(draftRefund.credits))) } : {}),
                    ...(draftRefund.note.trim() ? { adminNote: draftRefund.note.trim() } : {}),
                  });
                  setRefundBusy(null);
                  if (result.ok) router.refresh();
                  else toast("error", t("leadMarket.refundDecisionError"));
                };
                return (
                  <li key={request.id} className="space-y-2 rounded-lg border border-ink-100 p-3 dark:border-ink-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={request.status === "approved" ? "success" : request.status === "rejected" ? "outline" : "default"}>{request.status}</Badge>
                      <span className="flex-1">{request.id} · {request.workerId} · {request.reason} · {request.requestedCredits} credits</span>
                    </div>
                    {request.evidence && <p className="rounded bg-ink-50 p-2 text-ink-600 dark:bg-ink-900 dark:text-ink-300">{request.evidence}</p>}
                    {request.status === "pending" && (
                      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto_auto]">
                        <Input
                          type="number"
                          min={0}
                          max={request.requestedCredits}
                          aria-label={t("leadMarket.refundPartialCredits")}
                          value={draftRefund.credits}
                          onChange={(e) => setRefundDrafts((all) => ({ ...all, [request.id]: { ...draftRefund, credits: e.target.value } }))}
                        />
                        <Input
                          aria-label={t("leadMarket.refundAdminNote")}
                          placeholder={t("leadMarket.refundAdminNote")}
                          value={draftRefund.note}
                          onChange={(e) => setRefundDrafts((all) => ({ ...all, [request.id]: { ...draftRefund, note: e.target.value } }))}
                        />
                        <Button size="sm" disabled={refundBusy === request.id} onClick={() => decide(true)}>{t("leadMarket.refundApprove")}</Button>
                        <Button size="sm" variant="outline" disabled={refundBusy === request.id} onClick={() => decide(false)}>{t("leadMarket.refundReject")}</Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Credit ledger + the admin adjustment form (§20) */}
        <section className="grid gap-4 border-t border-ink-100 pt-4 lg:grid-cols-2 dark:border-ink-800">
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Coins className="h-4 w-4" />
              {t("leadMarket.adminCreditsTitle")}
            </h3>
            {credits.length === 0 ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">{t("leadMarket.adminCreditsEmpty")}</p>
            ) : (
              <ul className="space-y-1 text-xs text-ink-600 dark:text-ink-300">
                {credits.slice(0, 10).map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-2 border-b border-ink-50 pb-1 dark:border-ink-800/60">
                    <span className={entry.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
                      {entry.amount >= 0 ? "+" : ""}
                      {entry.amount}
                    </span>
                    <span>
                      {entry.workerId} · {entry.reason} · {formatDate(entry.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">{t("leadMarket.adminGrantTitle")}</h3>
            <div className="grid gap-2">
              <Input
                placeholder={t("leadMarket.adminGrantWorker")}
                value={grant.workerId}
                onChange={(e) => setGrant((g) => ({ ...g, workerId: e.target.value }))}
              />
              <Input
                type="number"
                placeholder={t("leadMarket.adminGrantAmount")}
                value={grant.amount}
                onChange={(e) => setGrant((g) => ({ ...g, amount: e.target.value }))}
                className="tabular-nums"
              />
              <Input
                placeholder={t("leadMarket.adminGrantReason")}
                value={grant.reason}
                onChange={(e) => setGrant((g) => ({ ...g, reason: e.target.value }))}
              />
              <Button
                size="sm"
                disabled={granting || !grant.workerId.trim() || !grant.reason.trim()}
                onClick={submitGrant}
              >
                {t("leadMarket.adminGrantButton")}
              </Button>
            </div>
          </div>
        </section>

        {/* §12 — Lead quality metrics (worker feedback signal) */}
        {ratings && ratings.length > 0 && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink-700 dark:text-ink-300">Lead Quality Metrics</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(["bronze", "silver", "gold", "emergency"] as const).map((grade) => {
                const gradeRatings = ratings.filter((r) => r.grade === grade);
                const count = gradeRatings.length;
                const avg = count > 0 ? Math.round((gradeRatings.reduce((s, r) => s + r.quality, 0) / count) * 10) / 10 : 0;
                const converted = count > 0 ? Math.round((gradeRatings.filter((r) => r.converted).length / count) * 100) : 0;
                return (
                  <div key={grade} className="rounded-lg border border-ink-100 p-3 text-center dark:border-ink-800">
                    <p className="text-xs font-medium text-ink-500 dark:text-ink-400 capitalize">{grade}</p>
                    <p className="text-lg font-bold tabular-nums">{count > 0 ? `${avg}★` : "—"}</p>
                    <p className="text-[11px] text-ink-400">{count} rated · {converted}% converted</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* What this policy resolves to once the engine's clamps are applied —
            the same numbers a request in flight will actually be distributed
            under, so the admin sees the effect rather than the raw inputs. */}
        <p className="text-[11px] text-ink-500 dark:text-ink-400">
          {t("leadMarket.adminSummary", {
            workers: normalized.maxWorkersPerLead,
            minutes: normalized.offerTtlMinutes,
          })}{" · "}
          {normalized.exclusive ? t("leadMarket.exclusiveBadge") : t("leadMarket.sharedBadge")}
        </p>
      </CardContent>
    </Card>
  );
}

/* ─── WhatsApp per-offer notify button ─── */

function WhatsAppNotifyButton({
  offer,
  workerName,
}: {
  offer: Pick<LeadOffer, "id" | "leadNumber" | "grade" | "priceCredits" | "matchScore" | "workerId">;
  workerName: string;
}) {
  const [busy, setBusy] = useState(false);
  const { t } = useLocale();

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    const res = await sendWhatsAppLeadNotification({
      workerId: offer.workerId,
      offerId: offer.id,
    });
    setBusy(false);
    if (res.ok && res.notifications.length > 0) {
      const link = res.notifications[0];
      window.open(link.url, "_blank", "noopener");
    } else if (!res.ok) {
      toast("error", res.error);
    } else {
      toast("error", "No phone number");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      className="inline-flex items-center gap-1 rounded bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
      title={t("whatsapp.notifyWorker")}
    >
      <MessageCircle className="h-3 w-3" />
      {busy ? "…" : "WA"}
    </button>
  );
}

/**
 * Phase 2 — one-click pricing suggestion under the grade prices.
 *
 * When the 30-day surge verdict is decisive, this pre-fills the emergency
 * price input (never publishes): healthy → try one step up; overpriced →
 * one step down. Everything else stays quiet — the suggestion must never
 * contradict the verdict card just below it on the page.
 */
function SurgePriceSuggestion({
  report,
  currentPrice,
  onApply,
}: {
  report: SurgeReport | null;
  currentPrice: number;
  onApply: (price: number) => void;
}) {
  const { t } = useLocale();
  if (!report) return null;
  const suggestion = suggestEmergencyPriceAdjustment(report.verdict, currentPrice);
  if (!suggestion.apply) return null;

  const reason =
    suggestion.direction === "up"
      ? t("leadMarket.surgeSuggestUpReason", {
          conversion: report.verdict.conversionPct,
          purchases: report.verdict.purchases,
        })
      : t("leadMarket.surgeSuggestDownReason", {
          conversion: report.verdict.conversionPct,
          purchases: report.verdict.purchases,
        });

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-sm dark:border-brand-800 dark:bg-brand-950"
      role="status"
    >
      <Sparkles className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
      <span className="text-ink-700 dark:text-ink-200">
        {suggestion.direction === "up" ? (
          <ArrowUpRight className="me-1 inline h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <ArrowDownRight className="me-1 inline h-3.5 w-3.5 text-amber-600" />
        )}
        {t("leadMarket.surgeSuggestLabel", { price: suggestion.suggestedPrice })} {reason}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onApply(suggestion.suggestedPrice)}
        className="ms-auto"
      >
        {t("leadMarket.surgeSuggestApply", { price: suggestion.suggestedPrice })}
      </Button>
    </div>
  );
}
