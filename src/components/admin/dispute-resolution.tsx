"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Search,
  Filter,
  Clock,
  User,
  DollarSign,
  CheckCircle,
  XCircle,
  MessageSquare,
  FileText,
  Shield,
  ArrowRight,
  Eye,
  Scale,
  AlertCircle,
} from "lucide-react";

interface Dispute {
  id: string;
  number: string;
  bookingNumber: string;
  type: "no_show" | "quality" | "damage" | "overcharge" | "cancellation" | "other";
  status: "open" | "investigating" | "awaiting_evidence" | "resolved" | "escalated";
  priority: "low" | "medium" | "high";
  filedBy: "customer" | "worker";
  filerName: string;
  filerId: string;
  respondentName: string;
  respondentId: string;
  subject: string;
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  deadline: string;
  resolution?: string;
  refundAmount?: number;
  evidence: EvidenceItem[];
  messages: DisputeMessage[];
}

interface EvidenceItem {
  id: string;
  type: "photo" | "document" | "message" | "other";
  url: string;
  description: string;
  submittedBy: string;
  submittedAt: string;
}

interface DisputeMessage {
  id: string;
  senderType: "admin" | "customer" | "worker";
  senderName: string;
  message: string;
  createdAt: string;
}

const typeLabels: Record<string, string> = {
  no_show: "No Show",
  quality: "Quality Issue",
  damage: "Property Damage",
  overcharge: "Overcharge",
  cancellation: "Cancellation",
  other: "Other",
};

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  investigating: "bg-blue-100 text-blue-800",
  awaiting_evidence: "bg-purple-100 text-purple-800",
  resolved: "bg-green-100 text-green-800",
  escalated: "bg-red-100 text-red-800",
};

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-red-100 text-red-800",
};

