"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Webhook, Plus, Trash2, CheckCircle, XCircle, RefreshCw, ExternalLink, Clock } from "lucide-react";

interface WebhookEndpoint { id: string; url: string; events: string[]; status: "active" | "inactive"; lastTriggered?: string; successRate: number; secret: string; }

export function WebhookManagement() {
  const [webhooks] = useState<WebhookEndpoint[]>([
    { id: "1", url: "https://api.example.com/webhooks/payments", events: ["payment.completed", "payment.refunded"], status: "active", lastTriggered: "2025-01-17T10:00:00Z", successRate: 99.5, secret: "whsec_••••••••" },
    { id: "2", url: "https://slack.com/api/webhook/ABC123", events: ["booking.created", "booking.completed"], status: "active", lastTriggered: "2025-01-17T09:30:00Z", successRate: 100, secret: "whsec_••••••••" },
    { id: "3", url: "https://hooks.zapier.com/hooks/catch/123", events: ["worker.verified"], status: "inactive", successRate: 85, secret: "whsec_••••••••" },
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Webhook Endpoints</h3><button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> Add Webhook</button></div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full"><thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">URL</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Events</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Success Rate</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Last Triggered</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-200">{webhooks.map((wh) => (<tr key={wh.id} className="hover:bg-gray-50"><td className="px-4 py-4"><p className="font-mono text-sm text-gray-900 truncate max-w-xs">{wh.url}</p></td><td className="px-4 py-4"><div className="flex flex-wrap gap-1">{wh.events.map((e) => <span key={e} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">{e}</span>)}</div></td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", wh.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800")}>{wh.status}</span></td><td className="px-4 py-4"><span className={cn("font-medium", wh.successRate > 95 ? "text-green-600" : "text-yellow-600")}>{wh.successRate}%</span></td><td className="px-4 py-4 text-sm text-gray-500">{wh.lastTriggered ? new Date(wh.lastTriggered).toLocaleString() : "Never"}</td><td className="px-4 py-4"><div className="flex items-center gap-2"><button className="text-blue-600 hover:text-blue-700"><RefreshCw className="w-4 h-4" /></button><button className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></div></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
