"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Headphones,
  Plus,
  Search,
  Filter,
  Clock,
  User,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  Tag,
  ArrowRight,
  Timer,
  Eye,
  Edit,
  Send,
} from "lucide-react";

interface Ticket {
  id: string;
  number: string;
  subject: string;
  description: string;
  category: "booking" | "payment" | "account" | "technical" | "other";
  priority: "low" | "medium" | "high" | "urgent";
  status: "open" | "in_progress" | "waiting_customer" | "waiting_internal" | "resolved" | "closed";
  customerId: string;
  customerName: string;
  customerEmail: string;
  assignedTo?: string;
  assignedName?: string;
  createdAt: string;
  updatedAt: string;
  lastReplyAt?: string;
  slaDeadline?: string;
  slaBreached: boolean;
  messages: TicketMessage[];
  tags: string[];
}

interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: "customer" | "agent" | "system";
  senderName: string;
  message: string;
  createdAt: string;
  isInternal?: boolean;
}

interface TicketStats {
  total: number;
  open: number;
  inProgress: number;
  slaBreached: number;
  avgResponseTime: number;
  avgResolutionTime: number;
}

const priorityColors: Record<string, string> = {
  low: "bg-gray-100 text-gray-800",
  medium: "bg-blue-100 text-blue-800",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-red-800",
};

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  waiting_customer: "bg-purple-100 text-purple-800",
  waiting_internal: "bg-orange-100 text-orange-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-800",
};

const categoryLabels: Record<string, string> = {
  booking: "Booking Issue",
  payment: "Payment Problem",
  account: "Account Issue",
  technical: "Technical Problem",
  other: "Other",
};

