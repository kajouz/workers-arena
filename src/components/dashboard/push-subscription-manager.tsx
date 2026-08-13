"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, MonitorSmartphone, Send, Sparkles, Trash2 } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { toast } from "@/components/ui/toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/avatar";
import { timeAgo } from "@/lib/utils";
import type { PushSubscriptionRecord } from "@/lib/notifications/push-store";

function ownerLabel(r: PushSubscriptionRecord): string {
  return r.userId ?? r.ownerId ?? "—";
}

export function PushSubscriptionManager({ initial }: { initial: PushSubscriptionRecord[] }) {
  const { locale, t } = useLocale();
  const [items, setItems] = useState<PushSubscriptionRecord[]>(initial);
  const [busy, setBusy] = useState(false);
  const [pruning, setPruning] = useState(false);
  // Endpoint currently sending a test notification (per-row spinner).
  const [testing, setTesting] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/push-subscriptions");
    if (!res.ok) return;
    const { items: next } = (await res.json()) as { items: PushSubscriptionRecord[] };
    setItems(next);
  }

  async function remove(endpoint: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", endpoint }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        toast("success", t("admin.pushSubsRemoved"), endpoint.slice(0, 48) + "…");
        await refresh();
      } else {
        toast("error", t("admin.pushSubsRemoveFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  async function prune() {
    setPruning(true);
    try {
      const res = await fetch("/api/admin/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prune" }),
      });
      const data = (await res.json()) as { pruned?: string[]; kept?: number };
      const pruned = data.pruned?.length ?? 0;
      const kept = data.kept ?? 0;
      toast(
        pruned > 0 ? "success" : "info",
        t("admin.pushSubsPruneDone"),
        t("admin.pushSubsPruneResult", { pruned, kept })
      );
      await refresh();
    } finally {
      setPruning(false);
    }
  }

  async function testSend(endpoint: string) {
    setTesting(endpoint);
    try {
      const res = await fetch("/api/admin/push-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-send", endpoint }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; pruned?: boolean };
      if (!res.ok) {
        // 403 / server error — surface without the raw internal message.
        toast("error", t("admin.pushSubsTestFailed"), data.error);
      } else if (data.ok) {
        toast("success", t("admin.pushSubsTestSent"), endpoint.slice(0, 48) + "…");
      } else if (data.error === "endpoint-dead" && data.pruned) {
        toast("error", t("admin.pushSubsTestDead"), endpoint.slice(0, 48) + "…");
        await refresh(); // the dead endpoint was pruned server-side
      } else if (data.error === "vapid-unconfigured") {
        toast("error", t("admin.pushSubsTestUnconfigured"));
      } else {
        toast("error", t("admin.pushSubsTestFailed"), data.error);
      }
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500 dark:text-ink-400">{t("admin.pushSubsHint")}</p>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1.5">
            {items.length} {t("admin.pushSubsEndpoints")}
          </Badge>
          <Button onClick={() => void prune()} disabled={pruning || items.length === 0}>
            {pruning ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t("admin.pushSubsPrune")}
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <MonitorSmartphone className="size-10 text-ink-300 dark:text-ink-600" />
            <p className="font-bold text-ink-900 dark:text-ink-50">{t("admin.pushSubsEmpty")}</p>
            <p className="text-sm text-ink-400">{t("admin.pushSubsEmptyBody")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-start text-xs uppercase tracking-wider text-ink-400 dark:border-ink-800">
                    <th className="px-6 py-3 text-start font-semibold">{t("admin.pushSubsDevice")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t("admin.pushSubsOwner")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t("admin.pushSubsEndpoint")}</th>
                    <th className="px-4 py-3 text-start font-semibold">{t("admin.pushSubsLastActive")}</th>
                    <th className="px-6 py-3 text-end font-semibold">{t("admin.action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => (
                    <motion.tr
                      key={r.endpoint}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-ink-50 transition-colors hover:bg-ink-50/60 dark:border-ink-800/60 dark:hover:bg-ink-800/40"
                    >
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <GradientAvatar name={r.device ?? ownerLabel(r)} hue={210} className="size-9" />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink-900 dark:text-ink-50">{r.device ?? "—"}</p>
                            <p className="text-xs text-ink-400">{t("admin.pushSubsRegistered")} {timeAgo(r.registeredAt, locale)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant="outline" className="font-mono text-xs">{ownerLabel(r)}</Badge>
                      </td>
                      <td className="max-w-[220px] px-4 py-3.5">
                        <p className="truncate font-mono text-xs text-ink-500 dark:text-ink-400" title={r.endpoint}>
                          {r.endpoint}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-ink-500 dark:text-ink-400">{timeAgo(r.lastActiveAt, locale)}</td>
                      <td className="px-6 py-3.5 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy || testing !== null}
                            onClick={() => void testSend(r.endpoint)}
                            title={t("admin.pushSubsTest")}
                            className="text-sky-500 hover:bg-sky-500/10 hover:text-sky-600 dark:text-sky-400"
                          >
                            {testing === r.endpoint ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                            <span className="ms-1 hidden sm:inline">{t("admin.pushSubsTest")}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy || testing !== null}
                            onClick={() => void remove(r.endpoint)}
                            className="text-red-500 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="size-4" />
                            <span className="ms-1 hidden sm:inline">{t("admin.pushSubsRemove")}</span>
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
