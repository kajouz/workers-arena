"use client";

import { useState, useEffect } from "react";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import {
  Shield,
  Lock,
  Key,
  Smartphone,
  Monitor,
  Globe,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  RefreshCw,
  Download,
  Search,
  Filter,
  User,
  LogOut,
} from "lucide-react";

interface LoginHistory {
  id: string;
  userId: string;
  userName: string;
  email: string;
  ipAddress: string;
  userAgent: string;
  location: string;
  status: "success" | "failed" | "blocked";
  method: "password" | "magic_link" | "oauth" | "2fa";
  timestamp: string;
  riskLevel: "low" | "medium" | "high";
}

interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  device: string;
  browser: string;
  ipAddress: string;
  location: string;
  lastActive: string;
  createdAt: string;
  isCurrentSession?: boolean;
}

interface SecuritySettings {
  twoFactorEnabled: boolean;
  passwordLastChanged: string;
  apiKeysCount: number;
  webhookEndpoints: number;
  ipWhitelist: string[];
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
}

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  high: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

const statusColors: Record<string, string> = {
  success: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  blocked: "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100",
};

export function SecurityDashboard() {
  const { locale } = useLocale();
  const [loginHistory, setLoginHistory] = useState<LoginHistory[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [settings, setSettings] = useState<SecuritySettings>({
    twoFactorEnabled: true,
    passwordLastChanged: "2025-01-10T00:00:00Z",
    apiKeysCount: 3,
    webhookEndpoints: 2,
    ipWhitelist: ["192.168.1.0/24", "10.0.0.0/8"],
    sessionTimeout: 30,
    maxLoginAttempts: 5,
    lockoutDuration: 15,
  });
  const [activeTab, setActiveTab] = useState<"history" | "sessions" | "settings" | "api">("history");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [stats, setStats] = useState({
    totalLogins: 0,
    failedLogins: 0,
    activeSessions: 0,
    blockedIPs: 0,
  });

  useEffect(() => {
    // Mock data
    setLoginHistory([
      {
        id: "1",
        userId: "u1",
        userName: "Khaled Al Harbi",
        email: "khaled@plumbfix.lb",
        ipAddress: "192.168.1.105",
        userAgent: "Chrome 121 / macOS",
        location: "Beirut, Lebanon",
        status: "success",
        method: "password",
        timestamp: "2025-01-17T10:30:00Z",
        riskLevel: "low",
      },
      {
        id: "2",
        userId: "u2",
        userName: "Ali Hassan",
        email: "ali@woodcraft.lb",
        ipAddress: "10.0.0.52",
        userAgent: "Safari 17 / iOS",
        location: "Beirut, Lebanon",
        status: "success",
        method: "2fa",
        timestamp: "2025-01-17T09:15:00Z",
        riskLevel: "low",
      },
      {
        id: "3",
        userId: "u3",
        userName: "Unknown",
        email: "test@test.com",
        ipAddress: "45.33.128.92",
        userAgent: "Firefox 122 / Windows",
        location: "Unknown Location",
        status: "failed",
        method: "password",
        timestamp: "2025-01-17T08:45:00Z",
        riskLevel: "high",
      },
      {
        id: "4",
        userId: "u4",
        userName: "Omar Al Mutairi",
        email: "omar@coolair.lb",
        ipAddress: "172.16.0.15",
        userAgent: "Chrome 121 / Android",
        location: "Beirut, Lebanon",
        status: "success",
        method: "magic_link",
        timestamp: "2025-01-17T07:20:00Z",
        riskLevel: "low",
      },
      {
        id: "5",
        userId: "u5",
        userName: "Unknown",
        email: "spam@bot.net",
        ipAddress: "185.220.101.45",
        userAgent: "curl/7.88",
        location: "Unknown Location",
        status: "blocked",
        method: "password",
        timestamp: "2025-01-17T06:00:00Z",
        riskLevel: "high",
      },
    ]);

    setActiveSessions([
      {
        id: "1",
        userId: "u1",
        userName: "Khaled Al Harbi",
        device: "MacBook Pro",
        browser: "Chrome 121",
        ipAddress: "192.168.1.105",
        location: "Beirut, Lebanon",
        lastActive: "2025-01-17T10:30:00Z",
        createdAt: "2025-01-17T08:00:00Z",
        isCurrentSession: true,
      },
      {
        id: "2",
        userId: "u2",
        userName: "Ali Hassan",
        device: "iPhone 15 Pro",
        browser: "Safari 17",
        ipAddress: "10.0.0.52",
        location: "Beirut, Lebanon",
        lastActive: "2025-01-17T09:15:00Z",
        createdAt: "2025-01-17T07:30:00Z",
      },
      {
        id: "3",
        userId: "u4",
        userName: "Omar Al Mutairi",
        device: "Samsung Galaxy S24",
        browser: "Chrome 121",
        ipAddress: "172.16.0.15",
        location: "Beirut, Lebanon",
        lastActive: "2025-01-17T07:20:00Z",
        createdAt: "2025-01-16T22:00:00Z",
      },
    ]);

    setStats({
      totalLogins: 1247,
      failedLogins: 23,
      activeSessions: 3,
      blockedIPs: 12,
    });
  }, []);

  const filteredHistory = loginHistory.filter((l) => {
    const matchesSearch = l.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.ipAddress.includes(searchQuery);
    const matchesStatus = filterStatus === "all" || l.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleRevokeSession = (id: string) => {
    if (confirm("Are you sure you want to revoke this session?")) {
      setActiveSessions(activeSessions.filter((s) => s.id !== id));
    }
  };

  const handleRevokeAllSessions = () => {
    if (confirm("Are you sure you want to revoke all other sessions?")) {
      setActiveSessions(activeSessions.filter((s) => s.isCurrentSession));
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{formatNumber(stats.totalLogins)}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Total Logins</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.failedLogins}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Failed Logins</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Monitor className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.activeSessions}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Active Sessions</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Shield className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.blockedIPs}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Blocked IPs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Security Status Banner */}
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-medium text-green-800">Security Status: Good</p>
            <p className="text-sm text-green-600">2FA is enabled, no suspicious activity detected in the last 24 hours.</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-ink-200 dark:border-ink-800">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "history"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Clock className="w-4 h-4 inline me-2" />
            Login History
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "sessions"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Monitor className="w-4 h-4 inline me-2" />
            Active Sessions
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "settings"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Lock className="w-4 h-4 inline me-2" />
            Security Settings
          </button>
          <button
            onClick={() => setActiveTab("api")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "api"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Key className="w-4 h-4 inline me-2" />
            API Keys
          </button>
        </nav>
      </div>

      {/* Login History Tab */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-400 dark:text-ink-500" />
              <input
                type="text"
                placeholder="Search by name, email, or IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full ps-10 pe-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="blocked">Blocked</option>
            </select>
            <button className="flex items-center gap-2 px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg hover:bg-ink-50 dark:hover:bg-ink-950">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>

          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="bg-ink-50 dark:bg-ink-950">
                <tr>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">User</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">IP Address</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Location</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Method</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Status</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Risk</th>
                  <th className="text-start px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                {filteredHistory.map((login) => (
                  <tr key={login.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-ink-900 dark:text-ink-50">{login.userName}</p>
                        <p className="text-sm text-ink-500 dark:text-ink-400">{login.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-mono text-sm text-ink-600 dark:text-ink-300">{login.ipAddress}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm text-ink-600 dark:text-ink-300">{login.location}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-ink-600 dark:text-ink-300 capitalize">{login.method.replace("_", " ")}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[login.status])}>
                        {login.status.charAt(0).toUpperCase() + login.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("px-2 py-1 text-xs font-medium rounded-full", riskColors[login.riskLevel])}>
                        {login.riskLevel.charAt(0).toUpperCase() + login.riskLevel.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-ink-500 dark:text-ink-400">
                      {formatDateTime(login.timestamp, locale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {/* Active Sessions Tab */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-ink-600 dark:text-ink-300">{activeSessions.length} active session(s)</p>
            <button
              onClick={handleRevokeAllSessions}
              className="flex items-center gap-2 px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
            >
              <LogOut className="w-4 h-4" />
              Revoke All Other Sessions
            </button>
          </div>

          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div key={session.id} className={cn(
                "bg-white dark:bg-ink-900 rounded-xl border p-4",
                session.isCurrentSession && "border-blue-200 bg-blue-50"
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-ink-100 dark:bg-ink-800 rounded-lg">
                      {session.device.includes("iPhone") || session.device.includes("Samsung") ? (
                        <Smartphone className="w-6 h-6 text-ink-600 dark:text-ink-300" />
                      ) : (
                        <Monitor className="w-6 h-6 text-ink-600 dark:text-ink-300" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-ink-900 dark:text-ink-50">{session.userName}</p>
                        {session.isCurrentSession && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full dark:bg-blue-500/15 dark:text-blue-300">
                            Current Session
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-600 dark:text-ink-300">{session.device} · {session.browser}</p>
                      <p className="text-sm text-ink-500 dark:text-ink-400">{session.ipAddress} · {session.location}</p>
                      <p className="text-xs text-ink-400 dark:text-ink-500 mt-1">
                        Last active: {formatDateTime(session.lastActive, locale)}
                      </p>
                    </div>
                  </div>
                  {!session.isCurrentSession && (
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="text-red-500 hover:text-red-600"
                      title="Revoke Session"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security Settings Tab */}
      {activeTab === "settings" && (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-6">
          <h3 className="text-lg font-semibold mb-6">Security Settings</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between py-4 border-b border-ink-100 dark:border-ink-800">
              <div>
                <p className="font-medium text-ink-900 dark:text-ink-50">Two-Factor Authentication (2FA)</p>
                <p className="text-sm text-ink-500 dark:text-ink-400">Add an extra layer of security to your account</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={settings.twoFactorEnabled} readOnly />
                <div className="w-11 h-6 bg-ink-200 dark:bg-ink-800 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-ink-300 dark:after:border-ink-700 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-4 border-b border-ink-100 dark:border-ink-800">
              <div>
                <p className="font-medium text-ink-900 dark:text-ink-50">Password Last Changed</p>
                <p className="text-sm text-ink-500 dark:text-ink-400">Last updated: {formatDate(settings.passwordLastChanged, locale)}</p>
              </div>
              <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                Change Password
              </button>
            </div>
            <div className="flex items-center justify-between py-4 border-b border-ink-100 dark:border-ink-800">
              <div>
                <p className="font-medium text-ink-900 dark:text-ink-50">Session Timeout</p>
                <p className="text-sm text-ink-500 dark:text-ink-400">Automatically log out after inactivity</p>
              </div>
              <select className="px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="15">15 minutes</option>
                <option value="30" selected>30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </div>
            <div className="flex items-center justify-between py-4 border-b border-ink-100 dark:border-ink-800">
              <div>
                <p className="font-medium text-ink-900 dark:text-ink-50">Max Login Attempts</p>
                <p className="text-sm text-ink-500 dark:text-ink-400">Lock account after failed attempts</p>
              </div>
              <select className="px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="3">3 attempts</option>
                <option value="5" selected>5 attempts</option>
                <option value="10">10 attempts</option>
              </select>
            </div>
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-ink-900 dark:text-ink-50">IP Whitelist</p>
                <p className="text-sm text-ink-500 dark:text-ink-400">Restrict access to specific IP addresses</p>
              </div>
              <button className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                Manage IPs ({settings.ipWhitelist.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Tab */}
      {activeTab === "api" && (
        <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">API Keys</h3>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Key className="w-4 h-4" />
              Generate New Key
            </button>
          </div>
          <div className="space-y-4">
            {[
              { name: "Production API Key", key: "wa_prod_••••••••••••••••", created: "2025-01-01", lastUsed: "2025-01-17", scopes: ["read", "write"] },
              { name: "Development API Key", key: "wa_dev_••••••••••••••••", created: "2025-01-10", lastUsed: "2025-01-16", scopes: ["read"] },
              { name: "Webhook Secret", key: "whsec_••••••••••••••••", created: "2025-01-15", lastUsed: "2025-01-17", scopes: ["webhooks"] },
            ].map((apiKey, i) => (
              <div key={i} className="flex items-center justify-between p-4 border border-ink-200 dark:border-ink-800 rounded-lg">
                <div>
                  <p className="font-medium text-ink-900 dark:text-ink-50">{apiKey.name}</p>
                  <p className="font-mono text-sm text-ink-500 dark:text-ink-400">{apiKey.key}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-ink-400 dark:text-ink-500">Created: {apiKey.created}</span>
                    <span className="text-xs text-ink-400 dark:text-ink-500">Last used: {apiKey.lastUsed}</span>
                    <div className="flex gap-1">
                      {apiKey.scopes.map((scope) => (
                        <span key={scope} className="px-1.5 py-0.5 text-xs bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300 rounded">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="text-ink-400 dark:text-ink-500 hover:text-ink-600 dark:hover:text-ink-300" title="Copy">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button className="text-red-500 hover:text-red-600" title="Revoke">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
