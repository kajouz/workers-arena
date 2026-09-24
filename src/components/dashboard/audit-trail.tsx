"use client";

import { useState, useEffect } from "react";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import {
  History,
  User,
  Settings,
  Shield,
  CreditCard,
  Users,
  FileText,
  Search,
  Filter,
  Download,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  AlertTriangle,
} from "lucide-react";

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: "super_admin" | "support" | "finance" | "marketing";
    ip: string;
  };
  action: string;
  category: "auth" | "user" | "worker" | "booking" | "payment" | "content" | "system" | "security";
  resource: string;
  resourceId?: string;
  details: Record<string, unknown>;
  previousValue?: unknown;
  newValue?: unknown;
  status: "success" | "failure" | "pending";
}

const categoryColors: Record<string, string> = {
  auth: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  user: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
  worker: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  booking: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300",
  payment: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  content: "bg-pink-100 text-pink-800 dark:bg-pink-500/15 dark:text-pink-300",
  system: "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100",
  security: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

const categoryIcons: Record<string, React.ElementType> = {
  auth: Shield,
  user: Users,
  worker: User,
  booking: Calendar,
  payment: CreditCard,
  content: FileText,
  system: Settings,
  security: AlertTriangle,
};

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  support: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  finance: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  marketing: "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300",
};

