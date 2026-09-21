"use client";

import { useState } from "react";
import { 
  CheckCircle, 
  XCircle, 
  Star, 
  MessageSquare, 
  Ban, 
  Eye,
  Mail,
  Phone,
  MoreVertical,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  action: () => void;
}

interface PendingItem {
  id: string;
  type: "worker" | "booking" | "review" | "dispute";
  title: string;
  subtitle: string;
  timestamp: Date;
  actions: QuickAction[];
}

interface QuickActionsPanelProps {
  className?: string;
}

/**
 * Quick Actions Panel component for admin dashboard
 * Shows pending items with one-click actions
 */
export function QuickActionsPanel({ className }: QuickActionsPanelProps) {
  const [items, setItems] = useState<PendingItem[]>([
    {
      id: "w1",
      type: "worker",
      title: "New Worker Registration",
      subtitle: "Ahmed Al-Rashid - Plumber",
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      actions: [
        {
          id: "approve",
          label: "Approve",
          icon: <CheckCircle className="w-4 h-4" />,
          color: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-500/15 dark:text-green-300",
          action: () => handleAction("approve", "w1"),
        },
        {
          id: "reject",
          label: "Reject",
          icon: <XCircle className="w-4 h-4" />,
          color: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300",
          action: () => handleAction("reject", "w1"),
        },
        {
          id: "view",
          label: "View",
          icon: <Eye className="w-4 h-4" />,
          color: "bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 hover:bg-ink-200 dark:hover:bg-ink-800",
          action: () => handleAction("view", "w1"),
        },
      ],
    },
    {
      id: "b1",
      type: "booking",
      title: "Booking Needs Response",
      subtitle: "BK-1045 - AC repair, 46h elapsed",
      timestamp: new Date(Date.now() - 46 * 60 * 60 * 1000),
      actions: [
        {
          id: "contact",
          label: "Contact Worker",
          icon: <Phone className="w-4 h-4" />,
          color: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-500/15 dark:text-blue-300",
          action: () => handleAction("contact", "b1"),
        },
        {
          id: "escalate",
          label: "Escalate",
          icon: <Zap className="w-4 h-4" />,
          color: "bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-500/15 dark:text-orange-300",
          action: () => handleAction("escalate", "b1"),
        },
        {
          id: "reassign",
          label: "Reassign",
          icon: <MoreVertical className="w-4 h-4" />,
          color: "bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 hover:bg-ink-200 dark:hover:bg-ink-800",
          action: () => handleAction("reassign", "b1"),
        },
      ],
    },
    {
      id: "r1",
      type: "review",
      title: "Flagged Review",
      subtitle: "1-star review with inappropriate language",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      actions: [
        {
          id: "dismiss",
          label: "Dismiss",
          icon: <CheckCircle className="w-4 h-4" />,
          color: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-500/15 dark:text-green-300",
          action: () => handleAction("dismiss", "r1"),
        },
        {
          id: "remove",
          label: "Remove",
          icon: <Ban className="w-4 h-4" />,
          color: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-500/15 dark:text-red-300",
          action: () => handleAction("remove", "r1"),
        },
        {
          id: "warn",
          label: "Warn User",
          icon: <MessageSquare className="w-4 h-4" />,
          color: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300",
          action: () => handleAction("warn", "r1"),
        },
      ],
    },
    {
      id: "d1",
      type: "dispute",
      title: "Booking Dispute",
      subtitle: "BK-1042 - Customer claims no-show",
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      actions: [
        {
          id: "mediate",
          label: "Mediate",
          icon: <MessageSquare className="w-4 h-4" />,
          color: "bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-500/15 dark:text-blue-300",
          action: () => handleAction("mediate", "d1"),
        },
        {
          id: "refund",
          label: "Refund",
          icon: <CheckCircle className="w-4 h-4" />,
          color: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-500/15 dark:text-green-300",
          action: () => handleAction("refund", "d1"),
        },
        {
          id: "close",
          label: "Close",
          icon: <XCircle className="w-4 h-4" />,
          color: "bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 hover:bg-ink-200 dark:hover:bg-ink-800",
          action: () => handleAction("close", "d1"),
        },
      ],
    },
  ]);

  const [processing, setProcessing] = useState<string | null>(null);

  const handleAction = async (actionId: string, itemId: string) => {
    setProcessing(`${itemId}-${actionId}`);
    
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Remove item from list
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setProcessing(null);
  };

  const getTypeIcon = (type: PendingItem["type"]) => {
    switch (type) {
      case "worker":
        return "👤";
      case "booking":
        return "📋";
      case "review":
        return "⭐";
      case "dispute":
        return "⚠️";
    }
  };

  const getTypeLabel = (type: PendingItem["type"]) => {
    switch (type) {
      case "worker":
        return "Registration";
      case "booking":
        return "Booking";
      case "review":
        return "Review";
      case "dispute":
        return "Dispute";
    }
  };

  return (
    <div className={cn("bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">Quick Actions</h3>
        </div>
        <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full dark:bg-orange-500/15 dark:text-orange-300">
          {items.length} pending
        </span>
      </div>

      {/* Items list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center text-ink-500 dark:text-ink-400">
            <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
            <p className="mt-2 font-medium text-green-700">All caught up!</p>
            <p className="text-sm">No pending items require attention</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="px-4 py-3 hover:bg-ink-50 dark:hover:bg-ink-950 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-lg">{getTypeIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-ink-500 dark:text-ink-400 uppercase">
                      {getTypeLabel(item.type)}
                    </span>
                  </div>
                  <p className="font-medium text-ink-900 dark:text-ink-50">{item.title}</p>
                  <p className="text-sm text-ink-600 dark:text-ink-300">{item.subtitle}</p>
                  
                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-2">
                    {item.actions.map((action) => (
                      <button
                        key={action.id}
                        onClick={action.action}
                        disabled={processing !== null}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition-colors",
                          action.color,
                          processing !== null && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {processing === `${item.id}-${action.id}` ? (
                          <div className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full" />
                        ) : (
                          action.icon
                        )}
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
