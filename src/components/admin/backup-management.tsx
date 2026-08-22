"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Database, Download, Upload, CheckCircle, Clock, AlertTriangle, RefreshCw } from "lucide-react";

interface Backup { id: string; name: string; size: string; createdAt: string; status: "completed" | "in_progress" | "failed"; type: "automatic" | "manual"; }

export function BackupManagement() {
  const [backups] = useState<Backup[]>([
    { id: "1", name: "backup-2025-01-17-0200", size: "245 MB", createdAt: "2025-01-17T02:00:00Z", status: "completed", type: "automatic" },
    { id: "2", name: "backup-2025-01-16-0200", size: "242 MB", createdAt: "2025-01-16T02:00:00Z", status: "completed", type: "automatic" },
    { id: "3", name: "manual-backup-pre-deploy", size: "240 MB", createdAt: "2025-01-15T18:00:00Z", status: "completed", type: "manual" },
    { id: "4", name: "backup-2025-01-15-0200", size: "238 MB", createdAt: "2025-01-15T02:00:00Z", status: "completed", type: "automatic" },
  ]);

  const statusColors: Record<string, string> = { completed: "bg-green-100 text-green-800", in_progress: "bg-yellow-100 text-yellow-800", failed: "bg-red-100 text-red-800" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Database Backups</h3>
        <div className="flex gap-2">
          <button onClick={() => alert("Backup started")} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Database className="w-4 h-4" /> Create Backup</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-gray-900">{backups.length}</p><p className="text-sm text-gray-500">Total Backups</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-green-600">{backups.filter((b) => b.status === "completed").length}</p><p className="text-sm text-gray-500">Completed</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-gray-900">30 days</p><p className="text-sm text-gray-500">Retention</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-gray-900">245 MB</p><p className="text-sm text-gray-500">Latest Size</p></div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full"><thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Backup</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Size</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Created</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-200">{backups.map((backup) => (<tr key={backup.id} className="hover:bg-gray-50"><td className="px-4 py-4 font-mono text-sm text-gray-900">{backup.name}</td><td className="px-4 py-4 text-sm text-gray-600">{backup.size}</td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", backup.type === "automatic" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800")}>{backup.type}</span></td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[backup.status])}>{backup.status}</span></td><td className="px-4 py-4 text-sm text-gray-500">{new Date(backup.createdAt).toLocaleString()}</td><td className="px-4 py-4"><button className="text-blue-600 hover:text-blue-700"><Download className="w-4 h-4" /></button></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
