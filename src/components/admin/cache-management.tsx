"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Database, RefreshCw, Trash2, HardDrive, Clock, CheckCircle } from "lucide-react";

interface CacheEntry { name: string; type: string; size: string; entries: number; lastCleared: string; hitRate: number; }

export function CacheManagement() {
  const [caches] = useState<CacheEntry[]>([
    { name: "Workers Cache", type: "memory", size: "2.4 MB", entries: 156, lastCleared: "2025-01-17T08:00:00Z", hitRate: 94.2 },
    { name: "Categories Cache", type: "memory", size: "128 KB", entries: 21, lastCleared: "2025-01-17T06:00:00Z", hitRate: 99.1 },
    { name: "Search Index", type: "memory", size: "1.2 MB", entries: 1247, lastCleared: "2025-01-16T22:00:00Z", hitRate: 87.5 },
    { name: "Session Store", type: "redis", size: "5.8 MB", entries: 342, lastCleared: "Never", hitRate: 99.8 },
    { name: "Rate Limiter", type: "redis", size: "892 KB", entries: 89, lastCleared: "2025-01-17T10:00:00Z", hitRate: 100 },
  ]);

  const handleClearCache = (name: string) => { if (confirm(`Clear ${name}?`)) alert(`${name} cleared`); };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-gray-900">{caches.length}</p><p className="text-sm text-gray-500">Cache Stores</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-gray-900">{caches.reduce((s, c) => s + c.entries, 0).toLocaleString()}</p><p className="text-sm text-gray-500">Total Entries</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-200"><p className="text-2xl font-bold text-green-600">{(caches.reduce((s, c) => s + c.hitRate, 0) / caches.length).toFixed(1)}%</p><p className="text-sm text-gray-500">Avg Hit Rate</p></div>
        <div className="bg-white rounded-xl p-4 border border-gray-200"><button onClick={() => alert("All caches cleared")} className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"><Trash2 className="w-4 h-4" /> Clear All</button></div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full"><thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Cache</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Size</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Entries</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Hit Rate</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Last Cleared</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-200">{caches.map((cache) => (<tr key={cache.name} className="hover:bg-gray-50"><td className="px-4 py-4 font-medium text-gray-900">{cache.name}</td><td className="px-4 py-4"><span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">{cache.type}</span></td><td className="px-4 py-4 text-sm text-gray-600">{cache.size}</td><td className="px-4 py-4 text-sm text-gray-600">{cache.entries}</td><td className="px-4 py-4"><span className={cn("font-medium", cache.hitRate > 90 ? "text-green-600" : cache.hitRate > 70 ? "text-yellow-600" : "text-red-600")}>{cache.hitRate}%</span></td><td className="px-4 py-4 text-sm text-gray-500">{new Date(cache.lastCleared).toLocaleString()}</td><td className="px-4 py-4"><button onClick={() => handleClearCache(cache.name)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></button></td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
