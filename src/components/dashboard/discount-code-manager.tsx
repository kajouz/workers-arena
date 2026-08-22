"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Tag,
  Plus,
  Copy,
  Trash2,
  CheckCircle,
  XCircle,
  Calendar,
  Users,
  DollarSign,
  BarChart3,
  Search,
  Filter,
  Edit,
  Percent,
  Clock,
  AlertCircle,
} from "lucide-react";

interface DiscountCode {
  id: string;
  code: string;
  description: string;
  type: "percentage" | "fixed";
  value: number;
  minBookingAmount?: number;
  maxDiscount?: number;
  usageLimit?: number;
  usageCount: number;
  userLimit?: number;
  validFrom: string;
  validUntil?: string;
  isActive: boolean;
  applicableTo: "all" | "new_users" | "premium" | "specific_category";
  categorySlug?: string;
  createdAt: string;
  createdBy: string;
}

const applicableToLabels: Record<string, string> = {
  all: "All Users",
  new_users: "New Users Only",
  premium: "Premium Workers",
  specific_category: "Specific Category",
};

export function DiscountCodeManager() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCode, setNewCode] = useState({
    code: "",
    description: "",
    type: "percentage" as DiscountCode["type"],
    value: 10,
    minBookingAmount: 0,
    maxDiscount: 0,
    usageLimit: 100,
    userLimit: 1,
    validFrom: new Date().toISOString().split("T")[0],
    validUntil: "",
    applicableTo: "all" as DiscountCode["applicableTo"],
    categorySlug: "",
  });
  const [stats, setStats] = useState({
    totalCodes: 0,
    activeCodes: 0,
    totalRedemptions: 0,
    totalSavings: 0,
  });

  useEffect(() => {
    // Mock data
    setCodes([
      {
        id: "1",
        code: "WELCOME20",
        description: "Welcome offer for new customers",
        type: "percentage",
        value: 20,
        minBookingAmount: 50,
        maxDiscount: 30,
        usageLimit: 500,
        usageCount: 234,
        userLimit: 1,
        validFrom: "2025-01-01",
        validUntil: "2025-02-28",
        isActive: true,
        applicableTo: "new_users",
        createdAt: "2025-01-01T00:00:00Z",
        createdBy: "admin@workersarena.com",
      },
      {
        id: "2",
        code: "PREMIUM50",
        description: "50% off first month for premium workers",
        type: "percentage",
        value: 50,
        usageLimit: 100,
        usageCount: 67,
        userLimit: 1,
        validFrom: "2025-01-15",
        validUntil: "2025-03-31",
        isActive: true,
        applicableTo: "premium",
        createdAt: "2025-01-15T10:00:00Z",
        createdBy: "admin@workersarena.com",
      },
      {
        id: "3",
        code: "FLAT10",
        description: "$10 off any booking",
        type: "fixed",
        value: 10,
        minBookingAmount: 30,
        usageLimit: 200,
        usageCount: 89,
        validFrom: "2025-01-10",
        validUntil: "2025-01-31",
        isActive: true,
        applicableTo: "all",
        createdAt: "2025-01-10T14:00:00Z",
        createdBy: "admin@workersarena.com",
      },
      {
        id: "4",
        code: "PLUMBING15",
        description: "15% off plumbing services",
        type: "percentage",
        value: 15,
        usageLimit: 50,
        usageCount: 50,
        validFrom: "2025-01-01",
        validUntil: "2025-01-15",
        isActive: false,
        applicableTo: "specific_category",
        categorySlug: "plumbing",
        createdAt: "2025-01-01T00:00:00Z",
        createdBy: "admin@workersarena.com",
      },
    ]);

    setStats({
      totalCodes: 4,
      activeCodes: 3,
      totalRedemptions: 440,
      totalSavings: 3250,
    });
  }, []);

  const filteredCodes = codes.filter((c) => {
    const matchesSearch = c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" ||
      (filterStatus === "active" && c.isActive) ||
      (filterStatus === "inactive" && !c.isActive) ||
      (filterStatus === "expired" && c.validUntil && new Date(c.validUntil) < new Date());
    return matchesSearch && matchesStatus;
  });

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const handleCreateCode = () => {
    if (!newCode.description || !newCode.value) return;
    
    const code: DiscountCode = {
      id: Date.now().toString(),
      code: newCode.code || generateCode(),
      description: newCode.description,
      type: newCode.type,
      value: newCode.value,
      minBookingAmount: newCode.minBookingAmount || undefined,
      maxDiscount: newCode.maxDiscount || undefined,
      usageLimit: newCode.usageLimit || undefined,
      usageCount: 0,
      userLimit: newCode.userLimit || undefined,
      validFrom: newCode.validFrom,
      validUntil: newCode.validUntil || undefined,
      isActive: true,
      applicableTo: newCode.applicableTo,
      categorySlug: newCode.applicableTo === "specific_category" ? newCode.categorySlug : undefined,
      createdAt: new Date().toISOString(),
      createdBy: "admin@workersarena.com",
    };
    
    setCodes([code, ...codes]);
    setShowCreateModal(false);
    setNewCode({
      code: "", description: "", type: "percentage", value: 10,
      minBookingAmount: 0, maxDiscount: 0, usageLimit: 100, userLimit: 1,
      validFrom: new Date().toISOString().split("T")[0], validUntil: "",
      applicableTo: "all", categorySlug: "",
    });
  };

  const handleToggleActive = (id: string) => {
    setCodes(codes.map((c) => c.id === id ? { ...c, isActive: !c.isActive } : c));
  };

  const handleDeleteCode = (id: string) => {
    if (confirm("Are you sure you want to delete this discount code?")) {
      setCodes(codes.filter((c) => c.id !== id));
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    alert("Code copied to clipboard!");
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Tag className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalCodes}</p>
              <p className="text-sm text-gray-500">Total Codes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.activeCodes}</p>
              <p className="text-sm text-gray-500">Active Codes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalRedemptions.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Redemptions</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <DollarSign className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">${stats.totalSavings.toLocaleString()}</p>
              <p className="text-sm text-gray-500">Total Savings</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search codes..."
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
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="expired">Expired</option>
        </select>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Code
        </button>
      </div>

      {/* Discount Codes List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCodes.map((code) => (
          <div key={code.id} className={cn(
            "bg-white rounded-xl border p-4 transition-all",
            code.isActive ? "border-gray-200 hover:shadow-md" : "border-gray-100 opacity-60"
          )}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">
                  {code.code}
                </span>
                <button
                  onClick={() => copyToClipboard(code.code)}
                  className="text-gray-400 hover:text-gray-600"
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggleActive(code.id)}
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-full",
                    code.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                  )}
                >
                  {code.isActive ? "Active" : "Inactive"}
                </button>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 mb-3">{code.description}</p>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex items-center gap-2 text-sm">
                {code.type === "percentage" ? (
                  <Percent className="w-4 h-4 text-blue-500" />
                ) : (
                  <DollarSign className="w-4 h-4 text-green-500" />
                )}
                <span className="font-medium">{code.value}{code.type === "percentage" ? "%" : "$"}</span>
                <span className="text-gray-500">off</span>
              </div>
              {code.minBookingAmount && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Min: ${code.minBookingAmount}</span>
                </div>
              )}
              {code.maxDiscount && (
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Max: ${code.maxDiscount}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-gray-400" />
                <span className="text-gray-600">
                  {code.usageCount}/{code.usageLimit || "∞"} used
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(code.validFrom).toLocaleDateString()}
                {code.validUntil && ` - ${new Date(code.validUntil).toLocaleDateString()}`}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {applicableToLabels[code.applicableTo]}
              </span>
            </div>

            {/* Usage Progress Bar */}
            {code.usageLimit && (
              <div className="mb-3">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      code.usageCount >= code.usageLimit ? "bg-red-500" : "bg-blue-500"
                    )}
                    style={{ width: `${Math.min((code.usageCount / code.usageLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500">
                Created by {code.createdBy}
              </span>
              <div className="flex items-center gap-2">
                <button className="text-gray-400 hover:text-gray-600" title="Edit">
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteCode(code.id)}
                  className="text-red-500 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create Discount Code</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code (Leave blank to auto-generate)</label>
                <input
                  type="text"
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., SUMMER20"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newCode.description}
                  onChange={(e) => setNewCode({ ...newCode, description: e.target.value })}
                  placeholder="e.g., Summer sale discount"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newCode.type}
                    onChange={(e) => setNewCode({ ...newCode, type: e.target.value as DiscountCode["type"] })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                  <input
                    type="number"
                    value={newCode.value}
                    onChange={(e) => setNewCode({ ...newCode, value: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Booking Amount</label>
                  <input
                    type="number"
                    value={newCode.minBookingAmount}
                    onChange={(e) => setNewCode({ ...newCode, minBookingAmount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount</label>
                  <input
                    type="number"
                    value={newCode.maxDiscount}
                    onChange={(e) => setNewCode({ ...newCode, maxDiscount: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Usage Limit</label>
                  <input
                    type="number"
                    value={newCode.usageLimit}
                    onChange={(e) => setNewCode({ ...newCode, usageLimit: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Per User Limit</label>
                  <input
                    type="number"
                    value={newCode.userLimit}
                    onChange={(e) => setNewCode({ ...newCode, userLimit: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                  <input
                    type="date"
                    value={newCode.validFrom}
                    onChange={(e) => setNewCode({ ...newCode, validFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until (Optional)</label>
                  <input
                    type="date"
                    value={newCode.validUntil}
                    onChange={(e) => setNewCode({ ...newCode, validUntil: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applicable To</label>
                <select
                  value={newCode.applicableTo}
                  onChange={(e) => setNewCode({ ...newCode, applicableTo: e.target.value as DiscountCode["applicableTo"] })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Object.entries(applicableToLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              {newCode.applicableTo === "specific_category" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category Slug</label>
                  <input
                    type="text"
                    value={newCode.categorySlug}
                    onChange={(e) => setNewCode({ ...newCode, categorySlug: e.target.value })}
                    placeholder="e.g., plumbing"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateCode}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Create Code
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
