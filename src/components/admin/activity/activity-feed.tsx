"use client";

import { useState, useEffect } from "react";
import { 
  UserPlus, 
  Briefcase, 
  CreditCard, 
  Star, 
  MessageSquare, 
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: "registration" | "booking" | "payment" | "review" | "message" | "alert";
  title: string;
  description: string;
  timestamp: Date;
  user?: string;
  metadata?: Record<string, unknown>;
}

interface ActivityFeedProps {
  maxItems?: number;
  className?: string;
  refreshInterval?: number;
}

/**
 * Real-time Activity Feed component for admin dashboard
 * Shows live stream of platform activity
 */
export function ActivityFeed({ 
  maxItems = 20, 
  className,
  refreshInterval = 30000 
}: ActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Generate mock activities (in production, this would use WebSocket/SSE)
  const generateMockActivities = (): ActivityItem[] => {
    const now = new Date();
    const items: ActivityItem[] = [
      {
        id: "1",
        type: "registration" as const,
        title: "New worker registered",
        description: "Mohammed Al-Saud joined as an electrician",
        timestamp: new Date(now.getTime() - 2 * 60 * 1000),
        user: "Mohammed Al-Saud",
      },
      {
        id: "2",
        type: "booking" as const,
        title: "New booking request",
        description: "BK-1045: AC repair by Khaled Al-Harbi",
        timestamp: new Date(now.getTime() - 5 * 60 * 1000),
        user: "Sara Customer",
      },
      {
        id: "3",
        type: "payment" as const,
        title: "Payment received",
        description: "SAR 119 for subscription renewal",
        timestamp: new Date(now.getTime() - 8 * 60 * 1000),
        user: "Ali Hassan",
      },
      {
        id: "4",
        type: "review" as const,
        title: "New review posted",
        description: "5-star review for Omar Al-Mutairi",
        timestamp: new Date(now.getTime() - 12 * 60 * 1000),
        user: "Noor E.",
      },
      {
        id: "5",
        type: "alert" as const,
        title: "SLA breach warning",
        description: "BK-1042 not responded to in 46 hours",
        timestamp: new Date(now.getTime() - 15 * 60 * 1000),
      },
      {
        id: "6",
        type: "message" as const,
        title: "New chat message",
        description: "Customer sent a message on BK-1043",
        timestamp: new Date(now.getTime() - 18 * 60 * 1000),
        user: "Ahmed",
      },
      {
        id: "7",
        type: "booking" as const,
        title: "Booking confirmed",
        description: "BK-1040 confirmed by worker",
        timestamp: new Date(now.getTime() - 22 * 60 * 1000),
        user: "Ali Hassan",
      },
      {
        id: "8",
        type: "registration" as const,
        title: "New customer registered",
        description: "Fatima created an account",
        timestamp: new Date(now.getTime() - 25 * 60 * 1000),
        user: "Fatima",
      },
    ];
    return items.slice(0, maxItems);
  };

  // Fetch activities
  const fetchActivities = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 500));
    setActivities(generateMockActivities());
    setLastRefresh(new Date());
    setLoading(false);
  };

  // Initial fetch and refresh interval
  useEffect(() => {
    fetchActivities();
    const interval = setInterval(fetchActivities, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, maxItems]);

  const getTypeIcon = (type: ActivityItem["type"]) => {
    switch (type) {
      case "registration":
        return <UserPlus className="w-4 h-4" />;
      case "booking":
        return <Briefcase className="w-4 h-4" />;
      case "payment":
        return <CreditCard className="w-4 h-4" />;
      case "review":
        return <Star className="w-4 h-4" />;
      case "message":
        return <MessageSquare className="w-4 h-4" />;
      case "alert":
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: ActivityItem["type"]) => {
    switch (type) {
      case "registration":
        return "bg-green-100 text-green-700";
      case "booking":
        return "bg-blue-100 text-blue-700";
      case "payment":
        return "bg-purple-100 text-purple-700";
      case "review":
        return "bg-yellow-100 text-yellow-700";
      case "message":
        return "bg-indigo-100 text-indigo-700";
      case "alert":
        return "bg-red-100 text-red-700";
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className={cn("bg-white rounded-xl border border-gray-200", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <h3 className="font-semibold text-gray-900">Activity Feed</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Updated {formatTime(lastRefresh)}
          </span>
          <button
            onClick={fetchActivities}
            disabled={loading}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={cn("w-4 h-4 text-gray-500", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Activity list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {loading && activities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-blue-600 rounded-full mx-auto" />
            <p className="mt-2">Loading activities...</p>
          </div>
        ) : activities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <CheckCircle className="w-8 h-8 mx-auto text-gray-300" />
            <p className="mt-2">No recent activity</p>
          </div>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className={cn("p-2 rounded-lg mt-0.5", getTypeColor(activity.type))}>
                {getTypeIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{activity.title}</p>
                <p className="text-sm text-gray-600 truncate">{activity.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3 h-3 text-gray-400" />
                  <span className="text-xs text-gray-500">{formatTime(activity.timestamp)}</span>
                  {activity.user && (
                    <>
                      <span className="text-gray-300">•</span>
                      <span className="text-xs text-gray-500">{activity.user}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t bg-gray-50">
        <button className="w-full text-sm text-blue-600 hover:text-blue-700 font-medium">
          View all activity →
        </button>
      </div>
    </div>
  );
}
