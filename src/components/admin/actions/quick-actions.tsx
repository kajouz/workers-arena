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
          color: "bg-green-100 text-green-700 hover:bg-green-200",
          action: () => handleAction("approve", "w1"),
        },
        {
          id: "reject",
          label: "Reject",
          icon: <XCircle className="w-4 h-4" />,
          color: "bg-red-100 text-red-700 hover:bg-red-200",
          action: () => handleAction("reject", "w1"),
        },
        {
          id: "view",
          label: "View",
          icon: <Eye className="w-4 h-4" />,
          color: "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
          color: "bg-blue-100 text-blue-700 hover:bg-blue-200",
          action: () => handleAction("contact", "b1"),
        },
        {
          id: "escalate",
          label: "Escalate",
          icon: <Zap className="w-4 h-4" />,
          color: "bg-orange-100 text-orange-700 hover:bg-orange-200",
          action: () => handleAction("escalate", "b1"),
        },
        {
          id: "reassign",
          label: "Reassign",
          icon: <MoreVertical className="w-4 h-4" />,
          color: "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
          color: "bg-green-100 text-green-700 hover:bg-green-200",
          action: () => handleAction("dismiss", "r1"),
        },
        {
          id: "remove",
          label: "Remove",
          icon: <Ban className="w-4 h-4" />,
          color: "bg-red-100 text-red-700 hover:bg-red-200",
          action: () => handleAction("remove", "r1"),
        },
        {
          id: "warn",
          label: "Warn User",
          icon: <MessageSquare className="w-4 h-4" />,
          color: "bg-yellow-100 text-yellow-700 hover:bg-yellow-200",
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
          color: "bg-blue-100 text-blue-700 hover:bg-blue-200",
          action: () => handleAction("mediate", "d1"),
        },
        {
          id: "refund",
          label: "Refund",
          icon: <CheckCircle className="w-4 h-4" />,
          color: "bg-green-100 text-green-700 hover:bg-green-200",
          action: () => handleAction("refund", "d1"),
        },
        {
          id: "close",
          label: "Close",
          icon: <XCircle className="w-4 h-4" />,
          color: "bg-gray-100 text-gray-700 hover:bg-gray-200",
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
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          <h3 className="font-semibold text-gray-900">Quick Actions</h3>
        </div>
        <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 rounded-full">
          {items.length} pending
        </span>
      </div>

      {/* Items list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <CheckCircle className="w-8 h-8 mx-auto text-green-500" />
            <p className="mt-2 font-medium text-green-700">All caught up!</p>
            <p className="text-sm">No pending items require attention</p>
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-lg">{getTypeIcon(item.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 uppercase">
                      {getTypeLabel(item.type)}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-600">{item.subtitle}</p>
                  
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
