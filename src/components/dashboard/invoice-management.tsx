"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  FileText,
  Search,
  Download,
  Eye,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  Plus,
  X,
  Loader2,
  Trash2,
  RotateCcw,
  Copy,
  Receipt,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Printer,
  Mail,
  MoreVertical,
  Ban,
  RefreshCw,
  DollarSign,
  Calendar,
  User,
  Hash,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatCompact, formatDate } from "@/lib/utils";

/* ─── Types ─── */
interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Invoice {
  id: string;
  number: string;
  workerName: string;
  workerNameAr: string;
  workerEmail: string;
  type: "subscription" | "verification" | "featured" | "campaign" | "booking_deposit" | "custom";
  amount: number;
  tax: number;
  currency: string;
  status: "paid" | "pending" | "overdue" | "cancelled" | "voided" | "refunded";
  issuedAt: string;
  paidAt?: string;
  dueDate: string;
  hue: number;
  lineItems: InvoiceLineItem[];
  notes?: string;
  cancelReason?: string;
  refundAmount?: number;
  activityLog: { action: string; date: string; by: string }[];
}

/* ─── Demo Data ─── */
const DEMO_WORKERS = [
  { id: "w1", name: "Khaled Al-Harbi", nameAr: "خالد الحربي", email: "khaled@plumbfix.sa", hue: 294 },
  { id: "w2", name: "Ali Hassan", nameAr: "علي حسن", email: "ali@carpentry.sa", hue: 299 },
  { id: "w3", name: "Omar Al-Mutairi", nameAr: "عمر المطيري", email: "omar@ac-tech.sa", hue: 260 },
  { id: "w4", name: "Bilal Mansour", nameAr: "بلال منصور", email: "bilal@clean.pro", hue: 275 },
  { id: "w5", name: "Anas Barakat", nameAr: "أنس بركات", email: "anas@design.studio", hue: 23 },
];

