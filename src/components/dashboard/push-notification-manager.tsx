"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Bell,
  Send,
  Users,
  Smartphone,
  CheckCircle,
  XCircle,
  Eye,
  BarChart3,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  Target,
  TrendingUp,
  AlertCircle,
  Settings,
  Trash2,
} from "lucide-react";

interface PushNotification {
  id: string;
  title: string;
  body: string;
  icon?: string;
  url?: string;
  targetSegment: "all" | "workers" | "customers" | "active" | "inactive";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduledAt?: string;
  sentAt?: string;
  recipientCount: number;
  deliveryRate?: number;
  openRate?: number;
  createdAt: string;
}

interface PushSubscription {
  endpoint: string;
  userAgent: string;
  platform: string;
  lastActive: string;
  isActive: boolean;
}

const segmentLabels: Record<string, string> = {
  all: "All Subscribers",
  workers: "Workers Only",
  customers: "Customers Only",
  active: "Active Users (7 days)",
  inactive: "Inactive Users (30+ days)",
};

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  scheduled: "bg-blue-100 text-blue-800",
  sending: "bg-yellow-100 text-yellow-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export function PushNotificationManager() {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [subscriptions, setSubscriptions] = useState<PushSubscription[]>([]);
  const [activeTab, setActiveTab] = useState<"notifications" | "subscribers" | "settings">("notifications");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNotification, setNewNotification] = useState({
    title: "",
    body: "",
    url: "",
    targetSegment: "all" as PushNotification["targetSegment"],
    scheduledAt: "",
  });
  const [stats, setStats] = useState({
    totalSubscribers: 0,
    totalSent: 0,
    avgDeliveryRate: 0,
    avgOpenRate: 0,
  });

  useEffect(() => {
    // Mock data
    setNotifications([
      {
        id: "1",
        title: "New Booking Request! 📋",
        body: "You have a new booking request for Plumbing service",
        url: "/dashboard/bookings",
        targetSegment: "workers",
        status: "sent",
        sentAt: "2025-01-17T10:00:00Z",
        recipientCount: 156,
        deliveryRate: 98.5,
        openRate: 45.2,
        createdAt: "2025-01-17T09:55:00Z",
      },
      {
        id: "2",
        title: "Weekend Special - 30% Off! 🎉",
        body: "Book any service this weekend and save 30%",
        url: "/search",
        targetSegment: "customers",
        status: "sent",
        sentAt: "2025-01-16T09:00:00Z",
        recipientCount: 892,
        deliveryRate: 97.8,
        openRate: 32.1,
        createdAt: "2025-01-15T16:00:00Z",
      },
      {
        id: "3",
        title: "Payment Received! 💰",
        body: "Your payment of $45 has been processed",
        targetSegment: "workers",
        status: "scheduled",
        scheduledAt: "2025-01-18T08:00:00Z",
        recipientCount: 45,
        createdAt: "2025-01-17T11:00:00Z",
      },
      {
        id: "4",
        title: "Session Expiring Soon",
        body: "Your booking session will expire in 30 minutes",
        targetSegment: "active",
        status: "draft",
        recipientCount: 23,
        createdAt: "2025-01-17T14:00:00Z",
      },
    ]);

    setSubscriptions([
      { endpoint: "https://fcm.googleapis.com/.../abc123", userAgent: "iPhone 15 Pro", platform: "iOS", lastActive: "2025-01-17T10:30:00Z", isActive: true },
      { endpoint: "https://fcm.googleapis.com/.../def456", userAgent: "Samsung Galaxy S24", platform: "Android", lastActive: "2025-01-17T09:15:00Z", isActive: true },
      { endpoint: "https://fcm.googleapis.com/.../ghi789", userAgent: "Chrome 121", platform: "Web", lastActive: "2025-01-17T08:00:00Z", isActive: true },
      { endpoint: "https://fcm.googleapis.com/.../jkl012", userAgent: "iPhone 14", platform: "iOS", lastActive: "2025-01-15T14:00:00Z", isActive: false },
    ]);

    setStats({
      totalSubscribers: 1247,
      totalSent: 4523,
      avgDeliveryRate: 98.2,
      avgOpenRate: 38.5,
    });
  }, []);

  const filteredNotifications = notifications.filter((n) => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.body.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || n.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCreateNotification = () => {
    if (!newNotification.title || !newNotification.body) return;
    
    const notification: PushNotification = {
      id: Date.now().toString(),
      ...newNotification,
      status: "draft",
      recipientCount: 0,
      createdAt: new Date().toISOString(),
    };
    
    setNotifications([notification, ...notifications]);
    setShowCreateModal(false);
    setNewNotification({ title: "", body: "", url: "", targetSegment: "all", scheduledAt: "" });
  };

  const handleSendNotification = (id: string) => {
    setNotifications(notifications.map((n) =>
      n.id === id ? { ...n, status: "sending" as const } : n
    ));
    // Simulate sending
    setTimeout(() => {
      setNotifications(notifications.map((n) =>
        n.id === id ? { ...n, status: "sent" as const, sentAt: new Date().toISOString(), deliveryRate: 98, openRate: 35 } : n
      ));
    }, 2000);
  };

  const handleDeleteNotification = (id: string) => {
    if (confirm("Are you sure you want to delete this notification?")) {
      setNotifications(notifications.filter((n) => n.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Smartphone className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSubscribers.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Subscribers</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Send className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSent.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.avgDeliveryRate}%</p>
              <p className="text-sm text-gray-500">Delivery Rate</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Eye className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.avgOpenRate}%</p>
              <p className="text-sm text-gray-500">Open Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("notifications")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "notifications"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Bell className="w-4 h-4 inline mr-2" />
            Notifications
          </button>
          <button
            onClick={() => setActiveTab("subscribers")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "subscribers"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Subscribers
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "settings"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            Settings
          </button>
        </nav>
      </div>

      {/* Notifications Tab */}
      {activeTab === "notifications" && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search notifications..."
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
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="sending">Sending</option>
              <option value="sent">Sent</option>
              <option value="failed">Failed</option>
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Push
            </button>
          </div>

          {/* Notification List */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Notification</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Segment</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Recipients</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Performance</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredNotifications.map((notification) => (
                  <tr key={notification.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{notification.title}</p>
                        <p className="text-sm text-gray-500 truncate max-w-xs">{notification.body}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-gray-600">{segmentLabels[notification.targetSegment]}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[notification.status])}>
                        {notification.status.charAt(0).toUpperCase() + notification.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {notification.recipientCount.toLocaleString()}
                    </td>
                    <td className="px-4 py-4">
                      {notification.deliveryRate !== undefined ? (
                        <div className="text-sm">
                          <span className="text-green-600">{notification.deliveryRate}% delivered</span>
                          <span className="text-gray-400 mx-1">·</span>
                          <span className="text-blue-600">{notification.openRate}% opened</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {notification.status === "draft" && (
                          <button
                            onClick={() => handleSendNotification(notification.id)}
                            className="text-green-600 hover:text-green-700"
                            title="Send Now"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteNotification(notification.id)}
                          className="text-red-500 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscribers Tab */}
      {activeTab === "subscribers" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Device</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Platform</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Last Active</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {subscriptions.map((sub, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{sub.userAgent}</p>
                    <p className="text-xs text-gray-500 truncate max-w-xs">{sub.endpoint.substring(0, 50)}...</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn(
                      "px-2 py-1 text-xs font-medium rounded-full",
                      sub.platform === "iOS" ? "bg-gray-100 text-gray-800" :
                      sub.platform === "Android" ? "bg-green-100 text-green-800" :
                      "bg-blue-100 text-blue-800"
                    )}>
                      {sub.platform}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {new Date(sub.lastActive).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn(
                      "px-2 py-1 text-xs font-medium rounded-full",
                      sub.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                    )}>
                      {sub.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <button className="text-red-500 hover:text-red-600" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Push Notification Settings</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">Auto-send booking notifications</p>
                <p className="text-sm text-gray-500">Automatically notify workers of new bookings</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">Payment confirmation alerts</p>
                <p className="text-sm text-gray-500">Notify workers when payments are received</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="font-medium text-gray-900">Review reminder notifications</p>
                <p className="text-sm text-gray-500">Remind customers to leave reviews after booking</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="font-medium text-gray-900">Quiet hours</p>
                <p className="text-sm text-gray-500">Don&apos;t send notifications between 10 PM and 8 AM</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Push Notification</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newNotification.title}
                  onChange={(e) => setNewNotification({ ...newNotification, title: e.target.value })}
                  placeholder="e.g., New Booking Alert! 📋"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={newNotification.body}
                  onChange={(e) => setNewNotification({ ...newNotification, body: e.target.value })}
                  rows={3}
                  placeholder="Write your notification message..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Deep Link URL (Optional)</label>
                <input
                  type="text"
                  value={newNotification.url}
                  onChange={(e) => setNewNotification({ ...newNotification, url: e.target.value })}
                  placeholder="e.g., /dashboard/bookings"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Segment</label>
                <select
                  value={newNotification.targetSegment}
                  onChange={(e) => setNewNotification({ ...newNotification, targetSegment: e.target.value as PushNotification["targetSegment"] })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(segmentLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (Optional)</label>
                <input
                  type="datetime-local"
                  value={newNotification.scheduledAt}
                  onChange={(e) => setNewNotification({ ...newNotification, scheduledAt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateNotification}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Notification
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
