"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Clock, Plus, Calendar, AlertTriangle, CheckCircle, Trash2, Edit, Bell } from "lucide-react";

interface MaintenanceWindow { id: string; title: string; description: string; scheduledAt: string; duration: number; status: "scheduled" | "in_progress" | "completed" | "cancelled"; notifyUsers: boolean; }

export function ScheduledMaintenance() {
  const [windows] = useState<MaintenanceWindow[]>([
    { id: "1", title: "Database Migration", description: "Migrate to new Neon schema", scheduledAt: "2025-01-20T02:00:00Z", duration: 60, status: "scheduled", notifyUsers: true },
    { id: "2", title: "SSL Certificate Renewal", description: "Auto-renew SSL certificates", scheduledAt: "2025-01-25T00:00:00Z", duration: 15, status: "scheduled", notifyUsers: false },
    { id: "3", title: "Cache Clear", description: "Clear all caches for performance", scheduledAt: "2025-01-15T03:00:00Z", duration: 5, status: "completed", notifyUsers: false },
  ]);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const statusColors: Record<string, string> = { scheduled: "bg-blue-100 text-blue-800", in_progress: "bg-yellow-100 text-yellow-800", completed: "bg-green-100 text-green-800", cancelled: "bg-gray-100 text-gray-800" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Scheduled Maintenance</h3>
        <button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> Schedule Maintenance</button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full"><thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Title</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Scheduled</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Duration</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Notify Users</th><th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th></tr></thead>
          <tbody className="divide-y divide-gray-200">{windows.map((w) => (<tr key={w.id} className="hover:bg-gray-50"><td className="px-4 py-4"><p className="font-medium text-gray-900">{w.title}</p><p className="text-sm text-gray-500">{w.description}</p></td><td className="px-4 py-4 text-sm text-gray-600">{new Date(w.scheduledAt).toLocaleString()}</td><td className="px-4 py-4 text-sm text-gray-600">{w.duration} min</td><td className="px-4 py-4"><span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[w.status])}>{w.status.replace(/_/g, " ")}</span></td><td className="px-4 py-4">{w.notifyUsers ? <Bell className="w-4 h-4 text-blue-600" /> : <span className="text-gray-400">—</span>}</td><td className="px-4 py-4"><div className="flex gap-2"><button className="text-gray-400 hover:text-gray-600"><Edit className="w-4 h-4" /></button><button className="text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></div></td></tr>))}</tbody>
        </table>
      </div>
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div className="bg-white rounded-xl p-6 w-full max-w-md"><h3 className="text-lg font-semibold mb-4">Schedule Maintenance</h3><div className="space-y-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label><input type="text" className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg" rows={3} /></div><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label><input type="datetime-local" className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label><input type="number" className="w-full px-3 py-2 border border-gray-200 rounded-lg" /></div></div><div className="flex justify-end gap-2"><button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancel</button><button onClick={() => { setShowCreateModal(false); alert("Maintenance scheduled"); }} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Schedule</button></div></div></div></div>
      )}
    </div>
  );
}
