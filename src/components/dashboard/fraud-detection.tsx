"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Shield,
  Search,
  Filter,
  Eye,
  Ban,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  User,
  CreditCard,
  MapPin,
  Activity,
  AlertCircle,
  BarChart3,
} from "lucide-react";

interface FraudAlert {
  id: string;
  type: "suspicious_login" | "payment_anomaly" | "fake_review" | "identity_mismatch" | "rapid_bookings" | "chargeback_risk";
  severity: "low" | "medium" | "high" | "critical";
  userId: string;
  userName: string;
  userEmail: string;
  description: string;
  evidence: string[];
  riskScore: number;
  status: "new" | "investigating" | "resolved" | "dismissed";
  createdAt: string;
  updatedAt: string;
  assignedTo?: string;
}

interface RiskPattern {
  id: string;
  name: string;
  description: string;
  triggerCount: number;
  lastTriggered: string;
  severity: "low" | "medium" | "high" | "critical";
  isActive: boolean;
}

const severityColors: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  new: "bg-purple-100 text-purple-800",
  investigating: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  dismissed: "bg-gray-100 text-gray-800",
};

const typeLabels: Record<string, string> = {
  suspicious_login: "Suspicious Login",
  payment_anomaly: "Payment Anomaly",
  fake_review: "Fake Review",
  identity_mismatch: "Identity Mismatch",
  rapid_bookings: "Rapid Bookings",
  chargeback_risk: "Chargeback Risk",
};