export function AuditTrail() {
  const { locale } = useLocale();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterActor, setFilterActor] = useState<string>("all");
  const [filterDateRange, setFilterDateRange] = useState<string>("7d");
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalActions: 0,
    todayActions: 0,
    uniqueActors: 0,
    failedActions: 0,
  });

  useEffect(() => {
    // Mock data
    setEntries([
      {
        id: "1",
        timestamp: "2025-01-17T10:30:00Z",
        actor: {
          id: "a1",
          name: "Admin User",
          email: "admin@workersarena.com",
          role: "super_admin",
          ip: "192.168.1.100",
        },
        action: "worker.verified",
        category: "worker",
        resource: "Worker Profile",
        resourceId: "khaled-al-harbi",
        details: { reason: "Documents verified" },
        previousValue: { status: "pending" },
        newValue: { status: "verified" },
        status: "success",
      },
      {
        id: "2",
        timestamp: "2025-01-17T10:15:00Z",
        actor: {
          id: "a2",
          name: "Support Agent",
          email: "support@workersarena.com",
          role: "support",
          ip: "192.168.1.101",
        },
        action: "booking.refunded",
        category: "payment",
        resource: "Booking",
        resourceId: "bk-12345",
        details: { amount: 45, reason: "Customer complaint" },
        previousValue: { status: "completed" },
        newValue: { status: "refunded" },
        status: "success",
      },
      {
        id: "3",
        timestamp: "2025-01-17T09:45:00Z",
        actor: {
          id: "a1",
          name: "Admin User",
          email: "admin@workersarena.com",
          role: "super_admin",
          ip: "192.168.1.100",
        },
        action: "user.suspended",
        category: "user",
        resource: "User Account",
        resourceId: "u-67890",
        details: { reason: "Terms of service violation", duration: "30 days" },
        previousValue: { status: "active" },
        newValue: { status: "suspended" },
        status: "success",
      },
      {
        id: "4",
        timestamp: "2025-01-17T09:30:00Z",
        actor: {
          id: "a3",
          name: "Finance Manager",
          email: "finance@workersarena.com",
          role: "finance",
          ip: "192.168.1.102",
        },
        action: "payout.approved",
        category: "payment",
        resource: "Payout Request",
        resourceId: "po-5678",
        details: { amount: 250, workerId: "w-1234" },
        newValue: { status: "approved" },
        status: "success",
      },
      {
        id: "5",
        timestamp: "2025-01-17T09:00:00Z",
        actor: {
          id: "a4",
          name: "Marketing User",
          email: "marketing@workersarena.com",
          role: "marketing",
          ip: "192.168.1.103",
        },
        action: "campaign.created",
        category: "content",
        resource: "Email Campaign",
        resourceId: "camp-9012",
        details: { name: "January Promo", segment: "customers", recipientCount: 500 },
        status: "success",
      },
      {
        id: "6",
        timestamp: "2025-01-17T08:30:00Z",
        actor: {
          id: "a1",
          name: "Admin User",
          email: "admin@workersarena.com",
          role: "super_admin",
          ip: "192.168.1.100",
        },
        action: "settings.updated",
        category: "system",
        resource: "System Settings",
        details: { setting: "maintenance_mode", oldValue: false, newValue: true },
        previousValue: { maintenance_mode: false },
        newValue: { maintenance_mode: true },
        status: "success",
      },
      {
        id: "7",
        timestamp: "2025-01-17T08:00:00Z",
        actor: {
          id: "system",
          name: "System",
          email: "system@workersarena.com",
          role: "super_admin",
          ip: "127.0.0.1",
        },
        action: "auth.login_failed",
        category: "security",
        resource: "Login Attempt",
        details: { email: "unknown@test.com", reason: "Invalid credentials", attemptCount: 5 },
        status: "failure",
      },
    ]);

    setStats({
      totalActions: 1247,
      todayActions: 47,
      uniqueActors: 8,
      failedActions: 12,
    });
  }, []);

  const filteredEntries = entries.filter((e) => {
    const matchesSearch = e.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.actor.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || e.category === filterCategory;
    const matchesActor = filterActor === "all" || e.actor.id === filterActor;
    return matchesSearch && matchesCategory && matchesActor;
  });

  /** Relative for the last week, an absolute (locale-aware) date beyond it.
   * Named `formatRelative` so it cannot shadow the shared `formatDate` from
   * `@/lib/utils` — the shadowing is what made the fallback below render a
   * runtime-locale date on the Arabic page. */
  const formatRelative = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date, locale);
  };

  const formatAction = (action: string) => {
    return action.split(".").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{formatNumber(stats.totalActions)}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Total Actions</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.todayActions}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Today</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.uniqueActors}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Unique Actors</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.failedActions}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Failed Actions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-400 dark:text-ink-500" />
          <input
            type="text"
            placeholder="Search audit log..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full ps-10 pe-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Categories</option>
          <option value="auth">Authentication</option>
          <option value="user">User Management</option>
          <option value="worker">Worker Management</option>
          <option value="booking">Bookings</option>
          <option value="payment">Payments</option>
          <option value="content">Content</option>
          <option value="system">System</option>
          <option value="security">Security</option>
        </select>
        <select
          value={filterActor}
          onChange={(e) => setFilterActor(e.target.value)}
          className="px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Actors</option>
          <option value="a1">Admin User</option>
          <option value="a2">Support Agent</option>
          <option value="a3">Finance Manager</option>
          <option value="a4">Marketing User</option>
        </select>
        <select
          value={filterDateRange}
          onChange={(e) => setFilterDateRange(e.target.value)}
          className="px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="1d">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
        <button className="flex items-center gap-2 px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-950">
          <Download className="w-4 h-4" />
          Export
        </button>
      </div>

      {/* Audit Timeline */}
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
        <div className="p-4 border-b border-ink-200 dark:border-ink-800">
          <h3 className="font-semibold text-ink-900 dark:text-ink-50">Audit Log</h3>
        </div>
        <div className="divide-y divide-ink-200 dark:divide-ink-800">
          {filteredEntries.map((entry) => {
            const CategoryIcon = categoryIcons[entry.category];
            const isExpanded = expandedEntry === entry.id;
            
            return (
              <div key={entry.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer"
                  onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                >
                  <div className={cn("p-2 rounded-lg", categoryColors[entry.category])}>
                    <CategoryIcon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink-900 dark:text-ink-50">{formatAction(entry.action)}</p>
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", roleColors[entry.actor.role])}>
                        {entry.actor.role.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-sm text-ink-500 dark:text-ink-400 truncate">
                      {entry.resource} {entry.resourceId && `(${entry.resourceId})`}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm text-ink-600 dark:text-ink-300">{entry.actor.name}</p>
                    <p className="text-xs text-ink-400 dark:text-ink-500">{formatRelative(entry.timestamp)}</p>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-ink-400 dark:text-ink-500" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-ink-400 dark:text-ink-500" />
                  )}
                </div>
                
                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 ms-12">
                    <div className="bg-ink-50 dark:bg-ink-950 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-ink-500 dark:text-ink-400">Actor</p>
                          <p className="font-medium">{entry.actor.name}</p>
                          <p className="text-ink-600 dark:text-ink-300">{entry.actor.email}</p>
                        </div>
                        <div>
                          <p className="text-ink-500 dark:text-ink-400">IP Address</p>
                          <p className="font-mono text-ink-600 dark:text-ink-300">{entry.actor.ip}</p>
                        </div>
                        <div>
                          <p className="text-ink-500 dark:text-ink-400">Timestamp</p>
                          <p className="text-ink-600 dark:text-ink-300">{formatDateTime(entry.timestamp, locale)}</p>
                        </div>
                        <div>
                          <p className="text-ink-500 dark:text-ink-400">Status</p>
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded-full",
                            entry.status === "success" ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" :
                            entry.status === "failure" ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" :
                            "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300"
                          )}>
                            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                          </span>
                        </div>
                      </div>
                      
                      {entry.previousValue != null && (
                        <div>
                          <p className="text-ink-500 dark:text-ink-400 text-sm mb-1">Previous Value</p>
                          <pre className="bg-white dark:bg-ink-900 p-2 rounded border border-ink-200 dark:border-ink-800 text-xs overflow-x-auto">
                            {String(JSON.stringify(entry.previousValue, null, 2))}
                          </pre>
                        </div>
                      )}
                      
                      {entry.newValue != null && (
                        <div>
                          <p className="text-ink-500 dark:text-ink-400 text-sm mb-1">New Value</p>
                          <pre className="bg-white dark:bg-ink-900 p-2 rounded border border-ink-200 dark:border-ink-800 text-xs overflow-x-auto">
                            {String(JSON.stringify(entry.newValue, null, 2))}
                          </pre>
                        </div>
                      )}
                      
                      <div>
                        <p className="text-ink-500 dark:text-ink-400 text-sm mb-1">Details</p>
                        <pre className="bg-white dark:bg-ink-900 p-2 rounded border border-ink-200 dark:border-ink-800 text-xs overflow-x-auto">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