export function SupportTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [stats, setStats] = useState<TicketStats>({
    total: 0,
    open: 0,
    inProgress: 0,
    slaBreached: 0,
    avgResponseTime: 0,
    avgResolutionTime: 0,
  });
  const [newMessage, setNewMessage] = useState("");
  const [internalNote, setInternalNote] = useState(false);

  useEffect(() => {
    // Mock data
    setTickets([
      {
        id: "1",
        number: "TK-1001",
        subject: "Booking not confirmed after payment",
        description: "I paid for a plumbing service but the booking status is still pending.",
        category: "booking",
        priority: "high",
        status: "in_progress",
        customerId: "c1",
        customerName: "Ahmad Hassan",
        customerEmail: "ahmad@example.com",
        assignedTo: "a1",
        assignedName: "Support Agent 1",
        createdAt: "2025-01-17T10:00:00Z",
        updatedAt: "2025-01-17T11:30:00Z",
        lastReplyAt: "2025-01-17T11:30:00Z",
        slaDeadline: "2025-01-17T14:00:00Z",
        slaBreached: false,
        messages: [
          {
            id: "m1",
            ticketId: "1",
            senderType: "customer",
            senderName: "Ahmad Hassan",
            message: "I made a payment for booking BK-1002 but the status is still pending. Please help!",
            createdAt: "2025-01-17T10:00:00Z",
          },
          {
            id: "m2",
            ticketId: "1",
            senderType: "agent",
            senderName: "Support Agent 1",
            message: "Thank you for contacting us. I'm looking into your payment status now.",
            createdAt: "2025-01-17T10:15:00Z",
          },
        ],
        tags: ["payment", "urgent"],
      },
      {
        id: "2",
        number: "TK-1002",
        subject: "Cannot update profile photo",
        description: "When I try to upload a new profile photo, nothing happens.",
        category: "technical",
        priority: "medium",
        status: "open",
        customerId: "c2",
        customerName: "Sara Ali",
        customerEmail: "sara@example.com",
        createdAt: "2025-01-17T09:00:00Z",
        updatedAt: "2025-01-17T09:00:00Z",
        slaDeadline: "2025-01-17T17:00:00Z",
        slaBreached: false,
        messages: [
          {
            id: "m3",
            ticketId: "2",
            senderType: "customer",
            senderName: "Sara Ali",
            message: "I've been trying to update my profile photo but the upload button doesn't work.",
            createdAt: "2025-01-17T09:00:00Z",
          },
        ],
        tags: ["bug"],
      },
      {
        id: "3",
        number: "TK-1003",
        subject: "Refund request for cancelled booking",
        description: "I need a refund for booking BK-0998 which was cancelled by the worker.",
        category: "payment",
        priority: "high",
        status: "waiting_customer",
        customerId: "c3",
        customerName: "Omar Khalil",
        customerEmail: "omar@example.com",
        assignedTo: "a2",
        assignedName: "Support Agent 2",
        createdAt: "2025-01-16T15:00:00Z",
        updatedAt: "2025-01-17T08:00:00Z",
        lastReplyAt: "2025-01-17T08:00:00Z",
        slaDeadline: "2025-01-17T15:00:00Z",
        slaBreached: false,
        messages: [
          {
            id: "m4",
            ticketId: "3",
            senderType: "customer",
            senderName: "Omar Khalil",
            message: "The worker cancelled my booking but I already paid. I need a refund.",
            createdAt: "2025-01-16T15:00:00Z",
          },
          {
            id: "m5",
            ticketId: "3",
            senderType: "agent",
            senderName: "Support Agent 2",
            message: "I can see the cancellation. Could you please confirm your payment method used?",
            createdAt: "2025-01-17T08:00:00Z",
          },
        ],
        tags: ["refund"],
      },
      {
        id: "4",
        number: "TK-1004",
        subject: "Worker didn't show up",
        description: "The scheduled worker never arrived for the appointment.",
        category: "booking",
        priority: "urgent",
        status: "open",
        customerId: "c4",
        customerName: "Layla Mahmoud",
        customerEmail: "layla@example.com",
        createdAt: "2025-01-17T08:30:00Z",
        updatedAt: "2025-01-17T08:30:00Z",
        slaDeadline: "2025-01-17T12:30:00Z",
        slaBreached: false,
        messages: [
          {
            id: "m6",
            ticketId: "4",
            senderType: "customer",
            senderName: "Layla Mahmoud",
            message: "My appointment was at 8 AM but the worker never showed up. This is unacceptable!",
            createdAt: "2025-01-17T08:30:00Z",
          },
        ],
        tags: ["no-show", "urgent"],
      },
    ]);

    setStats({
      total: 156,
      open: 23,
      inProgress: 12,
      slaBreached: 3,
      avgResponseTime: 45,
      avgResolutionTime: 24,
    });
  }, []);

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch = t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || t.status === filterStatus;
    const matchesPriority = filterPriority === "all" || t.priority === filterPriority;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const handleSendMessage = () => {
    if (!newMessage.trim() || !selectedTicket) return;

    const newMsg: TicketMessage = {
      id: `m${Date.now()}`,
      ticketId: selectedTicket.id,
      senderType: "agent",
      senderName: "Support Agent",
      message: newMessage,
      createdAt: new Date().toISOString(),
      isInternal: internalNote,
    };

    setTickets(tickets.map((t) =>
      t.id === selectedTicket.id
        ? {
            ...t,
            messages: [...t.messages, newMsg],
            updatedAt: new Date().toISOString(),
            lastReplyAt: new Date().toISOString(),
          }
        : t
    ));

    setSelectedTicket({
      ...selectedTicket,
      messages: [...selectedTicket.messages, newMsg],
    });

    setNewMessage("");
    setInternalNote(false);
  };

  const handleAssignTicket = (ticketId: string, agentName: string) => {
    setTickets(tickets.map((t) =>
      t.id === ticketId
        ? { ...t, assignedTo: "a1", assignedName: agentName, status: "in_progress" }
        : t
    ));
  };

  const handleChangeStatus = (ticketId: string, newStatus: Ticket["status"]) => {
    setTickets(tickets.map((t) =>
      t.id === ticketId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t
    ));
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-sm text-gray-500">Total Tickets</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-yellow-600">{stats.open}</p>
          <p className="text-sm text-gray-500">Open</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
          <p className="text-sm text-gray-500">In Progress</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-red-600">{stats.slaBreached}</p>
          <p className="text-sm text-gray-500">SLA Breached</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{stats.avgResponseTime}m</p>
          <p className="text-sm text-gray-500">Avg Response</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{stats.avgResolutionTime}h</p>
          <p className="text-sm text-gray-500">Avg Resolution</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="waiting_customer">Waiting Customer</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg"
        >
          <option value="all">All Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
      </div>

      {/* Tickets List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div className="lg:col-span-1 space-y-3">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              onClick={() => setSelectedTicket(ticket)}
              className={cn(
                "bg-white rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md",
                selectedTicket?.id === ticket.id && "border-blue-500 ring-2 ring-blue-200",
                ticket.slaBreached && "border-red-300"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="font-mono text-xs text-gray-500">{ticket.number}</span>
                <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", priorityColors[ticket.priority])}>
                  {ticket.priority}
                </span>
              </div>
              <p className="font-medium text-gray-900 text-sm line-clamp-2">{ticket.subject}</p>
              <p className="text-xs text-gray-500 mt-1">{ticket.customerName}</p>
              <div className="flex items-center justify-between mt-2">
                <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", statusColors[ticket.status])}>
                  {ticket.status.replace(/_/g, " ")}
                </span>
                {ticket.slaBreached && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <AlertTriangle className="w-3 h-3" /> SLA
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Ticket Detail */}
        <div className="lg:col-span-2">
          {selectedTicket ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-gray-500">{selectedTicket.number}</span>
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", priorityColors[selectedTicket.priority])}>
                        {selectedTicket.priority}
                      </span>
                      <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", statusColors[selectedTicket.status])}>
                        {selectedTicket.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mt-1">{selectedTicket.subject}</h3>
                    <p className="text-sm text-gray-500">
                      {selectedTicket.customerName} • {categoryLabels[selectedTicket.category]}
                    </p>
                  </div>
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => handleChangeStatus(selectedTicket.id, e.target.value as Ticket["status"])}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting_customer">Waiting Customer</option>
                    <option value="waiting_internal">Waiting Internal</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
              </div>

              {/* Messages */}
              <div className="p-4 max-h-96 overflow-y-auto space-y-4">
                {selectedTicket.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3",
                      msg.senderType === "agent" && "flex-row-reverse"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium",
                      msg.senderType === "customer" ? "bg-blue-500" : msg.senderType === "agent" ? "bg-green-500" : "bg-gray-500"
                    )}>
                      {msg.senderName.charAt(0)}
                    </div>
                    <div className={cn(
                      "max-w-[70%] rounded-xl p-3",
                      msg.senderType === "customer" ? "bg-gray-100" : msg.isInternal ? "bg-yellow-100" : "bg-blue-100"
                    )}>
                      <p className="text-sm font-medium text-gray-900">{msg.senderName}</p>
                      <p className="text-sm text-gray-700 mt-1">{msg.message}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(msg.createdAt).toLocaleString()}
                        {msg.isInternal && " • Internal Note"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reply */}
              <div className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={internalNote}
                      onChange={(e) => setInternalNote(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Internal Note
                  </label>
                </div>
                <div className="flex gap-2">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your reply..."
                    rows={2}
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!newMessage.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Headphones className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Select a ticket to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
