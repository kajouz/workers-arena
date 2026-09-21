"use client";

import { useState } from "react";
import { cn, formatDateTime } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { Database, Download, Upload, CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";

interface Backup { id: string; name: string; size: string; createdAt: string; status: "completed" | "in_progress" | "failed"; type: "automatic" | "manual"; }

export function BackupManagement() {
  const { locale } = useLocale();
  const [backups] = useState<Backup[]>([
    { id: "1", name: "backup-2025-01-17-0200", size: "245 MB", createdAt: "2025-01-17T02:00:00Z", status: "completed", type: "automatic" },
    { id: "2", name: "backup-2025-01-16-0200", size: "242 MB", createdAt: "2025-01-16T02:00:00Z", status: "completed", type: "automatic" },
    { id: "3", name: "manual-backup-pre-deploy", size: "240 MB", createdAt: "2025-01-15T18:00:00Z", status: "completed", type: "manual" },
    { id: "4", name: "backup-2025-01-15-0200", size: "238 MB", createdAt: "2025-01-15T02:00:00Z", status: "completed", type: "automatic" },
  ]);

  const statusColors: Record<string, string> = { completed: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300", in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300", failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Database Backups</h3>
        <div className="flex gap-2">
          <button onClick={() => alert("Backup started")} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Database className="w-4 h-4" /> Create Backup</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{backups.length}</p><p className="text-sm text-ink-500 dark:text-ink-400">Total Backups</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-green-600">{backups.filter((b) => b.status === "completed").length}</p><p className="text-sm text-ink-500 dark:text-ink-400">Completed</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-ink-900 dark:text-ink-50">30 days</p><p className="text-sm text-ink-500 dark:text-ink-400">Retention</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-ink-900 dark:text-ink-50">245 MB</p><p className="text-sm text-ink-500 dark:text-ink-400">Latest Size</p></div>
      </div>
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
        <table className="w-full"><thead className="bg-ink-50 dark:bg-ink-950"><tr><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Backup</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Size</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Type</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Created</th><th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Actions</th></tr></thead>
          <tbody className="divide-y divide-ink-200 dark:divide-ink-800">{backups.map((backup) => (<tr key={backup.id} className="hover:bg-ink-50 dark:hover:bg-ink-950"><td className="px-4 py-4 font-mono text-sm text-ink-900 dark:text-ink-50">{backup.name}</td><td className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">{backup.size}</td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", backup.type === "automatic" ? "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" : "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300")}>{backup.type}</span></td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[backup.status])}>{backup.status}</span></td><td className="px-4 py-4 text-sm text-ink-500 dark:text-ink-400">{formatDateTime(backup.createdAt, locale)}</td><td className="px-4 py-4"><button className="text-blue-600 hover:text-blue-700"><Download className="w-4 h-4" /></button></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
