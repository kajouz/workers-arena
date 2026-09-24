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
import { Link } from "@/components/i18n/link";

type ActiveTab = "security" | "audit" | "fraud";

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("security");

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="flex items-center gap-2 text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-ink-50 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-ink-900 dark:text-ink-50">Security & Audit</h1>
          <p className="text-ink-600 dark:text-ink-300 mt-2">Monitor security events, audit trails, and fraud detection</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-ink-200 dark:border-ink-800 mb-6">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("security")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "security"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              )}
            >
              <Shield className="w-4 h-4 inline me-2" />
              Security Dashboard
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "audit"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              )}
            >
              <History className="w-4 h-4 inline me-2" />
              Audit Trail
            </button>
            <button
              onClick={() => setActiveTab("fraud")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "fraud"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-ink-500 dark:text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
              )}
            >
              <AlertTriangle className="w-4 h-4 inline me-2" />
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
