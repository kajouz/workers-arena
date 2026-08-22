"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Users, Mail, Download, Upload, CheckCircle, AlertTriangle, Trash2, Send } from "lucide-react";

interface BulkAction { id: string; name: string; description: string; icon: React.ElementType; category: string; lastRun?: string; }

export function BulkOperations() {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const actions: BulkAction[] = [
    { id: "bulk-approve-workers", name: "Approve Workers", description: "Bulk approve pending worker verifications", icon: CheckCircle, category: "Workers", lastRun: "2025-01-15T10:00:00Z" },
    { id: "bulk-send-email", name: "Send Bulk Email", description: "Send email to selected users", icon: Mail, category: "Communication" },
    { id: "bulk-export", name: "Export Data", description: "Export selected data to CSV/Excel", icon: Download, category: "Data" },
    { id: "bulk-import", name: "Import Data", description: "Import workers or customers from CSV", icon: Upload, category: "Data" },
    { id: "bulk-deactivate", name: "Deactivate Users", description: "Bulk deactivate inactive accounts", icon: Trash2, category: "Users" },
    { id: "bulk-notify", name: "Send Push Notification", description: "Send push notification to selected users", icon: Send, category: "Communication" },
  ];

  const categories = [...new Set(actions.map((a) => a.category))];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Bulk Operations</h3>
      {categories.map((cat) => (
        <div key={cat}>
          <p className="text-sm font-medium text-gray-500 mb-3">{cat}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {actions.filter((a) => a.category === cat).map((action) => { const Icon = action.icon; return (
              <button key={action.id} onClick={() => setSelectedAction(selectedAction === action.id ? null : action.id)} className={cn("text-left p-4 rounded-xl border-2 transition-all", selectedAction === action.id ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300")}>
                <div className="flex items-center gap-3"><div className="p-2 bg-gray-100 rounded-lg"><Icon className="w-5 h-5 text-gray-600" /></div><div><p className="font-medium text-gray-900">{action.name}</p><p className="text-sm text-gray-500">{action.description}</p></div></div>
              </button>
            ); })}
          </div>
        </div>
      ))}
      {selectedAction && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="font-medium text-gray-900 mb-4">Configure: {actions.find((a) => a.id === selectedAction)?.name}</p>
          <p className="text-sm text-gray-500">Select items and configure options for this bulk operation.</p>
        </div>
      )}
    </div>
  );
}
