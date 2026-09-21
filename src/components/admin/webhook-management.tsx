"use client";

import { useState } from "react";
import { cn, formatDateTime } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { Webhook, Plus, Trash2, CheckCircle, XCircle, RefreshCw, ExternalLink, Clock } from "lucide-react";

interface WebhookEndpoint { id: string; url: string; events: string[]; status: "active" | "inactive"; lastTriggered?: string; successRate: number; secret: string; }

export function WebhookManagement() {
  const { locale } = useLocale();
  const [webhooks] = useState<WebhookEndpoint[]>([
    { id: "1", url: "https://api.example.com/webhooks/payments", events: ["payment.completed", "payment.refunded"], status: "active", lastTriggered: "2025-01-17T10:00:00Z", successRate: 99.5, secret: "whsec_••••••••" },
    { id: "2", url: "https://slack.com/api/webhook/ABC123", events: ["booking.created", "booking.completed"], status: "active", lastTriggered: "2025-01-17T09:30:00Z", successRate: 100, secret: "whsec_••••••••" },
    { id: "3", url: "https://hooks.zapier.com/hooks/catch/123", events: ["worker.verified"], status: "inactive", successRate: 85, secret: "whsec_••••••••" },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Webhook Endpoints</h3><button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> Add Webhook</button></div>
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
        <table className="w-full"><thead className="bg-ink-50 dark:bg-ink-950"><tr><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">URL</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Events</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Success Rate</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Last Triggered</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Actions</th></tr></thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">{webhooks.map((wh) => (<tr key={wh.id} className="hover:bg-ink-50 dark:hover:bg-ink-950"><td className="px-4 py-4"><p className="font-mono text-sm text-ink-900 dark:text-ink-50 truncate max-w-xs">{wh.url}</p></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{wh.events.map((e) => <span key={e} className="px-2 py-0.5 text-xs bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 rounded">{e}</span>)}</div></td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", wh.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" : "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100")}>{wh.status}</span></td><td className="px-4 py-4"><span className={cn("font-medium", wh.successRate > 95 ? "text-green-600" : "text-yellow-600")}>{wh.successRate}%</span></td><td className="px-4 py-4 text-sm text-ink-500 dark:text-ink-400">{wh.lastTriggered ? formatDateTime(wh.lastTriggered, locale) : "Never"}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><button className="text-blue-600 hover:text-blue-700"><RefreshCw className="w-4 h-4" /></button><button className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></div></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