const DEMO_INVOICES: Invoice[] = [
  {
    id: "inv-1", number: "INV-2024-001", workerName: "Khaled Al-Harbi", workerNameAr: "خالد الحربي", workerEmail: "khaled@plumbfix.sa",
    type: "subscription", amount: 11900, tax: 1785, currency: "SAR", status: "paid", issuedAt: "2024-01-15", paidAt: "2024-01-15", dueDate: "2024-02-15", hue: 294,
    lineItems: [
      { id: "li-1", description: "Premium Plan — Monthly", quantity: 1, unitPrice: 11900, total: 11900 },
    ],
    activityLog: [
      { action: "Invoice created", date: "2024-01-15", by: "System" },
      { action: "Payment received", date: "2024-01-15", by: "Stripe" },
    ],
  },
  {
    id: "inv-2", number: "INV-2024-002", workerName: "Ali Hassan", workerNameAr: "علي حسن", workerEmail: "ali@carpentry.sa",
    type: "subscription", amount: 5900, tax: 885, currency: "AED", status: "paid", issuedAt: "2024-01-20", paidAt: "2024-01-20", dueDate: "2024-02-20", hue: 299,
    lineItems: [
      { id: "li-2", description: "Professional Plan — Monthly", quantity: 1, unitPrice: 5900, total: 5900 },
    ],
    activityLog: [
      { action: "Invoice created", date: "2024-01-20", by: "System" },
      { action: "Payment received", date: "2024-01-20", by: "Stripe" },
    ],
  },
  {
    id: "inv-3", number: "INV-2024-003", workerName: "Omar Al-Mutairi", workerNameAr: "عمر المطيري", workerEmail: "omar@ac-tech.sa",
    type: "verification", amount: 2900, tax: 435, currency: "SAR", status: "pending", issuedAt: "2024-02-01", dueDate: "2024-03-01", hue: 260,
    lineItems: [
      { id: "li-3", description: "Identity Verification Fee", quantity: 1, unitPrice: 1500, total: 1500 },
      { id: "li-4", description: "Background Check", quantity: 1, unitPrice: 1400, total: 1400 },
    ],
    activityLog: [
      { action: "Invoice created", date: "2024-02-01", by: "Admin" },
      { action: "Reminder sent", date: "2024-02-15", by: "System" },
    ],
  },
  {
    id: "inv-4", number: "INV-2024-004", workerName: "Bilal Mansour", workerNameAr: "بلال منصور", workerEmail: "bilal@clean.pro",
    type: "featured", amount: 4900, tax: 735, currency: "AED", status: "overdue", issuedAt: "2024-01-10", dueDate: "2024-02-10", hue: 275,
    lineItems: [
      { id: "li-5", description: "Featured Listing — 30 days", quantity: 1, unitPrice: 3900, total: 3900 },
      { id: "li-6", description: "Homepage Banner Placement", quantity: 1, unitPrice: 1000, total: 1000 },
    ],
    activityLog: [
      { action: "Invoice created", date: "2024-01-10", by: "Admin" },
      { action: "Overdue reminder sent", date: "2024-02-11", by: "System" },
    ],
  },
  {
    id: "inv-5", number: "INV-2024-005", workerName: "BuildCo Ltd", workerNameAr: "شركة بلدت ك", workerEmail: "ads@buildco.sa",
    type: "campaign", amount: 29900, tax: 4485, currency: "SAR", status: "paid", issuedAt: "2024-02-05", paidAt: "2024-02-05", dueDate: "2024-03-05", hue: 156,
    lineItems: [
      { id: "li-7", description: "Enterprise Campaign — Monthly", quantity: 1, unitPrice: 29900, total: 29900 },
    ],
    activityLog: [
      { action: "Invoice created", date: "2024-02-05", by: "System" },
      { action: "Payment received", date: "2024-02-05", by: "Stripe" },
    ],
  },
  {
    id: "inv-6", number: "INV-2024-006", workerName: "Anas Barakat", workerNameAr: "أنس بركات", workerEmail: "anas@design.studio",
    type: "subscription", amount: 11900, tax: 1785, currency: "AED", status: "paid", issuedAt: "2024-02-10", paidAt: "2024-02-10", dueDate: "2024-03-10", hue: 23,
    lineItems: [
      { id: "li-8", description: "Premium Plan — Monthly", quantity: 1, unitPrice: 11900, total: 11900 },
    ],
    activityLog: [
      { action: "Invoice created", date: "2024-02-10", by: "System" },
      { action: "Payment received", date: "2024-02-10", by: "Stripe" },
    ],
  },
  {
    id: "inv-7", number: "INV-2024-007", workerName: "Mohammed Farouk", workerNameAr: "محمد فاروق", workerEmail: "mohammed@test.com",
    type: "subscription", amount: 11900, tax: 0, currency: "EGP", status: "cancelled", issuedAt: "2024-01-25", dueDate: "2024-02-25", hue: 79,
    lineItems: [
      { id: "li-9", description: "Premium Plan — Monthly", quantity: 1, unitPrice: 11900, total: 11900 },
    ],
    cancelReason: "Worker requested cancellation — subscription no longer needed",
    activityLog: [
      { action: "Invoice created", date: "2024-01-25", by: "System" },
      { action: "Invoice voided", date: "2024-02-01", by: "Admin", },
      { action: "Reason: Worker requested cancellation", date: "2024-02-01", by: "Admin" },
    ],
  },
];

