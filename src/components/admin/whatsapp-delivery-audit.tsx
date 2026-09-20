"use client";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * WHATSAPP DELIVERY AUDIT — the admin view over the delivery ledger
 * ────────────────────────────────────────────────────────────────────────────
 * Every automated WhatsApp send (lead offers, booking lifecycle, subscription
 * reminders, renewal outreach) lands here with its live Meta status: sent →
 * delivered → read, or failed (with the provider's error and the retry
 * schedule). Failed rows carry a Re-send button — the admin's manual override
 * on top of the bounded automatic retries.
 *
 * Scope note rendered in the empty state: admin-clicked wa.me deep links are
 * hand-offs, not API sends, so they never appear here — this ledger tracks
 * what the PLATFORM itself sent and what Meta confirmed.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, RotateCcw } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { resendWhatsAppDeliveryAction } from "@/app/actions/whatsapp-deliveries";
import type { WhatsAppDelivery, WhatsAppDeliveryKind, WhatsAppDeliveryStatus } from "@/lib/data/whatsapp-deliveries";

const STATUSES: WhatsAppDeliveryStatus[] = ["sent", "delivered", "read", "failed"];

/** Tailwind intent per delivery status (variants that exist on Badge). */
const STATUS_BADGE: Record<WhatsAppDeliveryStatus, { variant: "success" | "secondary" | "outline" | "danger" }> = {
  sent: { variant: "secondary" },
  delivered: { variant: "success" },
  read: { variant: "success" },
  failed: { variant: "danger" },
};

export function WhatsAppDeliveryAudit({
  deliveries,
  stats,
}: {
  deliveries: WhatsAppDelivery[];
  stats: { total: number; byStatus: Record<WhatsAppDeliveryStatus, number>; last24hFailed: number };
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<WhatsAppDeliveryStatus | "all">("all");
  const [kindFilter, setKindFilter] = useState<WhatsAppDeliveryKind | "all">("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (kindFilter !== "all" && d.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        (d.recipientPhone ?? "").toLowerCase().includes(q) ||
        (d.workerId ?? "").toLowerCase().includes(q) ||
        (d.providerMessageId ?? "").toLowerCase().includes(q)
      );
    });
  }, [deliveries, statusFilter, kindFilter, query]);

  const kinds = useMemo(() => {
    const set = new Set<WhatsAppDeliveryKind>(deliveries.map((d) => d.kind));
    return [...set].sort();
  }, [deliveries]);

  const resend = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    const result = await resendWhatsAppDeliveryAction(id);
    setBusyId(null);
    if (result.ok) {
      toast("success", t("whatsappAudit.resentOk"));
      startTransition(() => router.refresh());
    } else if (result.error === "already-delivered") {
      toast("error", t("whatsappAudit.resentAlready"));
    } else {
      toast("error", t("whatsappAudit.resentFail", { error: result.error ?? "" }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <MessageCircle className="h-5 w-5 text-emerald-600" />
          {t("whatsappAudit.title")}
          <Badge variant="outline" className="font-medium tabular-nums">
            {t("whatsappAudit.totalBadge", { total: stats.total })}
          </Badge>
          {stats.last24hFailed > 0 && (
            <Badge variant="danger" className="font-medium tabular-nums">
              {t("whatsappAudit.failed24h", { count: stats.last24hFailed })}
            </Badge>
          )}
        </CardTitle>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{t("whatsappAudit.subtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status chips (also the filter) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter("all")}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              statusFilter === "all" ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
            }`}
          >
            {t("whatsappAudit.filterAll")} · {stats.total}
          </button>
          {STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                statusFilter === status ? "bg-brand-500 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
              }`}
            >
              {t(`whatsappAudit.status.${status}`)} · {stats.byStatus[status]}
            </button>
          ))}
        </div>

        {/* Kind + query filters */}
        {deliveries.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as WhatsAppDeliveryKind | "all")}
              className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs dark:border-ink-700 dark:bg-ink-900"
              aria-label={t("whatsappAudit.kindFilter")}
            >
              <option value="all">{t("whatsappAudit.kindAll")}</option>
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`whatsappAudit.kind.${kind}`)}
                </option>
              ))}
            </select>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("whatsappAudit.searchPlaceholder")}
              className="h-8 w-full max-w-xs text-xs"
            />
          </div>
        )}

        {/* Rows */}
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500 dark:border-ink-700">
            {deliveries.length === 0 ? t("whatsappAudit.empty") : t("whatsappAudit.noMatches")}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.slice(0, 25).map((d) => (
              <li key={d.id} className="rounded-lg border border-ink-100 p-3 dark:border-ink-800">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge {...STATUS_BADGE[d.status]} className="font-medium capitalize">
                    {t(`whatsappAudit.status.${d.status}`)}
                  </Badge>
                  <Badge variant="outline" className="font-medium">
                    {t(`whatsappAudit.kind.${d.kind}`)}
                  </Badge>
                  <span className="flex-1 text-xs text-ink-600 dark:text-ink-300">
                    {d.recipientPhone ?? "—"}
                    {d.workerId ? ` · ${d.workerId}` : ""}
                  </span>
                  <span className="text-[11px] tabular-nums text-ink-400">
                    {t("whatsappAudit.attempts", { count: d.attempts })} · {formatWhen(d, locale)}
                  </span>
                  {d.status === "failed" && (
                    <Button size="sm" variant="outline" disabled={busyId === d.id} onClick={() => resend(d.id)}>
                      <RotateCcw className="h-3 w-3" />
                      {busyId === d.id ? "…" : t("whatsappAudit.resend")}
                    </Button>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-ink-600 dark:text-ink-300" title={d.payload ? String((d.payload as { bodyEn?: string }).bodyEn ?? "") : undefined}>
                  {messagePreview(d)}
                </p>
                {d.lastError && (
                  <p className="mt-1 text-[11px] text-red-600 dark:text-red-400" title={d.lastError}>
                    {d.lastError}
                  </p>
                )}
                {d.nextRetryAt && d.status === "failed" && (
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {t("whatsappAudit.nextRetry", { at: new Date(d.nextRetryAt).toLocaleString(locale === "ar" ? "ar" : "en") })}
                  </p>
                )}
                {d.providerMessageId && (
                  <p className="mt-0.5 font-mono text-[10px] text-ink-300" title={d.providerMessageId}>
                    {d.providerMessageId.slice(0, 28)}…
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-ink-400 dark:text-ink-500">{t("whatsappAudit.scopeNote")}</p>
      </CardContent>
    </Card>
  );
}

function messagePreview(d: WhatsAppDelivery): string {
  const payload = d.payload as { titleEn?: string; bodyEn?: string } | undefined;
  const text = payload?.titleEn ?? payload?.bodyEn ?? d.notificationType;
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}

function formatWhen(d: WhatsAppDelivery, locale: string): string {
  const at = d.deliveredAt ?? d.sentAt ?? d.createdAt;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return at;
  return date.toLocaleString(locale === "ar" ? "ar" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
