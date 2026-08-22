"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Search, Filter, AlertTriangle, AlertCircle, Info, Bug, Download, RefreshCw, Trash2 } from "lucide-react";

interface LogEntry { id: string; timestamp: string; level: "error" | "warn" | "info" | "debug"; source: string; message: string; details?: string; }

export function SystemLogs() {
  const [logs] = useState<LogEntry[]>([
    { id: "1", timestamp: "2025-01-17T10:30:00Z", level: "error", source: "api/workers", message: "Database connection timeout", details: "Connection to Neon PostgreSQL timed out after 5000ms" },
    { id: "2", timestamp: "2025-01-17T10:25:00Z", level: "warn", source: "cron/backup", message: "Backup taking longer than expected", details: "Current backup duration: 450s (threshold: 300s)" },
    { id: "3", timestamp: "2025-01-17T10:20:00Z", level: "info", source: "auth", message: "User login successful", details: "User: ahmad@example.com, IP: 192.168.1.100" },
    { id: "4", timestamp: "2025-01-17T10:15:00Z", level: "error", source: "email", message: "Failed to send email", details: "SendGrid API rate limit exceeded" },
    { id: "5", timestamp: "2025-01-17T10:10:00Z", level: "info", source: "booking", message: "Booking created", details: "Booking BK-1005 created by customer c4" },
    { id: "6", timestamp: "2025-01-17T10:05:00Z", level: "debug", source: "search", message: "Search query executed", details: "Query: 'plumber', Results: 12, Duration: 45ms" },
  ]);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLogs = logs.filter((l) => {
    const matchesLevel = filterLevel === "all" || l.level === filterLevel;
    const matchesSearch = l.message.toLowerCase().includes(searchQuery.toLowerCase()) || l.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const levelColors: Record<string, string> = { error: "bg-red-100 text-red-800", warn: "bg-yellow-100 text-yellow-800", info: "bg-blue-100 text-blue-800", debug: "bg-gray-100 text-gray-800" };
  const levelIcons: Record<string, React.ElementType> = { error: AlertCircle, warn: AlertTriangle, info: Info, debug: Bug };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input type="text" placeholder="Search logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg" /></div>
        <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="px-4 py-2 border border-gray-200 rounded-lg"><option value="all">All Levels</option><option value="error">Error</option><option value="warn">Warning</option><option value="info">Info</option><option value="debug">Debug</option></select>
        <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50"><Download className="w-4 h-4" /> Export</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50"><p className="text-sm font-medium text-gray-600">{filteredLogs.length} log entries</p></div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {filteredLogs.map((log) => { const Icon = levelIcons[log.level]; return (
            <div key={log.id} className="p-4 hover:bg-gray-50"><div className="flex items-start gap-3"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", levelColors[log.level])}><Icon className="w-3 h-3 inline mr-1" />{log.level}</span><div className="flex-1"><div className="flex items-center gap-2"><span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</span><span className="text-xs font-mono text-gray-400">{log.source}</span></div><p className="text-sm text-gray-900 mt-1">{log.message}</p>{log.details && <p className="text-xs text-gray-500 mt-1">{log.details}</p>}</div></div></div>
          ); })}
        </div>
      </div>
    </div>
  );
}
