"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Bell,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingDown,
  TrendingUp,
  Users,
  DollarSign,
  Star,
  Clock,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  ToggleLeft,
  ToggleRight,
  Settings,
  Activity,
  BarChart3,
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  condition: "above" | "below" | "equals" | "change_percent";
  threshold: number;
  timeframe: "hour" | "day" | "week" | "month";
  recipients: string[];
  channels: ("email" | "push" | "slack")[];
  isActive: boolean;
  lastTriggered?: string;
  triggerCount: number;
  createdAt: string;
}

interface AlertHistory {
  id: string;
  ruleId: string;
  ruleName: string;
  triggeredAt: string;
  metric: string;
  currentValue: number;
  threshold: number;
  message: string;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

const metricLabels: Record<string, string> = {
  revenue_drop: "Revenue Drop",
  churn_spike: "Churn Spike",
  review_crisis: "Review Crisis",
  capacity_alert: "Capacity Alert",
  payment_failure: "Payment Failure",
  signup_drop: "Signup Drop",
  booking_drop: "Booking Drop",
  worker_inactive: "Worker Inactive",
};

const channelIcons: Record<string, React.ElementType> = {
  email: Bell,
  push: Bell,
  slack: Bell,
};

export function SmartAlerts() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [activeTab, setActiveTab] = useState<"rules" | "history" | "create">("rules");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRule, setNewRule] = useState({
    name: "",
    description: "",
    metric: "revenue_drop",
    condition: "below" as AlertRule["condition"],
    threshold: 10,
    timeframe: "day" as AlertRule["timeframe"],
    recipients: "admin@workersarena.com",
    channels: ["email"] as AlertRule["channels"],
  });
  const [stats, setStats] = useState({
    totalRules: 0,
    activeRules: 0,
    alertsTriggered: 0,
    unacknowledged: 0,
  });

  useEffect(() => {
    // Mock data
    setRules([
      {
        id: "1",
        name: "Revenue Drop Alert",
        description: "Alert when daily revenue drops by more than 10%",
        metric: "revenue_drop",
        condition: "below",
        threshold: -10,
        timeframe: "day",
        recipients: ["admin@workersarena.com", "finance@workersarena.com"],
        channels: ["email", "push"],
        isActive: true,
        lastTriggered: "2025-01-15T09:00:00Z",
        triggerCount: 3,
        createdAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "2",
        name: "Churn Spike Detection",
        description: "Alert when worker churn exceeds 5% in a week",
        metric: "churn_spike",
        condition: "above",
        threshold: 5,
        timeframe: "week",
        recipients: ["admin@workersarena.com"],
        channels: ["email"],
        isActive: true,
        triggerCount: 0,
        createdAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "3",
        name: "Negative Review Alert",
        description: "Alert when average rating drops below 4.0",
        metric: "review_crisis",
        condition: "below",
        threshold: 4.0,
        timeframe: "week",
        recipients: ["admin@workersarena.com", "support@workersarena.com"],
        channels: ["email", "push", "slack"],
        isActive: true,
        lastTriggered: "2025-01-10T14:00:00Z",
        triggerCount: 1,
        createdAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "4",
        name: "Low Capacity Warning",
        description: "Alert when available workers drop below 50",
        metric: "capacity_alert",
        condition: "below",
        threshold: 50,
        timeframe: "day",
        recipients: ["admin@workersarena.com"],
        channels: ["email"],
        isActive: false,
        triggerCount: 5,
        createdAt: "2025-01-01T00:00:00Z",
      },
    ]);

    setHistory([
      {
        id: "1",
        ruleId: "1",
        ruleName: "Revenue Drop Alert",
        triggeredAt: "2025-01-15T09:00:00Z",
        metric: "Daily Revenue",
        currentValue: 1250,
        threshold: 1500,
        message: "Daily revenue dropped by 16.7% ($1,250 vs $1,500 average)",
        acknowledged: true,
        acknowledgedBy: "Admin User",
        acknowledgedAt: "2025-01-15T09:30:00Z",
      },
      {
        id: "2",
        ruleId: "1",
        ruleName: "Revenue Drop Alert",
        triggeredAt: "2025-01-10T09:00:00Z",
        metric: "Daily Revenue",
        currentValue: 1380,
        threshold: 1500,
        message: "Daily revenue dropped by 8% ($1,380 vs $1,500 average)",
        acknowledged: true,
        acknowledgedBy: "Finance Manager",
        acknowledgedAt: "2025-01-10T10:00:00Z",
      },
      {
        id: "3",
        ruleId: "3",
        ruleName: "Negative Review Alert",
        triggeredAt: "2025-01-10T14:00:00Z",
        metric: "Average Rating",
        currentValue: 3.8,
        threshold: 4.0,
        message: "Average rating dropped to 3.8 (below 4.0 threshold)",
        acknowledged: false,
      },
      {
        id: "4",
        ruleId: "4",
        ruleName: "Low Capacity Warning",
        triggeredAt: "2025-01-12T08:00:00Z",
        metric: "Available Workers",
        currentValue: 45,
        threshold: 50,
        message: "Only 45 workers available (below 50 threshold)",
        acknowledged: true,
        acknowledgedBy: "Admin User",
        acknowledgedAt: "2025-01-12T08:15:00Z",
      },
    ]);

    setStats({
      totalRules: 4,
      activeRules: 3,
      alertsTriggered: 12,
      unacknowledged: 1,
    });
  }, []);

  const filteredRules = rules.filter((r) => {
    const matchesSearch = r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" ||
      (filterStatus === "active" && r.isActive) ||
      (filterStatus === "inactive" && !r.isActive);
    return matchesSearch && matchesStatus;
  });

  const handleCreateRule = () => {
    if (!newRule.name || !newRule.description) return;
    
    const rule: AlertRule = {
      id: Date.now().toString(),
      name: newRule.name,
      description: newRule.description,
      metric: newRule.metric,
      condition: newRule.condition,
      threshold: newRule.threshold,
      timeframe: newRule.timeframe,
      recipients: newRule.recipients.split(",").map((r) => r.trim()),
      channels: newRule.channels,
      isActive: true,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    };
    
    setRules([rule, ...rules]);
    setShowCreateModal(false);
    setNewRule({
      name: "", description: "", metric: "revenue_drop", condition: "below",
      threshold: 10, timeframe: "day", recipients: "admin@workersarena.com", channels: ["email"],
    });
  };

  const handleToggleActive = (id: string) => {
    setRules(rules.map((r) => r.id === id ? { ...r, isActive: !r.isActive } : r));
  };

  const handleDeleteRule = (id: string) => {
    if (confirm("Are you sure you want to delete this alert rule?")) {
      setRules(rules.filter((r) => r.id !== id));
    }
  };

  const handleAcknowledge = (id: string) => {
    setHistory(history.map((h) =>
      h.id === id ? {
        ...h,
        acknowledged: true,
        acknowledgedBy: "Admin User",
        acknowledgedAt: new Date().toISOString(),
      } : h
    ));
    setStats({ ...stats, unacknowledged: stats.unacknowledged - 1 });
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Bell className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRules}</p>
              <p className="text-sm text-gray-500">Total Rules</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.activeRules}</p>
              <p className="text-sm text-gray-500">Active Rules</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Activity className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.alertsTriggered}</p>
              <p className="text-sm text-gray-500">Triggered</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.unacknowledged}</p>
              <p className="text-sm text-gray-500">Unacknowledged</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("rules")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "rules"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Bell className="w-4 h-4 inline mr-2" />
            Alert Rules
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
            <Clock className="w-4 h-4 inline mr-2" />
            Alert History
          </button>
        </nav>
      </div>

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Rule
            </button>
          </div>

          {/* Rules List */}
          <div className="space-y-4">
            {filteredRules.map((rule) => (
              <div key={rule.id} className={cn(
                "bg-white rounded-xl border p-4 transition-all",
                rule.isActive ? "border-gray-200 hover:shadow-md" : "border-gray-100 opacity-60"
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{rule.name}</h3>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        {metricLabels[rule.metric]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{rule.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleActive(rule.id)}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded-full",
                        rule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      )}
                    >
                      {rule.isActive ? "Active" : "Paused"}
                    </button>
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Condition</p>
                    <p className="font-medium capitalize">{rule.condition} {rule.threshold}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Timeframe</p>
                    <p className="font-medium capitalize">{rule.timeframe}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Recipients</p>
                    <p className="font-medium">{rule.recipients.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Triggered</p>
                    <p className="font-medium">{rule.triggerCount} times</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">Channels:</span>
                    <div className="flex gap-1">
                      {rule.channels.map((channel) => (
                        <span key={channel} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded capitalize">
                          {channel}
                        </span>
                      ))}
                    </div>
                  </div>
                  {rule.lastTriggered && (
                    <div className="text-gray-500">
                      Last triggered: {new Date(rule.lastTriggered).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {history.map((alert) => (
            <div key={alert.id} className={cn(
              "bg-white rounded-xl border p-4",
              !alert.acknowledged && "border-l-4 border-l-orange-500"
            )}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{alert.ruleName}</h3>
                    {!alert.acknowledged && (
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 text-orange-800">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{alert.message}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">{new Date(alert.triggeredAt).toLocaleString()}</p>
                  {!alert.acknowledged && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="mt-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Acknowledge
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Metric</p>
                  <p className="font-medium">{alert.metric}</p>
                </div>
                <div>
                  <p className="text-gray-500">Current Value</p>
                  <p className="font-medium">{alert.currentValue}</p>
                </div>
                <div>
                  <p className="text-gray-500">Threshold</p>
                  <p className="font-medium">{alert.threshold}</p>
                </div>
              </div>

              {alert.acknowledged && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500">
                  Acknowledged by {alert.acknowledgedBy} at {new Date(alert.acknowledgedAt!).toLocaleString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Alert Rule</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={newRule.name}
                  onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
                  placeholder="e.g., Revenue Drop Alert"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newRule.description}
                  onChange={(e) => setNewRule({ ...newRule, description: e.target.value })}
                  placeholder="Brief description of when this alert triggers"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metric</label>
                <select
                  value={newRule.metric}
                  onChange={(e) => setNewRule({ ...newRule, metric: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(metricLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
                  <select
                    value={newRule.condition}
                    onChange={(e) => setNewRule({ ...newRule, condition: e.target.value as AlertRule["condition"] })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="above">Above</option>
                    <option value="below">Below</option>
                    <option value="equals">Equals</option>
                    <option value="change_percent">Change %</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Threshold</label>
                  <input
                    type="number"
                    value={newRule.threshold}
                    onChange={(e) => setNewRule({ ...newRule, threshold: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Timeframe</label>
                <select
                  value={newRule.timeframe}
                  onChange={(e) => setNewRule({ ...newRule, timeframe: e.target.value as AlertRule["timeframe"] })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="hour">Hour</option>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients (comma-separated)</label>
                <input
                  type="text"
                  value={newRule.recipients}
                  onChange={(e) => setNewRule({ ...newRule, recipients: e.target.value })}
                  placeholder="admin@workersarena.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Channels</label>
                <div className="flex gap-4">
                  {["email", "push", "slack"].map((channel) => (
                    <label key={channel} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newRule.channels.includes(channel as AlertRule["channels"][0])}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewRule({ ...newRule, channels: [...newRule.channels, channel as AlertRule["channels"][0]] });
                          } else {
                            setNewRule({ ...newRule, channels: newRule.channels.filter((c) => c !== channel) });
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{channel}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRule}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
