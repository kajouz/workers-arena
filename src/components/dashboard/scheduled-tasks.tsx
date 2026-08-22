"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Clock,
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Settings,
  History,
  Calendar,
  Timer,
  Cpu,
  Database,
  Mail,
  Bell,
  Search,
  Filter,
  Eye,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  type: "cron" | "interval" | "once";
  schedule: string;
  command: string;
  isActive: boolean;
  lastRun?: string;
  lastStatus?: "success" | "failed" | "running";
  nextRun: string;
  averageDuration?: number;
  totalRuns: number;
  failureRate: number;
  createdAt: string;
  category: "maintenance" | "notification" | "analytics" | "cleanup" | "backup";
}

interface TaskHistory {
  id: string;
  taskId: string;
  taskName: string;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  status: "running" | "success" | "failed";
  output?: string;
  error?: string;
}

const categoryColors: Record<string, string> = {
  maintenance: "bg-blue-100 text-blue-800",
  notification: "bg-purple-100 text-purple-800",
  analytics: "bg-green-100 text-green-800",
  cleanup: "bg-orange-100 text-orange-800",
  backup: "bg-gray-100 text-gray-800",
};

const statusColors: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-yellow-100 text-yellow-800",
};

const categoryIcons: Record<string, React.ElementType> = {
  maintenance: Settings,
  notification: Bell,
  analytics: Cpu,
  cleanup: Database,
  backup: Database,
};