export function FraudDetection() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [patterns, setPatterns] = useState<RiskPattern[]>([]);
  const [activeTab, setActiveTab] = useState<"alerts" | "patterns" | "analytics">("alerts");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [stats, setStats] = useState({
    totalAlerts: 0,
    newAlerts: 0,
    highRisk: 0,
    resolvedToday: 0,
  });

  useEffect(() => {
    // Mock data
    setAlerts([
      {
        id: "1",
        type: "suspicious_login",
        severity: "high",
        userId: "u1",
        userName: "Khaled Al Harbi",
        userEmail: "khaled@plumbfix.sa",
        description: "Login from unusual location (different country) within 1 hour of previous login",
        evidence: [
          "Login from Beirut, Lebanon at 10:30 AM",
          "Login from London, UK at 11:15 AM",
          "Impossible travel distance: 3,500 km in 45 minutes",
        ],
        riskScore: 85,
        status: "new",
        createdAt: "2025-01-17T11:20:00Z",
        updatedAt: "2025-01-17T11:20:00Z",
      },
      {
        id: "2",
        type: "payment_anomaly",
        severity: "critical",
        userId: "u2",
        userName: "Ali Hassan",
        userEmail: "ali@carpentry.sa",
        description: "Multiple failed payment attempts followed by successful charge from different card",
        evidence: [
          "3 failed attempts with card ending 4242",
          "Successful charge with card ending 8888",
          "Cardholder names don't match account name",
          "IP address changed between attempts",
        ],
        riskScore: 95,
        status: "investigating",
        createdAt: "2025-01-17T10:00:00Z",
        updatedAt: "2025-01-17T10:30:00Z",
        assignedTo: "Support Agent",
      },
      {
        id: "3",
        type: "fake_review",
        severity: "medium",
        userId: "u3",
        userName: "Omar Al Mutairi",
        userEmail: "omar@ac-tech.sa",
        description: "Suspicious review pattern detected - multiple 5-star reviews from new accounts",
        evidence: [
          "5 reviews posted within 10 minutes",
          "All reviewers created accounts today",
          "Similar review text with minor variations",
          "All from same IP range",
        ],
        riskScore: 72,
        status: "new",
        createdAt: "2025-01-17T09:00:00Z",
        updatedAt: "2025-01-17T09:00:00Z",
      },
      {
        id: "4",
        type: "rapid_bookings",
        severity: "medium",
        userId: "u4",
        userName: "Bilal Mansour",
        userEmail: "bilal@cleaning.sa",
        description: "Worker completed 12 bookings in 2 hours - possible fake completions",
        evidence: [
          "12 bookings completed between 2 PM - 4 PM",
          "Average booking duration: 10 minutes",
          "Services typically take 1-2 hours",
          "All bookings from same customer account",
        ],
        riskScore: 68,
        status: "investigating",
        createdAt: "2025-01-17T08:00:00Z",
        updatedAt: "2025-01-17T08:30:00Z",
        assignedTo: "Finance Manager",
      },
      {
        id: "5",
        type: "chargeback_risk",
        severity: "high",
        userId: "u5",
        userName: "Anas Barakat",
        userEmail: "anas@design.sa",
        description: "Customer filed 3 chargebacks in last 30 days",
        evidence: [
          "Chargeback #1: $150 - Service not rendered",
          "Chargeback #2: $200 - Unauthorized transaction",
          "Chargeback #3: $75 - Duplicate charge",
          "Total chargeback amount: $425",
        ],
        riskScore: 88,
        status: "new",
        createdAt: "2025-01-17T07:00:00Z",
        updatedAt: "2025-01-17T07:00:00Z",
      },
    ]);

    setPatterns([
      {
        id: "1",
        name: "Impossible Travel",
        description: "Logins from distant locations within impossible time frames",
        triggerCount: 23,
        lastTriggered: "2025-01-17T11:20:00Z",
        severity: "high",
        isActive: true,
      },
      {
        id: "2",
        name: "Velocity Check",
        description: "Unusual number of transactions in short time period",
        triggerCount: 45,
        lastTriggered: "2025-01-17T10:00:00Z",
        severity: "medium",
        isActive: true,
      },
      {
        id: "3",
        name: "Card Testing",
        description: "Multiple failed payments followed by success",
        triggerCount: 12,
        lastTriggered: "2025-01-17T09:30:00Z",
        severity: "critical",
        isActive: true,
      },
      {
        id: "4",
        name: "Review Manipulation",
        description: "Suspicious review patterns from new accounts",
        triggerCount: 67,
        lastTriggered: "2025-01-17T09:00:00Z",
        severity: "medium",
        isActive: true,
      },
    ]);

    setStats({
      totalAlerts: 156,
      newAlerts: 8,
      highRisk: 12,
      resolvedToday: 23,
    });
  }, []);

  const filteredAlerts = alerts.filter((a) => {
    const matchesSearch = a.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.userEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = filterSeverity === "all" || a.severity === filterSeverity;
    const matchesStatus = filterStatus === "all" || a.status === filterStatus;
    return matchesSearch && matchesSeverity && matchesStatus;
  });

  const handleResolveAlert = (id: string) => {
    setAlerts(alerts.map((a) =>
      a.id === id ? { ...a, status: "resolved" as const, updatedAt: new Date().toISOString() } : a
    ));
  };

  const handleDismissAlert = (id: string) => {
    setAlerts(alerts.map((a) =>
      a.id === id ? { ...a, status: "dismissed" as const, updatedAt: new Date().toISOString() } : a
    ));
  };

  const handleBanUser = (userId: string) => {
    if (confirm("Are you sure you want to ban this user?")) {
      // In real app, would call API
      alert(`User ${userId} has been banned`);
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 80) return "text-red-600";
    if (score >= 60) return "text-orange-600";
    if (score >= 40) return "text-yellow-600";
    return "text-green-600";
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalAlerts}</p>
              <p className="text-sm text-gray-500">Total Alerts</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Bell className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.newAlerts}</p>
              <p className="text-sm text-gray-500">New Alerts</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <Shield className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.highRisk}</p>
              <p className="text-sm text-gray-500">High Risk</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.resolvedToday}</p>
              <p className="text-sm text-gray-500">Resolved Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("alerts")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "alerts"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <AlertTriangle className="w-4 h-4 inline mr-2" />
            Active Alerts
          </button>
          <button
            onClick={() => setActiveTab("patterns")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "patterns"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Activity className="w-4 h-4 inline mr-2" />
            Risk Patterns
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "analytics"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Analytics
          </button>
        </nav>
      </div>

      {/* Active Alerts Tab */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Severity</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="investigating">Investigating</option>
              <option value="resolved">Resolved</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </div>

          {/* Alerts List */}
          <div className="space-y-4">
            {filteredAlerts.map((alert) => (
              <div key={alert.id} className={cn(
                "bg-white rounded-xl border p-4 transition-all",
                alert.severity === "critical" ? "border-red-300" :
                alert.severity === "high" ? "border-orange-300" : "border-gray-200"
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", severityColors[alert.severity])}>
                      {alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)}
                    </span>
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[alert.status])}>
                      {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                    </span>
                    <span className="text-sm text-gray-500">{typeLabels[alert.type]}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-lg font-bold", getRiskColor(alert.riskScore))}>
                      {alert.riskScore}
                    </span>
                    <span className="text-xs text-gray-500">risk</span>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{alert.userName}</span>
                    <span className="text-gray-500">({alert.userEmail})</span>
                  </div>
                  <p className="text-gray-600">{alert.description}</p>
                </div>

                {/* Evidence */}
                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Evidence:</p>
                  <ul className="space-y-1">
                    {alert.evidence.map((item, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                        <span className="text-gray-400">•</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    {alert.assignedTo && (
                      <span>Assigned to: <span className="font-medium">{alert.assignedTo}</span></span>
                    )}
                    <span className="ml-4">{new Date(alert.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleBanUser(alert.userId)}
                      className="flex items-center gap-1 px-3 py-1.5 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 text-sm"
                    >
                      <Ban className="w-4 h-4" />
                      Ban User
                    </button>
                    <button
                      onClick={() => handleDismissAlert(alert.id)}
                      className="px-3 py-1.5 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => handleResolveAlert(alert.id)}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Patterns Tab */}
      {activeTab === "patterns" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Pattern</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Description</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Severity</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Triggers</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Last Triggered</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {patterns.map((pattern) => (
                <tr key={pattern.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{pattern.name}</p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm text-gray-600">{pattern.description}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", severityColors[pattern.severity])}>
                      {pattern.severity.charAt(0).toUpperCase() + pattern.severity.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {pattern.triggerCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">
                    {new Date(pattern.lastTriggered).toLocaleString()}
                  </td>
                  <td className="px-4 py-4">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={pattern.isActive} readOnly />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Alerts by Type</h3>
            <div className="space-y-3">
              {Object.entries(typeLabels).map(([type, label]) => {
                const count = alerts.filter((a) => a.type === type).length;
                const percentage = alerts.length > 0 ? (count / alerts.length) * 100 : 0;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Risk Score Distribution</h3>
            <div className="space-y-3">
              {[
                { label: "Critical (80-100)", count: alerts.filter((a) => a.riskScore >= 80).length, color: "bg-red-500" },
                { label: "High (60-79)", count: alerts.filter((a) => a.riskScore >= 60 && a.riskScore < 80).length, color: "bg-orange-500" },
                { label: "Medium (40-59)", count: alerts.filter((a) => a.riskScore >= 40 && a.riskScore < 60).length, color: "bg-yellow-500" },
                { label: "Low (0-39)", count: alerts.filter((a) => a.riskScore < 40).length, color: "bg-green-500" },
              ].map((item) => {
                const percentage = alerts.length > 0 ? (item.count / alerts.length) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600">{item.label}</span>
                      <span className="font-medium">{item.count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Alert Status</h3>
            <div className="space-y-3">
              {Object.entries(statusColors).map(([status, colorClass]) => {
                const count = alerts.filter((a) => a.status === status).length;
                const percentage = alerts.length > 0 ? (count / alerts.length) * 100 : 0;
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600 capitalize">{status}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center gap-3">
                  <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", severityColors[alert.severity])}>
                    {alert.severity.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{alert.userName}</p>
                    <p className="text-xs text-gray-500 truncate">{typeLabels[alert.type]}</p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(alert.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bell icon import fix
function Bell(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
