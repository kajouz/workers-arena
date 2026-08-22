"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Mail, Bell, Plus, Edit, Trash2, Eye, Copy } from "lucide-react";

interface Template { id: string; name: string; type: "email" | "push" | "sms"; subject?: string; body: string; lastUpdated: string; }

export function NotificationTemplates() {
  const [templates] = useState<Template[]>([
    { id: "1", name: "Booking Confirmation", type: "email", subject: "Your booking is confirmed! 🎉", body: "Dear {{customerName}}, your booking {{bookingNumber}} with {{workerName}} has been confirmed...", lastUpdated: "2025-01-15T10:00:00Z" },
    { id: "2", name: "Payment Received", type: "email", subject: "Payment received for {{bookingNumber}}", body: "We've received your payment of {{amount}} {{currency}} for booking {{bookingNumber}}...", lastUpdated: "2025-01-14T10:00:00Z" },
    { id: "3", name: "New Booking Request", type: "push", body: "You have a new booking request from {{customerName}} for {{jobTitle}}", lastUpdated: "2025-01-13T10:00:00Z" },
    { id: "4", name: "Review Reminder", type: "email", subject: "How was your experience?", body: "Dear {{customerName}}, how was your experience with {{workerName}}? Leave a review...", lastUpdated: "2025-01-12T10:00:00Z" },
  ]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const typeColors: Record<string, string> = { email: "bg-blue-100 text-blue-800", push: "bg-purple-100 text-purple-800", sms: "bg-green-100 text-green-800" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Notification Templates</h3><button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"><Plus className="w-4 h-4" /> New Template</button></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => (
          <div key={t.id} onClick={() => setSelectedTemplate(t)} className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:shadow-md transition-all">
            <div className="flex items-start justify-between mb-2"><span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", typeColors[t.type])}>{t.type}</span><div className="flex gap-1"><button className="text-gray-400 hover:text-gray-600"><Edit className="w-4 h-4" /></button><button className="text-gray-400 hover:text-gray-600"><Copy className="w-4 h-4" /></button></div></div>
            <p className="font-medium text-gray-900">{t.name}</p>
            {t.subject && <p className="text-sm text-gray-500 mt-1">{t.subject}</p>}
            <p className="text-sm text-gray-400 mt-2 line-clamp-2">{t.body}</p>
            <p className="text-xs text-gray-400 mt-2">Updated: {new Date(t.lastUpdated).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