export function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [history, setHistory] = useState<TaskHistory[]>([]);
  const [activeTab, setActiveTab] = useState<"tasks" | "history" | "logs">("tasks");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [stats, setStats] = useState({
    totalTasks: 0,
    activeTasks: 0,
    totalRuns: 0,
    successRate: 0,
  });

  useEffect(() => {
    // Mock data
    setTasks([
      {
        id: "1",
        name: "Daily Backup",
        description: "Full database backup to S3",
        type: "cron",
        schedule: "0 2 * * *",
        command: "backup:database",
        isActive: true,
        lastRun: "2025-01-17T02:00:00Z",
        lastStatus: "success",
        nextRun: "2025-01-18T02:00:00Z",
        averageDuration: 340,
        totalRuns: 365,
        failureRate: 0.5,
        createdAt: "2024-01-01T00:00:00Z",
        category: "backup",
      },
      {
        id: "2",
        name: "Subscription Expiry Check",
        description: "Expire overdue subscriptions and notify workers",
        type: "cron",
        schedule: "0 * * * *",
        command: "subscriptions:expire",
        isActive: true,
        lastRun: "2025-01-17T10:00:00Z",
        lastStatus: "success",
        nextRun: "2025-01-17T11:00:00Z",
        averageDuration: 12,
        totalRuns: 8760,
        failureRate: 0.1,
        createdAt: "2024-01-01T00:00:00Z",
        category: "maintenance",
      },
      {
        id: "3",
        name: "Push Notification Prune",
        description: "Remove expired push notification subscriptions",
        type: "cron",
        schedule: "0 3 * * 0",
        command: "push:prune",
        isActive: true,
        lastRun: "2025-01-12T03:00:00Z",
        lastStatus: "success",
        nextRun: "2025-01-19T03:00:00Z",
        averageDuration: 45,
        totalRuns: 52,
        failureRate: 0,
        createdAt: "2024-06-01T00:00:00Z",
        category: "cleanup",
      },
      {
        id: "4",
        name: "Weekly Analytics Aggregation",
        description: "Aggregate weekly analytics data for reports",
        type: "cron",
        schedule: "0 4 * * 1",
        command: "analytics:aggregate:weekly",
        isActive: true,
        lastRun: "2025-01-13T04:00:00Z",
        lastStatus: "success",
        nextRun: "2025-01-20T04:00:00Z",
        averageDuration: 180,
        totalRuns: 52,
        failureRate: 2,
        createdAt: "2024-01-01T00:00:00Z",
        category: "analytics",
      },
      {
        id: "5",
        name: "Email Digest Sender",
        description: "Send weekly email digests to subscribed users",
        type: "cron",
        schedule: "0 9 * * 1",
        command: "email:digest:send",
        isActive: true,
        lastRun: "2025-01-13T09:00:00Z",
        lastStatus: "success",
        nextRun: "2025-01-20T09:00:00Z",
        averageDuration: 240,
        totalRuns: 52,
        failureRate: 1.5,
        createdAt: "2024-01-01T00:00:00Z",
        category: "notification",
      },
      {
        id: "6",
        name: "Stale Session Cleanup",
        description: "Remove sessions older than 30 days",
        type: "cron",
        schedule: "0 5 * * *",
        command: "sessions:cleanup",
        isActive: true,
        lastRun: "2025-01-17T05:00:00Z",
        lastStatus: "failed",
        nextRun: "2025-01-18T05:00:00Z",
        averageDuration: 8,
        totalRuns: 365,
        failureRate: 0.8,
        createdAt: "2024-01-01T00:00:00Z",
        category: "cleanup",
      },
    ]);

    setHistory([
      {
        id: "1",
        taskId: "1",
        taskName: "Daily Backup",
        startedAt: "2025-01-17T02:00:00Z",
        completedAt: "2025-01-17T02:05:40Z",
        duration: 340,
        status: "success",
        output: "Backup completed: 2.4 GB uploaded to S3",
      },
      {
        id: "2",
        taskId: "2",
        taskName: "Subscription Expiry Check",
        startedAt: "2025-01-17T10:00:00Z",
        completedAt: "2025-01-17T10:00:12Z",
        duration: 12,
        status: "success",
        output: "Checked 1,247 subscriptions, expired 3",
      },
      {
        id: "3",
        taskId: "6",
        taskName: "Stale Session Cleanup",
        startedAt: "2025-01-17T05:00:00Z",
        completedAt: "2025-01-17T05:00:08Z",
        duration: 8,
        status: "failed",
        error: "Database connection timeout after 5s",
      },
      {
        id: "4",
        taskId: "2",
        taskName: "Subscription Expiry Check",
        startedAt: "2025-01-17T09:00:00Z",
        completedAt: "2025-01-17T09:00:11Z",
        duration: 11,
        status: "success",
        output: "Checked 1,247 subscriptions, expired 0",
      },
      {
        id: "5",
        taskId: "1",
        taskName: "Daily Backup",
        startedAt: "2025-01-16T02:00:00Z",
        completedAt: "2025-01-16T02:05:22Z",
        duration: 322,
        status: "success",
        output: "Backup completed: 2.3 GB uploaded to S3",
      },
    ]);

    setStats({
      totalTasks: 6,
      activeTasks: 6,
      totalRuns: 9283,
      successRate: 99.2,
    });
  }, []);

  const filteredTasks = tasks.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || t.category === filterCategory;
    const matchesStatus = filterStatus === "all" ||
      (filterStatus === "active" && t.isActive) ||
      (filterStatus === "inactive" && !t.isActive) ||
      (filterStatus === "failing" && t.failureRate > 1);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleToggleActive = (id: string) => {
    setTasks(tasks.map((t) => t.id === id ? { ...t, isActive: !t.isActive } : t));
  };

  const handleRunNow = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    
    const newHistory: TaskHistory = {
      id: Date.now().toString(),
      taskId: id,
      taskName: task.name,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    
    setHistory([newHistory, ...history]);
    setTasks(tasks.map((t) => t.id === id ? { ...t, lastStatus: "running" as const } : t));
    
    // Simulate completion
    setTimeout(() => {
      setHistory((prev) => prev.map((h) =>
        h.id === newHistory.id ? {
          ...h,
          completedAt: new Date().toISOString(),
          duration: 5,
          status: "success",
          output: "Task completed successfully",
        } : h
      ));
      setTasks((prev) => prev.map((t) =>
        t.id === id ? {
          ...t,
          lastRun: new Date().toISOString(),
          lastStatus: "success" as const,
          totalRuns: t.totalRuns + 1,
        } : t
      ));
    }, 2000);
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Clock className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalTasks}</p>
              <p className="text-sm text-gray-500">Total Tasks</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Play className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.activeTasks}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <RefreshCw className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRuns.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Runs</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.successRate}%</p>
              <p className="text-sm text-gray-500">Success Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("tasks")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "tasks"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            Tasks
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "history"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <History className="w-4 h-4 inline mr-2" />
            History
          </button>
        </nav>
      </div>

      {/* Tasks Tab */}
      {activeTab === "tasks" && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="maintenance">Maintenance</option>
              <option value="notification">Notifications</option>
              <option value="analytics">Analytics</option>
              <option value="cleanup">Cleanup</option>
              <option value="backup">Backup</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="failing">Failing</option>
            </select>
          </div>

          {/* Tasks List */}
          <div className="space-y-4">
            {filteredTasks.map((task) => {
              const CategoryIcon = categoryIcons[task.category];
              return (
                <div key={task.id} className={cn(
                  "bg-white rounded-xl border p-4 transition-all",
                  task.isActive ? "border-gray-200 hover:shadow-md" : "border-gray-100 opacity-60"
                )}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className={cn("p-2 rounded-lg", categoryColors[task.category])}>
                        <CategoryIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{task.name}</h3>
                          <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", categoryColors[task.category])}>
                            {task.category}
                          </span>
                          {task.lastStatus === "failed" && (
                            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                              Last run failed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{task.description}</p>
                        <p className="font-mono text-xs text-gray-400 mt-1">{task.command}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRunNow(task.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Run Now"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(task.id)}
                        className={cn(
                          "px-3 py-1 text-xs font-medium rounded-full",
                          task.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                        )}
                      >
                        {task.isActive ? "Active" : "Paused"}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Schedule</p>
                      <p className="font-mono font-medium">{task.schedule}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Last Run</p>
                      <p className="font-medium">
                        {task.lastRun ? new Date(task.lastRun).toLocaleString() : "Never"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Next Run</p>
                      <p className="font-medium">{new Date(task.nextRun).toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Avg Duration</p>
                      <p className="font-medium">
                        {task.averageDuration ? formatDuration(task.averageDuration) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-500">Runs / Failures</p>
                      <p className="font-medium">
                        {task.totalRuns.toLocaleString()} / {task.failureRate}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Task</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Started</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Output</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{item.taskName}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {new Date(item.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {item.duration ? formatDuration(item.duration) : "—"}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[item.status])}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {item.output || item.error || "—"}
                  </td>
                  <td className="px-4 py-4">
                    <button className="text-gray-400 hover:text-gray-600" title="View Details">
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
