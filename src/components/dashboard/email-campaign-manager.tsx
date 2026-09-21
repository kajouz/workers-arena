"use client";

import { useState, useEffect } from "react";
import { cn, formatNumber } from "@/lib/utils";
import {
  Mail,
  Send,
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  BarChart3,
  Plus,
  Search,
  Filter,
  Download,
  Calendar,
  FileText,
  Target,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

interface EmailCampaign {
  id: string;
  name: string;
  subject: string;
  content: string;
  targetSegment: "all" | "workers" | "customers" | "inactive" | "premium";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduledAt?: string;
  sentAt?: string;
  recipientCount: number;
  openRate?: number;
  clickRate?: number;
  createdAt: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  preview: string;
  category: "welcome" | "booking" | "promo" | "newsletter" | "custom";
}

const segmentLabels: Record<string, string> = {
  all: "All Users",
  workers: "Workers Only",
  customers: "Customers Only",
  inactive: "Inactive Users (30+ days)",
  premium: "Premium Workers",
};

const statusColors: Record<string, string> = {
  draft: "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  sending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300",
  sent: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
};

export function EmailCampaignManager() {
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<"campaigns" | "templates" | "create">("campaigns");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: "",
    subject: "",
    content: "",
    targetSegment: "all" as EmailCampaign["targetSegment"],
    scheduledAt: "",
  });
  const [stats, setStats] = useState({
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    avgOpenRate: 0,
    avgClickRate: 0,
  });

  useEffect(() => {
    // Mock data
    setCampaigns([
      {
        id: "1",
        name: "Welcome New Workers",
        subject: "Welcome to WorkersArena! Get Started Today",
        content: "We're excited to have you on board...",
        targetSegment: "workers",
        status: "sent",
        sentAt: "2025-01-15T10:00:00Z",
        recipientCount: 156,
        openRate: 68.5,
        clickRate: 23.4,
        createdAt: "2025-01-14T09:00:00Z",
      },
      {
        id: "2",
        name: "January Promo - 20% Off",
        subject: "🎉 Get 20% Off Your First Booking!",
        content: "Limited time offer...",
        targetSegment: "customers",
        status: "sent",
        sentAt: "2025-01-10T14:00:00Z",
        recipientCount: 892,
        openRate: 45.2,
        clickRate: 18.7,
        createdAt: "2025-01-09T11:00:00Z",
      },
      {
        id: "3",
        name: "Re-engagement Campaign",
        subject: "We miss you! Come back for exclusive offers",
        content: "It's been a while...",
        targetSegment: "inactive",
        status: "scheduled",
        scheduledAt: "2025-01-20T09:00:00Z",
        recipientCount: 234,
        createdAt: "2025-01-16T15:00:00Z",
      },
      {
        id: "4",
        name: "Premium Worker Perks",
        subject: "Exclusive Benefits for Our Premium Workers",
        content: "As a valued premium member...",
        targetSegment: "premium",
        status: "draft",
        recipientCount: 45,
        createdAt: "2025-01-17T08:00:00Z",
      },
    ]);

    setTemplates([
      { id: "1", name: "Welcome Email", subject: "Welcome to {{app_name}}!", preview: "Get started with your account...", category: "welcome" },
      { id: "2", name: "Booking Confirmation", subject: "Your booking is confirmed! 🎉", preview: "Booking details for {{service}}...", category: "booking" },
      { id: "3", name: "Promotional Offer", subject: "Exclusive deal just for you!", preview: "Save {{discount}}% on your next booking...", category: "promo" },
      { id: "4", name: "Weekly Newsletter", subject: "This week on WorkersArena", preview: "Top workers, tips, and news...", category: "newsletter" },
    ]);

    setStats({
      totalSent: 2847,
      totalOpened: 1423,
      totalClicked: 523,
      avgOpenRate: 52.3,
      avgClickRate: 18.4,
    });
  }, []);

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.subject.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const handleCreateCampaign = () => {
    if (!newCampaign.name || !newCampaign.subject || !newCampaign.content) return;
    
    const campaign: EmailCampaign = {
      id: Date.now().toString(),
      ...newCampaign,
      status: "draft",
      recipientCount: 0,
      createdAt: new Date().toISOString(),
    };
    
    setCampaigns([campaign, ...campaigns]);
    setShowCreateModal(false);
    setNewCampaign({ name: "", subject: "", content: "", targetSegment: "all", scheduledAt: "" });
  };

  const handleSendCampaign = (id: string) => {
    setCampaigns(campaigns.map((c) =>
      c.id === id ? { ...c, status: "sending" as const } : c
    ));
    // Simulate sending
    setTimeout(() => {
      setCampaigns(campaigns.map((c) =>
        c.id === id ? { ...c, status: "sent" as const, sentAt: new Date().toISOString() } : c
      ));
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{formatNumber(stats.totalSent)}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Total Sent</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Eye className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{formatNumber(stats.totalOpened)}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Opened</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{formatNumber(stats.totalClicked)}</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Clicked</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <BarChart3 className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.avgOpenRate}%</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Avg Open Rate</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 rounded-lg">
              <Target className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-ink-900 dark:text-ink-50">{stats.avgClickRate}%</p>
              <p className="text-sm text-ink-500 dark:text-ink-400">Avg Click Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-ink-200 dark:border-ink-800">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab("campaigns")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "campaigns"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <Mail className="w-4 h-4 inline mr-2" />
            Campaigns
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={cn(
              "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
              activeTab === "templates"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
            )}
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Templates
          </button>
        </nav>
      </div>

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-400 dark:text-ink-500" />
              <input
                type="text"
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              New Campaign
            </button>
          </div>

          {/* Campaign List */}
          <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-ink-50 dark:bg-ink-950">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Campaign</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Segment</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Recipients</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Performance</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-ink-600 dark:text-ink-300">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                {filteredCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="hover:bg-ink-50 dark:hover:bg-ink-950">
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-medium text-ink-900 dark:text-ink-50">{campaign.name}</p>
                        <p className="text-sm text-ink-500 dark:text-ink-400 truncate max-w-xs">{campaign.subject}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-ink-600 dark:text-ink-300">{segmentLabels[campaign.targetSegment]}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[campaign.status])}>
                        {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-ink-600 dark:text-ink-300">
                      {formatNumber(campaign.recipientCount)}
                    </td>
                    <td className="px-4 py-4">
                      {campaign.openRate !== undefined ? (
                        <div className="text-sm">
                          <span className="text-green-600">{campaign.openRate}% open</span>
                          <span className="text-ink-400 dark:text-ink-500 mx-1">·</span>
                          <span className="text-blue-600">{campaign.clickRate}% click</span>
                        </div>
                      ) : (
                        <span className="text-sm text-ink-400 dark:text-ink-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {campaign.status === "draft" && (
                          <button
                            onClick={() => handleSendCampaign(campaign.id)}
                            className="text-green-600 hover:text-green-700"
                            title="Send Now"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button className="text-ink-400 dark:text-ink-500 hover:text-ink-600 dark:hover:text-ink-300" title="View Details">
                          <Eye className="w-4 h-4" />
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

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {templates.map((template) => (
            <div key={template.id} className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <span className={cn(
                  "px-2 py-1 text-xs font-medium rounded-full",
                  template.category === "welcome" ? "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" :
                  template.category === "booking" ? "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" :
                  template.category === "promo" ? "bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300" :
                  "bg-ink-100 dark:bg-ink-800 text-ink-800 dark:text-ink-100"
                )}>
                  {template.category}
                </span>
              </div>
              <h4 className="font-medium text-ink-900 dark:text-ink-50 mb-1">{template.name}</h4>
              <p className="text-sm text-ink-500 dark:text-ink-400 mb-2">{template.subject}</p>
              <p className="text-xs text-ink-400 dark:text-ink-500 line-clamp-2">{template.preview}</p>
              <button className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
                Use Template →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-dialog">
          <div className="bg-white dark:bg-ink-900 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create New Campaign</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-ink-400 dark:text-ink-500 hover:text-ink-600 dark:hover:text-ink-300">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  placeholder="e.g., January Welcome Campaign"
                  className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Subject Line</label>
                <input
                  type="text"
                  value={newCampaign.subject}
                  onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })}
                  placeholder="e.g., Welcome to WorkersArena! 🎉"
                  className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Target Segment</label>
                <select
                  value={newCampaign.targetSegment}
                  onChange={(e) => setNewCampaign({ ...newCampaign, targetSegment: e.target.value as EmailCampaign["targetSegment"] })}
                  className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(segmentLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Email Content</label>
                <textarea
                  value={newCampaign.content}
                  onChange={(e) => setNewCampaign({ ...newCampaign, content: e.target.value })}
                  rows={6}
                  placeholder="Write your email content here..."
                  className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mb-1">Schedule (Optional)</label>
                <input
                  type="datetime-local"
                  value={newCampaign.scheduledAt}
                  onChange={(e) => setNewCampaign({ ...newCampaign, scheduledAt: e.target.value })}
                  className="w-full px-3 py-2 border border-ink-200 dark:border-ink-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-ink-600 dark:text-ink-300 hover:text-ink-800 dark:hover:text-ink-100"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCampaign}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Campaign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
