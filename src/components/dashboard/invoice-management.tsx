"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
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
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatCompact, formatDate } from "@/lib/utils";

interface Invoice {
  id: string;
  number: string;
  workerName: string;
  workerNameAr: string;
  type: "subscription" | "verification" | "featured" | "campaign";
  amount: number;
  currency: string;
  status: "paid" | "pending" | "overdue" | "cancelled";
  issuedAt: string;
  paidAt?: string;
  dueDate: string;
  hue: number;
}

const DEMO_INVOICES: Invoice[] = [
  { id: "inv-1", number: "INV-2024-001", workerName: "Khaled Al-Harbi", workerNameAr: "خالد الحربي", type: "subscription", amount: 11900, currency: "SAR", status: "paid", issuedAt: "2024-01-15", paidAt: "2024-01-15", dueDate: "2024-02-15", hue: 294 },
  { id: "inv-2", number: "INV-2024-002", workerName: "Ali Hassan", workerNameAr: "علي حسن", type: "subscription", amount: 5900, currency: "AED", status: "paid", issuedAt: "2024-01-20", paidAt: "2024-01-20", dueDate: "2024-02-20", hue: 299 },
  { id: "inv-3", number: "INV-2024-003", workerName: "Omar Al-Mutairi", workerNameAr: "عمر المطيري", type: "verification", amount: 2900, currency: "SAR", status: "pending", issuedAt: "2024-02-01", dueDate: "2024-03-01", hue: 260 },
  { id: "inv-4", number: "INV-2024-004", workerName: "Bilal Mansour", workerNameAr: "بلال منصور", type: "featured", amount: 4900, currency: "AED", status: "overdue", issuedAt: "2024-01-10", dueDate: "2024-02-10", hue: 275 },
  { id: "inv-5", number: "INV-2024-005", workerName: "BuildCo Ltd", workerNameAr: "شركة بلدت ك", type: "campaign", amount: 29900, currency: "SAR", status: "paid", issuedAt: "2024-02-05", paidAt: "2024-02-05", dueDate: "2024-03-05", hue: 156 },
  { id: "inv-6", number: "INV-2024-006", workerName: "Anas Barakat", workerNameAr: "أنس بركات", type: "subscription", amount: 11900, currency: "AED", status: "paid", issuedAt: "2024-02-10", paidAt: "2024-02-10", dueDate: "2024-03-10", hue: 23 },
  { id: "inv-7", number: "INV-2024-007", workerName: "Mohammed Farouk", workerNameAr: "محمد فاروق", type: "subscription", amount: 11900, currency: "EGP", status: "cancelled", issuedAt: "2024-01-25", dueDate: "2024-02-25", hue: 79 },
];

const TYPE_COLORS: Record<string, string> = {
  subscription: "bg-blue-500/10 text-blue-600",
  verification: "bg-emerald-500/10 text-emerald-600",
  featured: "bg-violet-500/10 text-violet-600",
  campaign: "bg-brand-500/10 text-brand-600",
};

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  paid: { icon: <CheckCircle2 className="size-3" />, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  pending: { icon: <Clock className="size-3" />, color: "text-amber-600", bg: "bg-amber-500/10" },
  overdue: { icon: <XCircle className="size-3" />, color: "text-red-600", bg: "bg-red-500/10" },
  cancelled: { icon: <XCircle className="size-3" />, color: "text-ink-500", bg: "bg-ink-500/10" },
};

export function InvoiceManagement({ locale = "en" }: { locale?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredInvoices = useMemo(() => {
    return DEMO_INVOICES.filter((inv) => {
      const matchesSearch =
        inv.workerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inv.number.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      const matchesType = typeFilter === "all" || inv.type === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [searchQuery, statusFilter, typeFilter]);

  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const paidAmount = filteredInvoices.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + inv.amount, 0);
  const pendingAmount = filteredInvoices.filter((inv) => inv.status === "pending" || inv.status === "overdue").reduce((sum, inv) => sum + inv.amount, 0);

  const exportCSV = () => {
    const headers = ["Invoice #", "Worker", "Type", "Amount", "Currency", "Status", "Issued", "Paid", "Due"];
    const rows = filteredInvoices.map((inv) => [
      inv.number,
      locale === "ar" ? inv.workerNameAr : inv.workerName,
      inv.type,
      (inv.amount / 100).toFixed(2),
      inv.currency,
      inv.status,
      inv.issuedAt,
      inv.paidAt || "",
      inv.dueDate,
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
            View, filter, and export all invoices
          </p>
        </div>
        <Button onClick={exportCSV} variant="outline" size="sm">
          <Download className="size-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
            <p className="text-xs text-ink-400">{filteredInvoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").length} invoices</p>
          </CardContent>
        </Card>
      </div>

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
        </select>
      </div>

      {/* Invoice Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-ink-200 dark:border-ink-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 dark:border-ink-700 dark:bg-ink-800/50">
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
                className="border-b border-ink-100 transition-colors hover:bg-ink-50/50 dark:border-ink-800 dark:hover:bg-ink-800/30"
              >
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
                  <Badge className={TYPE_COLORS[invoice.type]}>{invoice.type}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-ink-900 dark:text-ink-50">
                    {formatPrice(invoice.amount / 100, invoice.currency as "SAR" | "AED" | "EGP", locale as "en" | "ar")}
                  </span>
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
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <Eye className="size-3" />
                    </Button>
                    {invoice.status === "pending" && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-brand-600">
                        <Send className="size-3" />
                      </Button>
                    )}
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
            <p className="text-sm text-ink-400">Try adjusting your filters</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
