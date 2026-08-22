"use client";

import { useState, useMemo, useEffect, useActionState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Search,
  Download,
  Eye,
  Ban,
  CheckCircle2,
  XCircle,
  Mail,
  Phone,
  Calendar,
  Plus,
  X,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { addCustomerAction, type AddCustomerState } from "@/app/actions/admin";

interface Customer {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  phone: string;
  bookingsCount: number;
  totalSpent: number;
  currency: string;
  joinedAt: string;
  lastActive: string;
  status: "active" | "suspended" | "banned";
  hue: number;
}

const DEMO_CUSTOMERS: Customer[] = [
  { id: "c1", name: "Fatima Al-Saud", nameAr: "فاطمة آل سعود", email: "fatima@example.com", phone: "+966 55 123 4567", bookingsCount: 12, totalSpent: 4500, currency: "SAR", joinedAt: "2024-01-10", lastActive: "2024-02-15", status: "active", hue: 320 },
  { id: "c2", name: "Ahmed Hassan", nameAr: "أحمد حسن", email: "ahmed@example.com", phone: "+971 50 987 6543", bookingsCount: 8, totalSpent: 3200, currency: "AED", joinedAt: "2024-01-20", lastActive: "2024-02-14", status: "active", hue: 200 },
  { id: "c3", name: "Sara Mohammed", nameAr: "سارة محمد", email: "sara@example.com", phone: "+20 100 123 4567", bookingsCount: 5, totalSpent: 1800, currency: "EGP", joinedAt: "2024-02-01", lastActive: "2024-02-13", status: "active", hue: 120 },
  { id: "c4", name: "Khalid Nasser", nameAr: "خالد ناصر", email: "khalid@example.com", phone: "+962 79 555 1234", bookingsCount: 3, totalSpent: 900, currency: "JOD", joinedAt: "2024-02-05", lastActive: "2024-02-10", status: "suspended", hue: 45 },
  { id: "c5", name: "Layla Hussein", nameAr: "ليلى حسين", email: "layla@example.com", phone: "+966 54 321 0987", bookingsCount: 15, totalSpent: 6200, currency: "SAR", joinedAt: "2023-12-15", lastActive: "2024-02-15", status: "active", hue: 280 },
  { id: "c6", name: "Mohammed Ali", nameAr: "محمد علي", email: "mohammed@example.com", phone: "+971 55 777 8888", bookingsCount: 1, totalSpent: 150, currency: "AED", joinedAt: "2024-02-10", lastActive: "2024-02-10", status: "banned", hue: 0 },
];

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  active: { icon: <CheckCircle2 className="size-3" />, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  suspended: { icon: <XCircle className="size-3" />, color: "text-amber-600", bg: "bg-amber-500/10" },
  banned: { icon: <Ban className="size-3" />, color: "text-red-600", bg: "bg-red-500/10" },
};

export function CustomerManagement({ locale = "en" }: { locale?: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addState, addFormAction, addPending] = useActionState<AddCustomerState, FormData>(addCustomerAction, {});

  // Close modal on success
  useEffect(() => {
    if (addState.success && showAddModal) {
      const timer = setTimeout(() => setShowAddModal(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [addState.success, showAddModal]);

  const filteredCustomers = useMemo(() => {
    return DEMO_CUSTOMERS.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [searchQuery, statusFilter]);

  const totalSpent = filteredCustomers.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalBookings = filteredCustomers.reduce((sum, c) => sum + c.bookingsCount, 0);

  const exportCSV = () => {
    const headers = ["Name", "Email", "Phone", "Bookings", "Total Spent", "Currency", "Status", "Joined", "Last Active"];
    const rows = filteredCustomers.map((c) => [
      locale === "ar" ? c.nameAr : c.name,
      c.email,
      c.phone,
      c.bookingsCount.toString(),
      c.totalSpent.toString(),
      c.currency,
      c.status,
      c.joinedAt,
      c.lastActive,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().split("T")[0]}.csv`;
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
            <Users className="size-6 text-brand-500" /> Customer Management
          </h1>
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
            View and manage all customers
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAddModal(true)} size="sm">
            <Plus className="size-4 mr-2" />
            Add Customer
          </Button>
          <Button onClick={exportCSV} variant="outline" size="sm">
            <Download className="size-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-ink-500">Total Customers</p>
            <p className="mt-1 text-2xl font-black text-ink-900 dark:text-ink-50">{filteredCustomers.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-emerald-600">Total Bookings</p>
            <p className="mt-1 text-2xl font-black text-emerald-600">{totalBookings}</p>
          </CardContent>
        </Card>
        <Card className="border-brand-500/20 bg-brand-500/5">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-brand-600">Total Spent</p>
            <p className="mt-1 text-2xl font-black text-brand-600">${totalSpent.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            placeholder="Search customers..."
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
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
      </div>

      {/* Customer Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredCustomers.map((customer, i) => (
          <motion.div
            key={customer.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedCustomer?.id === customer.id ? "ring-2 ring-brand-500" : ""
              }`}
              onClick={() => setSelectedCustomer(selectedCustomer?.id === customer.id ? null : customer)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="size-10 rounded-full"
                      style={{ backgroundColor: `hsl(${customer.hue}, 70%, 50%)` }}
                    />
                    <div>
                      <p className="font-bold text-ink-900 dark:text-ink-50">
                        {locale === "ar" ? customer.nameAr : customer.name}
                      </p>
                      <p className="text-xs text-ink-400">{customer.email}</p>
                    </div>
                  </div>
                  <Badge className={`${STATUS_CONFIG[customer.status].bg} ${STATUS_CONFIG[customer.status].color}`}>
                    {STATUS_CONFIG[customer.status].icon}
                    {customer.status}
                  </Badge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-ink-50 p-2 dark:bg-ink-800/50">
                    <p className="text-lg font-black text-ink-900 dark:text-ink-50">{customer.bookingsCount}</p>
                    <p className="text-[10px] text-ink-400">Bookings</p>
                  </div>
                  <div className="rounded-lg bg-ink-50 p-2 dark:bg-ink-800/50">
                    <p className="text-lg font-black text-brand-600">${customer.totalSpent.toLocaleString()}</p>
                    <p className="text-[10px] text-ink-400">Spent</p>
                  </div>
                </div>

                {selectedCustomer?.id === customer.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-4 space-y-2 border-t border-ink-100 pt-4 dark:border-ink-800"
                  >
                    <div className="flex items-center gap-2 text-xs text-ink-500">
                      <Phone className="size-3" /> {customer.phone}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-500">
                      <Calendar className="size-3" /> Joined {formatDate(customer.joinedAt, locale as "en" | "ar")}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-ink-500">
                      <Eye className="size-3" /> Last active {formatDate(customer.lastActive, locale as "en" | "ar")}
                    </div>
                    <div className="flex gap-2 pt-2">
                      {customer.status === "active" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs text-amber-600">
                          Suspend
                        </Button>
                      )}
                      {customer.status !== "banned" && (
                        <Button variant="outline" size="sm" className="h-7 text-xs text-red-600">
                          Ban
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Users className="size-10 text-ink-300 dark:text-ink-600" />
            <p className="font-bold text-ink-900 dark:text-ink-50">No customers found</p>
            <p className="text-sm text-ink-400">Try adjusting your search</p>
          </CardContent>
        </Card>
      )}

      {/* Add Customer Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">Add New Customer</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <X className="size-5" />
                </button>
              </div>

              <form action={addFormAction} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Name *</label>
                  <input
                    name="name"
                    type="text"
                    required
                    minLength={2}
                    placeholder="Ahmed Ali"
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Email *</label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="ahmed@example.com"
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Password *</label>
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Phone</label>
                  <input
                    name="phone"
                    type="tel"
                    placeholder="+961 71 123 456"
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-700 dark:text-ink-300">Role</label>
                  <select
                    name="role"
                    defaultValue="customer"
                    className="h-10 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm dark:border-ink-700 dark:bg-ink-800"
                  >
                    <option value="customer">Customer</option>
                    <option value="worker">Worker</option>
                    <option value="company">Company</option>
                  </select>
                </div>

                {/* Success/Error Messages */}
                {addState.error && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                    {addState.error}
                  </div>
                )}
                {addState.success && addState.customer && (
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                    ✓ Customer "{addState.customer.name}" created successfully!
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={addPending} className="flex-1">
                    {addPending ? (
                      <><Loader2 className="size-4 mr-2 animate-spin" /> Creating...</>
                    ) : (
                      <><Plus className="size-4 mr-2" /> Add Customer</>
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