/* ─── Constants ─── */
const TYPE_COLORS: Record<string, string> = {
  subscription: "bg-blue-500/10 text-blue-600",
  verification: "bg-emerald-500/10 text-emerald-600",
  featured: "bg-violet-500/10 text-violet-600",
  campaign: "bg-brand-500/10 text-brand-600",
  booking_deposit: "bg-orange-500/10 text-orange-600",
  custom: "bg-ink-500/10 text-ink-600",
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  paid: { icon: <CheckCircle2 className="size-3" />, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  pending: { icon: <Clock className="size-3" />, color: "text-amber-600", bg: "bg-amber-500/10" },
  overdue: { icon: <XCircle className="size-3" />, color: "text-red-600", bg: "bg-red-500/10" },
  cancelled: { icon: <Ban className="size-3" />, color: "text-ink-500", bg: "bg-ink-500/10" },
  voided: { icon: <XCircle className="size-3" />, color: "text-red-500", bg: "bg-red-500/10" },
  refunded: { icon: <RotateCcw className="size-3" />, color: "text-purple-600", bg: "bg-purple-500/10" },
};

const CANCEL_REASONS = [
  "Service not provided",
  "Duplicate invoice",
  "Customer dispute",
  "Worker request",
  "Billing error",
  "Subscription cancelled",
  "Other",
];

/* ─── Component ─── */
export function InvoiceManagement({ locale = "en" }: { locale?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState<Invoice | null>(null);
  const [showRevokeModal, setShowRevokeModal] = useState<Invoice | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Generate form state
  const [genWorker, setGenWorker] = useState("");
  const [genType, setGenType] = useState<string>("subscription");
  const [genAmount, setGenAmount] = useState("");
  const [genTax, setGenTax] = useState("15");
  const [genCurrency, setGenCurrency] = useState("SAR");
  const [genDueDate, setGenDueDate] = useState("");
  const [genNotes, setGenNotes] = useState("");
  const [genLineItems, setGenLineItems] = useState<{ description: string; quantity: number; unitPrice: number }[]>([
    { description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [genLoading, setGenLoading] = useState(false);
  const [genSuccess, setGenSuccess] = useState(false);

  // Revoke form state
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeNotes, setRevokeNotes] = useState("");
  const [revokeRefund, setRevokeRefund] = useState(false);
  const [revokeRefundAmount, setRevokeRefundAmount] = useState("");
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState(false);

  // Invoices state (mutable for demo)
  const [invoices, setInvoices] = useState<Invoice[]>(DEMO_INVOICES);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.number.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      const matchesType = typeFilter === "all" || inv.type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [searchQuery, statusFilter, typeFilter, invoices]);

  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const paidAmount = filteredInvoices.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + inv.amount, 0);
  const pendingAmount = filteredInvoices.filter((inv) => inv.status === "pending" || inv.status === "overdue").reduce((sum, inv) => sum + inv.amount, 0);
  const refundedAmount = filteredInvoices.filter((inv) => inv.status === "refunded").reduce((sum, inv) => sum + (inv.refundAmount || inv.amount), 0);

  const toggleSelectAll = useCallback(() => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map((i) => i.id)));
    }
  }, [filteredInvoices, selectedInvoices.size]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ─── Generate Invoice ─── */
  const handleGenerate = useCallback(async () => {
    setGenLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    const worker = DEMO_WORKERS.find((w) => w.id === genWorker);
    const subtotal = genLineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
    const taxAmount = Math.round(subtotal * (parseFloat(genTax) / 100));
    const invNumber = `INV-2024-${String(invoices.length + 1).padStart(3, "0")}`;

    const newInvoice: Invoice = {
      id: `inv-${Date.now()}`,
      number: invNumber,
      workerName: worker?.name || "Unknown",
      workerNameAr: worker?.nameAr || "غير معروف",
      workerEmail: worker?.email || "",
      type: genType as Invoice["type"],
      amount: subtotal,
      tax: taxAmount,
      currency: genCurrency,
      status: "pending",
      issuedAt: new Date().toISOString().split("T")[0],
      dueDate: genDueDate,
      hue: worker?.hue || Math.floor(Math.random() * 360),
      lineItems: genLineItems.map((li, idx) => ({
        id: `li-gen-${idx}`,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        total: li.quantity * li.unitPrice,
      })),
      notes: genNotes,
      activityLog: [
        { action: "Invoice created", date: new Date().toISOString().split("T")[0], by: "Admin" },
      ],
    };

    setInvoices((prev) => [newInvoice, ...prev]);
    setGenLoading(false);
    setGenSuccess(true);
    setTimeout(() => {
      setShowGenerateModal(false);
      setGenSuccess(false);
      resetGenForm();
    }, 1500);
  }, [genWorker, genType, genTax, genCurrency, genDueDate, genNotes, genLineItems, invoices.length]);

  const resetGenForm = () => {
    setGenWorker("");
    setGenType("subscription");
    setGenAmount("");
    setGenTax("15");
    setGenCurrency("SAR");
    setGenDueDate("");
    setGenNotes("");
    setGenLineItems([{ description: "", quantity: 1, unitPrice: 0 }]);
  };

  /* ─── Revoke Invoice ─── */
  const handleRevoke = useCallback(async () => {
    if (!showRevokeModal || !revokeReason) return;
    setRevokeLoading(true);
    await new Promise((r) => setTimeout(r, 800));

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === showRevokeModal.id
          ? {
              ...inv,
              status: revokeRefund ? "refunded" : "voided" as Invoice["status"],
              cancelReason: revokeReason + (revokeNotes ? ` — ${revokeNotes}` : ""),
              refundAmount: revokeRefund ? parseInt(revokeRefundAmount) || inv.amount : undefined,
              activityLog: [
                ...inv.activityLog,
                {
                  action: revokeRefund ? `Invoice voided — refund $${revokeRefundAmount || inv.amount}` : "Invoice voided",
                  date: new Date().toISOString().split("T")[0],
                  by: "Admin",
                },
              ],
            }
          : inv
      )
    );

    setRevokeLoading(false);
    setRevokeSuccess(true);
    setTimeout(() => {
      setShowRevokeModal(null);
      setRevokeSuccess(false);
      setRevokeReason("");
      setRevokeNotes("");
      setRevokeRefund(false);
      setRevokeRefundAmount("");
    }, 1500);
  }, [showRevokeModal, revokeReason, revokeNotes, revokeRefund, revokeRefundAmount]);

  /* ─── Mark as Paid ─── */
  const handleMarkPaid = useCallback((invoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? {
              ...inv,
              status: "paid" as const,
              paidAt: new Date().toISOString().split("T")[0],
              activityLog: [
                ...inv.activityLog,
                { action: "Marked as paid (manual)", date: new Date().toISOString().split("T")[0], by: "Admin" },
              ],
            }
          : inv
      )
    );
  }, []);

  /* ─── Duplicate Invoice ─── */
  const handleDuplicate = useCallback((invoice: Invoice) => {
    const newInvoice: Invoice = {
      ...invoice,
      id: `inv-${Date.now()}`,
      number: `INV-2024-${String(invoices.length + 1).padStart(3, "0")}`,
      status: "pending",
      issuedAt: new Date().toISOString().split("T")[0],
      paidAt: undefined,
      activityLog: [
        { action: `Duplicated from ${invoice.number}`, date: new Date().toISOString().split("T")[0], by: "Admin" },
      ],
    };
    setInvoices((prev) => [newInvoice, ...prev]);
  }, [invoices.length]);

  /* ─── Send Reminder ─── */
  const handleSendReminder = useCallback((invoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((inv) =>
        inv.id === invoice.id
          ? {
              ...inv,
              activityLog: [
                ...inv.activityLog,
                { action: "Payment reminder sent", date: new Date().toISOString().split("T")[0], by: "Admin" },
              ],
            }
          : inv
      )
    );
  }, []);

  /* ─── Bulk Operations ─── */
  const handleBulkAction = useCallback((action: "send" | "export" | "void") => {
    const selected = invoices.filter((i) => selectedInvoices.has(i.id));
    if (action === "void") {
      setInvoices((prev) =>
        prev.map((inv) =>
          selectedInvoices.has(inv.id)
            ? {
                ...inv,
                status: "voided" as const,
                activityLog: [
                  ...inv.activityLog,
                  { action: "Bulk voided", date: new Date().toISOString().split("T")[0], by: "Admin" },
                ],
              }
            : inv
        )
      );
    }
    setSelectedInvoices(new Set());
    setShowBulkActions(false);
  }, [invoices, selectedInvoices]);

  const exportCSV = () => {
    const headers = ["Invoice #", "Worker", "Type", "Amount", "Tax", "Currency", "Status", "Issued", "Paid", "Due", "Notes"];
    const rows = filteredInvoices.map((inv) => [
      inv.number,
      locale === "ar" ? inv.workerNameAr : inv.workerName,
      inv.type,
      (inv.amount / 100).toFixed(2),
      (inv.tax / 100).toFixed(2),
      inv.currency,
      inv.status,
      inv.issuedAt,
      inv.paidAt || "",
      inv.dueDate,
      inv.notes || inv.cancelReason || "",
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const genSubtotal = genLineItems.reduce((sum, li) => sum + li.quantity * li.unitPrice, 0);
  const genTaxAmount = Math.round(genSubtotal * (parseFloat(genTax) / 100));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 transition-colors hover:underline dark:text-brand-400"
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" /> Back to Dashboard
          </Link>
          <h1 className="mt-2 flex items-center gap-2.5 text-2xl font-black tracking-tight text-ink-900 dark:text-ink-50">
            <FileText className="size-6 text-brand-500" /> Invoice Management
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            Generate, manage, revoke, and track all invoices
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowGenerateModal(true)} size="sm">
            <Plus className="size-4 mr-2" />
            Generate Invoice
          </Button>
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="size-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-ink-500">Total Invoices</p>
            <p className="mt-1 text-2xl font-black text-ink-900 dark:text-ink-50">{filteredInvoices.length}</p>
            <p className="text-xs text-ink-400">${formatCompact(totalAmount / 100)} total</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600">Paid</p>
            <p className="mt-1 text-2xl font-black text-emerald-600">${formatCompact(paidAmount / 100)}</p>
            <p className="text-xs text-ink-400">{filteredInvoices.filter((i) => i.status === "paid").length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-amber-600">Outstanding</p>
            <p className="mt-1 text-2xl font-black text-amber-600">${formatCompact(pendingAmount / 100)}</p>
            <p className="text-xs text-ink-400">{filteredInvoices.filter((i) => i.status === "pending" || i.status === "overdue").length} invoices</p>
          </CardContent>
        </Card>
        <Card className="border-purple-500/20 bg-purple-500/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-purple-600">Refunded</p>
            <p className="mt-1 text-2xl font-black text-purple-600">${formatCompact(refundedAmount / 100)}</p>
            <p className="text-xs text-ink-400">{filteredInvoices.filter((i) => i.status === "refunded").length} invoices</p>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedInvoices.size > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-800 dark:bg-brand-950/30">
              <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
                {selectedInvoices.size} invoice{selectedInvoices.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkAction("send")}>
                  <Mail className="size-3 mr-1" /> Send All
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction("export")}>
                  <Download className="size-3 mr-1" /> Export
                </Button>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleBulkAction("void")}>
                  <Ban className="size-3 mr-1" /> Void All
                </Button>
              </div>
              <button
                onClick={() => setSelectedInvoices(new Set())}
                className="ml-auto text-ink-400 hover:text-ink-600"
              >
                <X className="size-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search invoices..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-4 text-sm dark:border-ink-700 dark:bg-ink-900"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
        >
          <option value="all">All Status</option>
          <option value="paid">Paid</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="cancelled">Cancelled</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-900"
        >
          <option value="all">All Types</option>
          <option value="subscription">Subscription</option>
          <option value="verification">Verification</option>
          <option value="featured">Featured</option>
          <option value="campaign">Campaign</option>
          <option value="booking_deposit">Booking Deposit</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* Invoice Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-800/50">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={selectedInvoices.size === filteredInvoices.length && filteredInvoices.length > 0}
                  onChange={toggleSelectAll}
                  className="size-4 rounded border-ink-300"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-ink-600 dark:text-ink-300">Invoice</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-600 dark:text-ink-300">Worker</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-600 dark:text-ink-300">Type</th>
              <th className="px-4 py-3 text-right font-semibold text-ink-600 dark:text-ink-300">Amount</th>
              <th className="px-4 py-3 text-center font-semibold text-ink-600 dark:text-ink-300">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-ink-600 dark:text-ink-300">Due Date</th>
              <th className="px-4 py-3 text-right font-semibold text-ink-600 dark:text-ink-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((invoice, i) => (
              <motion.tr
                key={invoice.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className={`border-b border-ink-100 transition-colors hover:bg-ink-50/50 dark:border-ink-800 dark:hover:bg-ink-800/30 ${
                  selectedInvoices.has(invoice.id) ? "bg-brand-50/50 dark:bg-brand-950/20" : ""
                }`}
              >
                <td className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={selectedInvoices.has(invoice.id)}
                    onChange={() => toggleSelect(invoice.id)}
                    className="size-4 rounded border-ink-300"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-bold text-ink-900 dark:text-ink-50">{invoice.number}</p>
                  <p className="text-xs text-ink-400">Issued {formatDate(invoice.issuedAt, locale as "en" | "ar")}</p>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-8 rounded-full"
                      style={{ backgroundColor: `hsl(${invoice.hue}, 70%, 50%)` }}
                    />
                    <span className="font-medium text-ink-700 dark:text-ink-200">
                      {locale === "ar" ? invoice.workerNameAr : invoice.workerName}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={TYPE_COLORS[invoice.type]}>{invoice.type.replace("_", " ")}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-ink-900 dark:text-ink-50">
                    {formatPrice(invoice.amount / 100, invoice.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}
                  </span>
                  {invoice.tax > 0 && (
                    <p className="text-[10px] text-ink-400">+{formatPrice(invoice.tax / 100, invoice.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")} tax</p>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge className={`${STATUS_CONFIG[invoice.status].bg} ${STATUS_CONFIG[invoice.status].color}`}>
                    {STATUS_CONFIG[invoice.status].icon}
                    {invoice.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-xs text-ink-500">
                  {formatDate(invoice.dueDate, locale as "en" | "ar")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setShowDetailModal(invoice)}>
                      <Eye className="size-3" />
                    </Button>
                    {invoice.status === "pending" && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-brand-600" onClick={() => handleSendReminder(invoice)}>
                        <Send className="size-3" />
                      </Button>
                    )}
                    {invoice.status === "pending" && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-emerald-600" onClick={() => handleMarkPaid(invoice)}>
                        <CheckCircle2 className="size-3" />
                      </Button>
                    )}
                    {(invoice.status === "pending" || invoice.status === "overdue") && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-red-600" onClick={() => setShowRevokeModal(invoice)}>
                        <Ban className="size-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleDuplicate(invoice)}>
                      <Copy className="size-3" />
                    </Button>
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredInvoices.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <FileText className="size-10 text-ink-300 dark:text-ink-600" />
            <p className="font-bold text-ink-900 dark:text-ink-50">No invoices found</p>
            <p className="text-sm text-ink-400">Try adjusting your filters or generate a new invoice</p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* GENERATE INVOICE MODAL                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showGenerateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => { setShowGenerateModal(false); setGenSuccess(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                  <Receipt className="size-5 mr-2 inline text-brand-500" />
                  Generate New Invoice
                </h2>
                <button onClick={() => { setShowGenerateModal(false); setGenSuccess(false); }} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">
                  <X className="size-5" />
                </button>
              </div>

              {genSuccess ? (
                <div className="mt-8 flex flex-col items-center gap-3 py-8">
                  <CheckCircle2 className="size-12 text-emerald-500" />
                  <p className="text-lg font-bold text-emerald-600">Invoice Generated!</p>
                  <p className="text-sm text-ink-400">The invoice has been created and is ready to send.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {/* Worker & Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Worker *</label>
                      <select
                        value={genWorker}
                        onChange={(e) => setGenWorker(e.target.value)}
                        className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                      >
                        <option value="">Select worker...</option>
                        {DEMO_WORKERS.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Invoice Type *</label>
                      <select
                        value={genType}
                        onChange={(e) => setGenType(e.target.value)}
                        className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                      >
                        <option value="subscription">Subscription</option>
                        <option value="verification">Verification</option>
                        <option value="featured">Featured Listing</option>
                        <option value="campaign">Campaign</option>
                        <option value="booking_deposit">Booking Deposit</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Line Items</label>
                    <div className="space-y-2">
                      {genLineItems.map((li, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Description"
                            value={li.description}
                            onChange={(e) => {
                              const items = [...genLineItems];
                              items[idx] = { ...items[idx], description: e.target.value };
                              setGenLineItems(items);
                            }}
                            className="h-9 flex-1 rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                          />
                          <input
                            type="number"
                            placeholder="Qty"
                            value={li.quantity || ""}
                            onChange={(e) => {
                              const items = [...genLineItems];
                              items[idx] = { ...items[idx], quantity: parseInt(e.target.value) || 0 };
                              setGenLineItems(items);
                            }}
                            className="h-9 w-16 rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                          />
                          <input
                            type="number"
                            placeholder="Unit Price"
                            value={li.unitPrice || ""}
                            onChange={(e) => {
                              const items = [...genLineItems];
                              items[idx] = { ...items[idx], unitPrice: parseInt(e.target.value) || 0 };
                              setGenLineItems(items);
                            }}
                            className="h-9 w-24 rounded-lg border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                          />
                          <span className="w-20 text-right text-sm font-bold text-ink-700 dark:text-ink-200">
                            {(li.quantity * li.unitPrice / 100).toFixed(2)}
                          </span>
                          {genLineItems.length > 1 && (
                            <button
                              onClick={() => setGenLineItems(genLineItems.filter((_, i) => i !== idx))}
                              className="text-ink-400 hover:text-red-500"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setGenLineItems([...genLineItems, { description: "", quantity: 1, unitPrice: 0 }])}
                      className="mt-2 text-xs font-bold text-brand-600 hover:underline"
                    >
                      + Add line item
                    </button>
                  </div>

                  {/* Tax & Currency */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Tax (%)</label>
                      <input
                        type="number"
                        value={genTax}
                        onChange={(e) => setGenTax(e.target.value)}
                        className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Currency</label>
                      <select
                        value={genCurrency}
                        onChange={(e) => setGenCurrency(e.target.value)}
                        className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                      >
                        <option value="SAR">SAR (Saudi Riyal)</option>
                        <option value="AED">AED (UAE Dirham)</option>
                        <option value="EGP">EGP (Egyptian Pound)</option>
                        <option value="USD">USD (US Dollar)</option>
                        <option value="LBP">LBP (Lebanese Pound)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Due Date *</label>
                      <input
                        type="date"
                        value={genDueDate}
                        onChange={(e) => setGenDueDate(e.target.value)}
                        className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Notes</label>
                    <textarea
                      value={genNotes}
                      onChange={(e) => setGenNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional notes for this invoice..."
                      className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800"
                    />
                  </div>

                  {/* Summary */}
                  <div className="rounded-xl border border-ink-200 bg-ink-50 p-4 dark:border-ink-700 dark:bg-ink-800/50">
                    <div className="flex justify-between text-sm text-ink-600 dark:text-ink-400">
                      <span>Subtotal</span>
                      <span>{formatPrice(genSubtotal / 100, genCurrency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</span>
                    </div>
                    <div className="mt-1 flex justify-between text-sm text-ink-600 dark:text-ink-400">
                      <span>Tax ({genTax}%)</span>
                      <span>{formatPrice(genTaxAmount / 100, genCurrency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</span>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-ink-200 pt-2 font-bold text-ink-900 dark:text-ink-50">
                      <span>Total</span>
                      <span>{formatPrice((genSubtotal + genTaxAmount) / 100, genCurrency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleGenerate}
                      disabled={genLoading || !genWorker || !genDueDate}
                      className="flex-1"
                    >
                      {genLoading ? (
                        <><Loader2 className="size-4 mr-2 animate-spin" /> Generating...</>
                      ) : (
                        <><Receipt className="size-4 mr-2" /> Generate Invoice</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowGenerateModal(false); setGenSuccess(false); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* INVOICE DETAIL MODAL                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showDetailModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowDetailModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                  <FileText className="size-5 mr-2 inline text-brand-500" />
                  {showDetailModal.number}
                </h2>
                <button onClick={() => setShowDetailModal(null)} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">
                  <X className="size-5" />
                </button>
              </div>

              {/* Invoice Header */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-ink-400">Worker</p>
                  <p className="font-bold text-ink-900 dark:text-ink-50">{showDetailModal.workerName}</p>
                  <p className="text-xs text-ink-400">{showDetailModal.workerEmail}</p>
                </div>
                <div className="text-right">
                  <Badge className={`${STATUS_CONFIG[showDetailModal.status].bg} ${STATUS_CONFIG[showDetailModal.status].color}`}>
                    {STATUS_CONFIG[showDetailModal.status].icon}
                    {showDetailModal.status}
                  </Badge>
                  <p className="mt-1 text-xs text-ink-400">Type: {showDetailModal.type.replace("_", " ")}</p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="mt-4 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-50 dark:bg-ink-800/50">
                      <th className="px-3 py-2 text-left font-semibold text-ink-600 dark:text-ink-300">Description</th>
                      <th className="px-3 py-2 text-center font-semibold text-ink-600 dark:text-ink-300">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-ink-600 dark:text-ink-300">Unit Price</th>
                      <th className="px-3 py-2 text-right font-semibold text-ink-600 dark:text-ink-300">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showDetailModal.lineItems.map((li) => (
                      <tr key={li.id} className="border-t border-ink-100 dark:border-ink-800">
                        <td className="px-3 py-2 text-ink-700 dark:text-ink-200">{li.description}</td>
                        <td className="px-3 py-2 text-center text-ink-500">{li.quantity}</td>
                        <td className="px-3 py-2 text-right text-ink-500">{formatPrice(li.unitPrice / 100, showDetailModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</td>
                        <td className="px-3 py-2 text-right font-medium text-ink-700 dark:text-ink-200">{formatPrice(li.total / 100, showDetailModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="mt-3 space-y-1 text-right">
                <div className="flex justify-between text-sm text-ink-500">
                  <span>Subtotal</span>
                  <span>{formatPrice(showDetailModal.amount / 100, showDetailModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</span>
                </div>
                {showDetailModal.tax > 0 && (
                  <div className="flex justify-between text-sm text-ink-500">
                    <span>Tax</span>
                    <span>{formatPrice(showDetailModal.tax / 100, showDetailModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-ink-200 pt-1 font-bold text-ink-900 dark:text-ink-50">
                  <span>Total Due</span>
                  <span>{formatPrice((showDetailModal.amount + showDetailModal.tax) / 100, showDetailModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</span>
                </div>
              </div>

              {/* Notes / Cancel Reason */}
              {showDetailModal.notes && (
                <div className="mt-4 rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-800/50">
                  <p className="font-medium text-ink-600 dark:text-ink-400">Notes:</p>
                  <p className="text-ink-700 dark:text-ink-300">{showDetailModal.notes}</p>
                </div>
              )}
              {showDetailModal.cancelReason && (
                <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm dark:bg-red-900/20">
                  <p className="font-medium text-red-600 dark:text-red-400">Cancel Reason:</p>
                  <p className="text-red-700 dark:text-red-300">{showDetailModal.cancelReason}</p>
                </div>
              )}
              {showDetailModal.refundAmount && (
                <div className="mt-4 rounded-xl bg-purple-50 p-3 text-sm dark:bg-purple-900/20">
                  <p className="font-medium text-purple-600 dark:text-purple-400">
                    Refunded: {formatPrice(showDetailModal.refundAmount / 100, showDetailModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}
                  </p>
                </div>
              )}

              {/* Activity Log */}
              <div className="mt-4">
                <p className="mb-2 text-sm font-bold text-ink-700 dark:text-ink-300">Activity Log</p>
                <div className="space-y-2">
                  {showDetailModal.activityLog.map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs">
                      <div className="mt-0.5 size-2 rounded-full bg-brand-400" />
                      <div>
                        <p className="text-ink-700 dark:text-ink-300">{entry.action}</p>
                        <p className="text-ink-400">{entry.date} by {entry.by}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex gap-2">
                {showDetailModal.status === "pending" && (
                  <Button size="sm" onClick={() => { handleMarkPaid(showDetailModal); setShowDetailModal(null); }}>
                    <CheckCircle2 className="size-3 mr-1" /> Mark as Paid
                  </Button>
                )}
                {showDetailModal.status === "pending" && (
                  <Button size="sm" variant="outline" onClick={() => { handleSendReminder(showDetailModal); setShowDetailModal(null); }}>
                    <Send className="size-3 mr-1" /> Send Reminder
                  </Button>
                )}
                {(showDetailModal.status === "pending" || showDetailModal.status === "overdue") && (
                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => { setShowDetailModal(null); setShowRevokeModal(showDetailModal); }}>
                    <Ban className="size-3 mr-1" /> Void Invoice
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { handleDuplicate(showDetailModal); setShowDetailModal(null); }}>
                  <Copy className="size-3 mr-1" /> Duplicate
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REVOKE / VOID INVOICE MODAL                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showRevokeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => { setShowRevokeModal(null); setRevokeSuccess(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-red-600">
                  <AlertTriangle className="size-5 mr-2 inline" />
                  Void Invoice
                </h2>
                <button onClick={() => { setShowRevokeModal(null); setRevokeSuccess(false); }} className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">
                  <X className="size-5" />
                </button>
              </div>

              <p className="mt-2 text-sm text-ink-500">
                Voiding invoice <strong>{showRevokeModal.number}</strong> for <strong>{showRevokeModal.workerName}</strong>.
                This action cannot be undone.
              </p>

              {revokeSuccess ? (
                <div className="mt-8 flex flex-col items-center gap-3 py-8">
                  <CheckCircle2 className="size-12 text-emerald-500" />
                  <p className="text-lg font-bold text-emerald-600">Invoice Voided</p>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Reason *</label>
                    <select
                      value={revokeReason}
                      onChange={(e) => setRevokeReason(e.target.value)}
                      className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                    >
                      <option value="">Select reason...</option>
                      {CANCEL_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Additional Notes</label>
                    <textarea
                      value={revokeNotes}
                      onChange={(e) => setRevokeNotes(e.target.value)}
                      rows={2}
                      placeholder="Optional additional details..."
                      className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-800"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="refund-check"
                      checked={revokeRefund}
                      onChange={(e) => setRevokeRefund(e.target.checked)}
                      className="size-4 rounded border-ink-300"
                    />
                    <label htmlFor="refund-check" className="text-sm font-medium text-ink-700 dark:text-ink-300">
                      Issue refund for this invoice
                    </label>
                  </div>

                  {revokeRefund && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Refund Amount</label>
                      <input
                        type="number"
                        value={revokeRefundAmount}
                        onChange={(e) => setRevokeRefundAmount(e.target.value)}
                        placeholder={String(showRevokeModal.amount / 100)}
                        className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                      />
                      <p className="mt-1 text-xs text-ink-400">Full amount: {formatPrice(showRevokeModal.amount / 100, showRevokeModal.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}</p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleRevoke}
                      disabled={revokeLoading || !revokeReason}
                      className="flex-1 bg-red-600 hover:bg-red-700"
                    >
                      {revokeLoading ? (
                        <><Loader2 className="size-4 mr-2 animate-spin" /> Voiding...</>
                      ) : (
                        <><Ban className="size-4 mr-2" /> Void Invoice</>
                      )}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowRevokeModal(null); setRevokeSuccess(false); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
