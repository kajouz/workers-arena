"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Eye, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { getRealtimeRoom } from "@/lib/realtime/room";
import { MetricCard, RealtimeChart } from "./realtime-chart";
import { cn } from "@/lib/utils";

interface RealtimeEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface ActiveUser {
  userId: string;
  name?: string;
  role?: string;
  lastSeen: number;
}

/**
 * Real-time analytics dashboard showing live metrics.
 * Uses BroadcastChannel for cross-tab communication.
 * For production, swap with Liveblocks or PartyKit for server-side real-time.
 */
export function RealtimeDashboard() {
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [pageViews, setPageViews] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<{ error: string; time: number }[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const room = getRealtimeRoom("analytics");
    setIsConnected(true);

    // Listen for page views
    const unsubPageView = room.on("pageview", (data: any) => {
      setPageViews((prev) => ({
        ...prev,
        [data.page]: (prev[data.page] || 0) + 1,
      }));
      setEvents((prev) => [
        { type: "pageview", data, timestamp: data.timestamp },
        ...prev.slice(0, 49),
      ]);
    });

    // Listen for active users
    const unsubActiveUser = room.on("active_user", (data: any) => {
      setActiveUsers((prev) => {
        const existing = prev.find((u) => u.userId === data.userId);
        if (existing) {
          return prev.map((u) =>
            u.userId === data.userId
              ? { ...u, lastSeen: data.timestamp, name: data.name }
              : u
          );
        }
        return [...prev, { userId: data.userId, name: data.name, role: data.role, lastSeen: data.timestamp }];
      });
    });

    // Listen for errors
    const unsubError = room.on("error", (data: any) => {
      setErrors((prev) => [
        { error: data.error, time: data.timestamp },
        ...prev.slice(0, 9),
      ]);
    });

    // Track this session as active
    room.trackActiveUser({ name: "You" });

    // Clean up inactive users every 30 seconds
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      setActiveUsers((prev) => prev.filter((u) => now - u.lastSeen < 60000));
    }, 30000);

    return () => {
      unsubPageView();
      unsubActiveUser();
      unsubError();
      clearInterval(cleanupInterval);
      room.disconnect();
    };
  }, []);

  // Generate chart data from page views
  const chartData = Object.entries(pageViews).map(([page, count]) => ({
    label: page.split("/").pop() || page,
    value: count,
  }));

  return (
    <div className="space-y-6">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "size-2 rounded-full",
            isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
          )}
        />
        <span className="text-xs font-medium text-ink-500 dark:text-ink-400">
          {isConnected ? "Live updates active" : "Disconnected"}
        </span>
        <RefreshCw className="size-3 text-ink-400" />
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Active Users"
          value={activeUsers.length}
          icon={<Users className="size-5" />}
          color="brand"
        />
        <MetricCard
          label="Total Page Views"
          value={Object.values(pageViews).reduce((a, b) => a + b, 0)}
          icon={<Eye className="size-5" />}
          color="emerald"
        />
        <MetricCard
          label="Unique Pages"
          value={Object.keys(pageViews).length}
          icon={<TrendingUp className="size-5" />}
          color="amber"
        />
        <MetricCard
          label="Errors"
          value={errors.length}
          icon={<AlertCircle className="size-5" />}
          color="red"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {chartData.length > 0 && (
          <RealtimeChart
            data={chartData.slice(0, 8)}
            title="Page Views by Route"
            type="bar"
            height={200}
          />
        )}

        {chartData.length > 0 && (
          <RealtimeChart
            data={chartData.slice(0, 8)}
            title="Traffic Distribution"
            type="area"
            height={200}
          />
        )}
      </div>

      {/* Active users */}
      <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <h3 className="mb-3 text-sm font-bold text-ink-900 dark:text-ink-50">
          Active Users ({activeUsers.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          <AnimatePresence>
            {activeUsers.map((user) => (
              <motion.div
                key={user.userId}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-2 rounded-full bg-brand-500/10 px-3 py-1.5"
              >
                <div className="size-2 rounded-full bg-brand-500" />
                <span className="text-xs font-medium text-brand-700 dark:text-brand-400">
                  {user.name || user.userId.slice(0, 8)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {activeUsers.length === 0 && (
            <p className="text-xs text-ink-400">No active users yet</p>
          )}
        </div>
      </div>

      {/* Recent events */}
      <div className="rounded-2xl border border-ink-200/80 bg-white p-4 shadow-soft dark:border-ink-800 dark:bg-ink-900">
        <h3 className="mb-3 text-sm font-bold text-ink-900 dark:text-ink-50">
          Recent Events
        </h3>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          <AnimatePresence>
            {events.slice(0, 20).map((event, i) => (
              <motion.div
                key={`${event.timestamp}-${i}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-lg bg-ink-50 px-3 py-2 text-xs dark:bg-ink-800"
              >
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-bold",
                    event.type === "pageview"
                      ? "bg-blue-100 text-blue-700"
                      : event.type === "error"
                      ? "bg-red-100 text-red-700"
                      : "bg-ink-100 text-ink-700"
                  )}
                >
                  {event.type}
                </span>
                <span className="flex-1 truncate text-ink-600 dark:text-ink-300">
                  {event.data?.page || event.data?.error || JSON.stringify(event.data).slice(0, 50)}
                </span>
                <span className="text-ink-400">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
          {events.length === 0 && (
            <p className="py-4 text-center text-xs text-ink-400">
              No events yet. Navigate around to see live updates.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
