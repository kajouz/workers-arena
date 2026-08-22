"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { SecurityDashboard } from "@/components/dashboard/security-dashboard";
import { AuditTrail } from "@/components/dashboard/audit-trail";
import { FraudDetection } from "@/components/dashboard/fraud-detection";
import {
  Shield,
  History,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

type ActiveTab = "security" | "audit" | "fraud";

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("security");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Security & Audit</h1>
          <p className="text-gray-600 mt-2">Monitor security events, audit trails, and fraud detection</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("security")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "security"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Shield className="w-4 h-4 inline mr-2" />
              Security Dashboard
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "audit"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <History className="w-4 h-4 inline mr-2" />
              Audit Trail
            </button>
            <button
              onClick={() => setActiveTab("fraud")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "fraud"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <AlertTriangle className="w-4 h-4 inline mr-2" />
              Fraud Detection
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "security" && <SecurityDashboard />}
        {activeTab === "audit" && <AuditTrail />}
        {activeTab === "fraud" && <FraudDetection />}
      </div>
    </div>
  );
}