export function DisputeResolution() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    resolved: 0,
    avgResolutionDays: 0,
    totalRefunded: 0,
  });

  useEffect(() => {
    // Mock data
    setDisputes([
      {
        id: "1",
        number: "DP-1001",
        bookingNumber: "BK-1002",
        type: "no_show",
        status: "open",
        priority: "high",
        filedBy: "customer",
        filerName: "Ahmad Hassan",
        filerId: "c1",
        respondentName: "Khaled Al Harbi",
        respondentId: "w1",
        subject: "Worker didn't show up for scheduled appointment",
        description: "The plumber was scheduled for 10 AM but never arrived. I waited for 2 hours.",
        amount: 5000,
        currency: "USD",
        createdAt: "2025-01-17T12:00:00Z",
        updatedAt: "2025-01-17T12:00:00Z",
        deadline: "2025-01-24T12:00:00Z",
        evidence: [],
        messages: [],
      },
      {
        id: "2",
        number: "DP-1002",
        bookingNumber: "BK-0998",
        type: "quality",
        status: "investigating",
        priority: "medium",
        filedBy: "customer",
        filerName: "Sara Ali",
        filerId: "c2",
        respondentName: "Ali Hassan",
        respondentId: "w2",
        subject: "Poor quality work - paint peeling after 1 week",
        description: "The painting job started peeling after just one week. This is not acceptable quality.",
        amount: 15000,
        currency: "USD",
        createdAt: "2025-01-15T10:00:00Z",
        updatedAt: "2025-01-16T14:00:00Z",
        deadline: "2025-01-22T10:00:00Z",
        evidence: [
          {
            id: "e1",
            type: "photo",
            url: "/evidence/photo1.jpg",
            description: "Photo of peeling paint",
            submittedBy: "Sara Ali",
            submittedAt: "2025-01-15T10:30:00Z",
          },
        ],
        messages: [
          {
            id: "dm1",
            senderType: "admin",
            senderName: "Admin",
            message: "We are reviewing the evidence. Worker has been contacted.",
            createdAt: "2025-01-16T14:00:00Z",
          },
        ],
      },
      {
        id: "3",
        number: "DP-1003",
        bookingNumber: "BK-0995",
        type: "overcharge",
        status: "resolved",
        priority: "medium",
        filedBy: "customer",
        filerName: "Omar Khalil",
        filerId: "c3",
        respondentName: "Bilal Mansour",
        respondentId: "w3",
        subject: "Charged more than agreed quote",
        description: "The final bill was $200 but the agreed quote was $150.",
        amount: 20000,
        currency: "USD",
        createdAt: "2025-01-10T09:00:00Z",
        updatedAt: "2025-01-12T16:00:00Z",
        deadline: "2025-01-17T09:00:00Z",
        resolution: "Refund of $50 issued to customer. Worker warned about quote adherence.",
        refundAmount: 5000,
        evidence: [],
        messages: [],
      },
    ]);

    setStats({
      total: 45,
      open: 8,
      resolved: 32,
      avgResolutionDays: 3.5,
      totalRefunded: 2500,
    });
  }, []);

  const filteredDisputes = disputes.filter((d) => {
    const matchesSearch = d.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.filerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || d.status === filterStatus;
    const matchesType = filterType === "all" || d.type === filterType;
    return matchesSearch && matchesStatus && matchesType;
  });

  const handleResolveDispute = (id: string, resolution: string, refundAmount: number) => {
    setDisputes(disputes.map((d) =>
      d.id === id
        ? {
            ...d,
            status: "resolved",
            resolution,
            refundAmount,
            updatedAt: new Date().toISOString(),
          }
        : d
    ));
    setSelectedDispute(null);
  };

  const handleEscalateDispute = (id: string) => {
    setDisputes(disputes.map((d) =>
      d.id === id
        ? { ...d, status: "escalated", updatedAt: new Date().toISOString() }
        : d
    ));
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Disputes</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-yellow-600">{stats.open}</p>
          <p className="text-sm text-gray-500">Open</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-green-600">{stats.resolved}</p>
          <p className="text-sm text-gray-500">Resolved</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{stats.avgResolutionDays} days</p>
          <p className="text-sm text-gray-500">Avg Resolution</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-blue-600">${stats.totalRefunded}</p>
          <p className="text-sm text-gray-500">Total Refunded</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search disputes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="investigating">Investigating</option>
          <option value="awaiting_evidence">Awaiting Evidence</option>
          <option value="resolved">Resolved</option>
          <option value="escalated">Escalated</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg"
        >
          <option value="all">All Types</option>
          <option value="no_show">No Show</option>
          <option value="quality">Quality Issue</option>
          <option value="damage">Property Damage</option>
          <option value="overcharge">Overcharge</option>
          <option value="cancellation">Cancellation</option>
        </select>
      </div>

      {/* Disputes Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Dispute</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Type</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Filed By</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Against</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Deadline</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredDisputes.map((dispute) => (
              <tr
                key={dispute.id}
                onClick={() => setSelectedDispute(dispute)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-4 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{dispute.number}</p>
                    <p className="text-sm text-gray-500 truncate max-w-xs">{dispute.subject}</p>
                  </div>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">{typeLabels[dispute.type]}</td>
                <td className="px-4 py-4 text-sm text-gray-600">{dispute.filerName}</td>
                <td className="px-4 py-4 text-sm text-gray-600">{dispute.respondentName}</td>
                <td className="px-4 py-4">
                  <span className={cn("px-2 py-1 text-xs font-medium rounded-full", statusColors[dispute.status])}>
                    {dispute.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="px-4 py-4 text-sm text-gray-600">
                  {new Date(dispute.deadline).toLocaleDateString()}
                </td>
                <td className="px-4 py-4">
                  <button className="text-blue-600 hover:text-blue-700">
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dispute Detail Modal */}
      {selectedDispute && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedDispute.number} - {selectedDispute.subject}</h3>
                <p className="text-sm text-gray-500">Booking: {selectedDispute.bookingNumber}</p>
              </div>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium">{typeLabels[selectedDispute.type]}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="font-medium">${selectedDispute.amount}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Filed By</p>
                  <p className="font-medium">{selectedDispute.filerName} ({selectedDispute.filedBy})</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Against</p>
                  <p className="font-medium">{selectedDispute.respondentName}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-1">Description</p>
                <p className="text-gray-700">{selectedDispute.description}</p>
              </div>

              {selectedDispute.resolution && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-800 mb-1">Resolution</p>
                  <p className="text-green-700">{selectedDispute.resolution}</p>
                  {selectedDispute.refundAmount && (
                    <p className="text-sm text-green-600 mt-2">
                      Refund: ${selectedDispute.refundAmount}
                    </p>
                  )}
                </div>
              )}

              {selectedDispute.evidence.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Evidence</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedDispute.evidence.map((item) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-2">
                        <div className="aspect-video bg-gray-100 rounded flex items-center justify-center">
                          <FileText className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-xs text-gray-500 mt-1 truncate">{item.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedDispute.messages.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Messages</p>
                  <div className="space-y-2">
                    {selectedDispute.messages.map((msg) => (
                      <div key={msg.id} className="bg-gray-50 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-900">{msg.senderName}</p>
                        <p className="text-sm text-gray-700 mt-1">{msg.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(msg.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedDispute.status !== "resolved" && (
              <div className="p-4 border-t border-gray-200 flex items-center justify-between">
                <button
                  onClick={() => handleEscalateDispute(selectedDispute.id)}
                  className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  Escalate
                </button>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Refund amount"
                    className="w-32 px-3 py-2 border border-gray-200 rounded-lg"
                  />
                  <button
                    onClick={() => handleResolveDispute(selectedDispute.id, "Issue resolved", 0)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
