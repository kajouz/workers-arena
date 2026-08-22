"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  FileText,
  Plus,
  Clock,
  Send,
  CheckCircle,
  XCircle,
  Calendar,
  Users,
  BarChart3,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Download,
  Mail,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface ReportSchedule {
  id: string;
  name: string;
  description: string;
  type: "daily" | "weekly" | "monthly";
  recipients: string[];
  format: "pdf" | "csv" | "excel";
  sections: string[];
  lastSent?: string;
  nextScheduled: string;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

interface ReportHistory {
  id: string;
  scheduleId: string;
  scheduleName: string;
  sentAt: string;
  recipientCount: number;
  format: string;
  status: "sent" | "failed" | "pending";
  fileSize?: string;
}

const typeLabels: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const formatColors: Record<string, string> = {
  pdf: "bg-red-100 text-red-800",
  csv: "bg-green-100 text-green-800",
  excel: "bg-blue-100 text-blue-800",
};

const statusColors: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
};

export function AutomatedReports() {
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [history, setHistory] = useState<ReportHistory[]>([]);
  const [activeTab, setActiveTab,] = useState<"schedules" | "history" | "create">("schedules");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: "",
    description: "",
    type: "weekly" as ReportSchedule["type"],
    recipients: "",
    format: "pdf" as ReportSchedule["format"],
    sections: [] as string[],
    dayOfWeek: "1",
    time: "09:00",
  });
  const [stats, setStats] = useState({
    totalSchedules: 0,
    activeSchedules: 0,
    reportsSent: 0,
    lastReportSent: "",
  });

  useEffect(() => {
    // Mock data
    setSchedules([
      {
        id: "1",
        name: "Weekly Revenue Summary",
        description: "Comprehensive revenue breakdown with trends and forecasts",
        type: "weekly",
        recipients: ["admin@workersarena.com", "finance@workersarena.com"],
        format: "pdf",
        sections: ["revenue_summary", "booking_stats", "new_workers", "churn_analysis"],
        lastSent: "2025-01-13T09:00:00Z",
        nextScheduled: "2025-01-20T09:00:00Z",
        isActive: true,
        createdAt: "2025-01-01T00:00:00Z",
        createdBy: "admin@workersarena.com",
      },
      {
        id: "2",
        name: "Daily Operations Report",
        description: "Daily summary of bookings, new registrations, and support tickets",
        type: "daily",
        recipients: ["admin@workersarena.com"],
        format: "csv",
        sections: ["bookings_summary", "new_registrations", "support_tickets"],
        lastSent: "2025-01-17T09:00:00Z",
        nextScheduled: "2025-01-18T09:00:00Z",
        isActive: true,
        createdAt: "2025-01-01T00:00:00Z",
        createdBy: "admin@workersarena.com",
      },
      {
        id: "3",
        name: "Monthly Analytics Report",
        description: "Detailed analytics including user growth, retention, and financial metrics",
        type: "monthly",
        recipients: ["admin@workersarena.com", "marketing@workersarena.com", "finance@workersarena.com"],
        format: "excel",
        sections: ["user_growth", "retention_analysis", "financial_summary", "marketing_performance", "worker_analytics"],
        lastSent: "2025-01-01T09:00:00Z",
        nextScheduled: "2025-02-01T09:00:00Z",
        isActive: true,
        createdAt: "2025-01-01T00:00:00Z",
        createdBy: "admin@workersarena.com",
      },
      {
        id: "4",
        name: "Worker Performance Report",
        description: "Weekly worker performance metrics and rankings",
        type: "weekly",
        recipients: ["admin@workersarena.com"],
        format: "pdf",
        sections: ["worker_rankings", "completion_rates", "rating_trends"],
        lastSent: "2025-01-13T09:00:00Z",
        nextScheduled: "2025-01-20T09:00:00Z",
        isActive: false,
        createdAt: "2025-01-10T00:00:00Z",
        createdBy: "admin@workersarena.com",
      },
    ]);

    setHistory([
      {
        id: "1",
        scheduleId: "1",
        scheduleName: "Weekly Revenue Summary",
        sentAt: "2025-01-13T09:00:00Z",
        recipientCount: 2,
        format: "pdf",
        status: "sent",
        fileSize: "2.4 MB",
      },
      {
        id: "2",
        scheduleId: "2",
        scheduleName: "Daily Operations Report",
        sentAt: "2025-01-17T09:00:00Z",
        recipientCount: 1,
        format: "csv",
        status: "sent",
        fileSize: "156 KB",
      },
      {
        id: "3",
        scheduleId: "2",
        scheduleName: "Daily Operations Report",
        sentAt: "2025-01-16T09:00:00Z",
        recipientCount: 1,
        format: "csv",
        status: "sent",
        fileSize: "148 KB",
      },
      {
        id: "4",
        scheduleId: "3",
        scheduleName: "Monthly Analytics Report",
        sentAt: "2025-01-01T09:00:00Z",
        recipientCount: 3,
        format: "excel",
        status: "sent",
        fileSize: "5.8 MB",
      },
      {
        id: "5",
        scheduleId: "2",
        scheduleName: "Daily Operations Report",
        sentAt: "2025-01-15T09:00:00Z",
        recipientCount: 1,
        format: "csv",
        status: "failed",
      },
    ]);

    setStats({
      totalSchedules: 4,
      activeSchedules: 3,
      reportsSent: 47,
      lastReportSent: "2025-01-17T09:00:00Z",
    });
  }, []);

  const filteredSchedules = schedules.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || s.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleCreateSchedule = () => {
    if (!newSchedule.name || !newSchedule.recipients) return;
    
    const schedule: ReportSchedule = {
      id: Date.now().toString(),
      name: newSchedule.name,
      description: newSchedule.description,
      type: newSchedule.type,
      recipients: newSchedule.recipients.split(",").map((r) => r.trim()),
      format: newSchedule.format,
      sections: newSchedule.sections,
      nextScheduled: new Date().toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
      createdBy: "admin@workersarena.com",
    };
    
    setSchedules([schedule, ...schedules]);
    setShowCreateModal(false);
    setNewSchedule({
      name: "", description: "", type: "weekly", recipients: "", format: "pdf",
      sections: [], dayOfWeek: "1", time: "09:00",
    });
  };

  const handleToggleActive = (id: string) => {
    setSchedules(schedules.map((s) => s.id === id ? { ...s, isActive: !s.isActive } : s));
  };

  const handleDeleteSchedule = (id: string) => {
    if (confirm("Are you sure you want to delete this schedule?")) {
      setSchedules(schedules.filter((s) => s.id !== id));
    }
  };

  const handleSendNow = (id: string) => {
    const schedule = schedules.find((s) => s.id === id);
    if (!schedule) return;
    
    const newHistory: ReportHistory = {
      id: Date.now().toString(),
      scheduleId: id,
      scheduleName: schedule.name,
      sentAt: new Date().toISOString(),
      recipientCount: schedule.recipients.length,
      format: schedule.format,
      status: "sent",
      fileSize: "1.2 MB",
    };
    
    setHistory([newHistory, ...history]);
    setSchedules(schedules.map((s) =>
      s.id === id ? { ...s, lastSent: new Date().toISOString() } : s
    ));
  };

  const reportSections = [
    { id: "revenue_summary", label: "Revenue Summary" },
    { id: "booking_stats", label: "Booking Statistics" },
    { id: "new_workers", label: "New Worker Registrations" },
    { id: "churn_analysis", label: "Churn Analysis" },
    { id: "user_growth", label: "User Growth" },
    { id: "retention_analysis", label: "Retention Analysis" },
    { id: "financial_summary", label: "Financial Summary" },
    { id: "marketing_performance", label: "Marketing Performance" },
    { id: "worker_analytics", label: "Worker Analytics" },
    { id: "support_tickets", label: "Support Tickets" },
    { id: "worker_rankings", label: "Worker Rankings" },
    { id: "completion_rates", label: "Completion Rates" },
    { id: "rating_trends", label: "Rating Trends" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalSchedules}</p>
              <p className="text-sm text-gray-500">Total Schedules</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.activeSchedules}</p>
              <p className="text-sm text-gray-500">Active</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Send className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.reportsSent}</p>
              <p className="text-sm text-gray-500">Reports Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {stats.lastReportSent ? new Date(stats.lastReportSent).toLocaleDateString() : "Never"}
              </p>
              <p className="text-sm text-gray-500">Last Sent</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("schedules")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "schedules"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            Schedules
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
            History
          </button>
        </nav>
      </div>

      {/* Schedules Tab */}
      {activeTab === "schedules" && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search schedules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Schedule
            </button>
          </div>

          {/* Schedules List */}
          <div className="space-y-4">
            {filteredSchedules.map((schedule) => (
              <div key={schedule.id} className={cn(
                "bg-white rounded-xl border p-4 transition-all",
                schedule.isActive ? "border-gray-200 hover:shadow-md" : "border-gray-100 opacity-60"
              )}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{schedule.name}</h3>
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", formatColors[schedule.format])}>
                        {schedule.format.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        {typeLabels[schedule.type]}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{schedule.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSendNow(schedule.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Send Now"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleActive(schedule.id)}
                      className={cn(
                        "px-3 py-1 text-xs font-medium rounded-full",
                        schedule.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      )}
                    >
                      {schedule.isActive ? "Active" : "Paused"}
                    </button>
                    <button
                      onClick={() => handleDeleteSchedule(schedule.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Recipients</p>
                    <p className="font-medium">{schedule.recipients.length}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Last Sent</p>
                    <p className="font-medium">
                      {schedule.lastSent ? new Date(schedule.lastSent).toLocaleDateString() : "Never"}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Next Scheduled</p>
                    <p className="font-medium">{new Date(schedule.nextScheduled).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Sections</p>
                    <p className="font-medium">{schedule.sections.length} included</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1">
                  {schedule.sections.map((section) => (
                    <span key={section} className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                      {section.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Report</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Sent At</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Recipients</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Format</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Size</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {history.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <p className="font-medium text-gray-900">{item.scheduleName}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {new Date(item.sentAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {item.recipientCount}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", formatColors[item.format])}>
                      {item.format.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {item.fileSize || "—"}
                  </td>
                  <td className="px-4 py-4">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[item.status])}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <button className="text-gray-400 hover:text-gray-600" title="Download">
                        <Download className="w-4 h-4" />
                      </button>
                      <button className="text-gray-400 hover:text-gray-600" title="View">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Report Schedule</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Name</label>
                <input
                  type="text"
                  value={newSchedule.name}
                  onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  placeholder="e.g., Weekly Revenue Summary"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newSchedule.description}
                  onChange={(e) => setNewSchedule({ ...newSchedule, description: e.target.value })}
                  placeholder="Brief description of this report"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
                  <select
                    value={newSchedule.type}
                    onChange={(e) => setNewSchedule({ ...newSchedule, type: e.target.value as ReportSchedule["type"] })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
                  <select
                    value={newSchedule.format}
                    onChange={(e) => setNewSchedule({ ...newSchedule, format: e.target.value as ReportSchedule["format"] })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="pdf">PDF</option>
                    <option value="csv">CSV</option>
                    <option value="excel">Excel</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Recipients (comma-separated)</label>
                <input
                  type="text"
                  value={newSchedule.recipients}
                  onChange={(e) => setNewSchedule({ ...newSchedule, recipients: e.target.value })}
                  placeholder="admin@workersarena.com, finance@workersarena.com"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report Sections</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {reportSections.map((section) => (
                    <label key={section.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newSchedule.sections.includes(section.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewSchedule({ ...newSchedule, sections: [...newSchedule.sections, section.id] });
                          } else {
                            setNewSchedule({ ...newSchedule, sections: newSchedule.sections.filter((s) => s !== section.id) });
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{section.label}</span>
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
                  onClick={handleCreateSchedule}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
