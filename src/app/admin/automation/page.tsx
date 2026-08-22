"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AutomatedReports } from "@/components/dashboard/automated-reports";
import { SmartAlerts } from "@/components/dashboard/smart-alerts";
import { ScheduledTasks } from "@/components/dashboard/scheduled-tasks";
import {
  FileText,
  Bell,
  Clock,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

type ActiveTab = "reports" | "alerts" | "tasks";

export default function AutomationPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("reports");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Automation</h1>
          <p className="text-gray-600 mt-2">Manage automated reports, smart alerts, and scheduled tasks</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("reports")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "reports"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Automated Reports
            </button>
            <button
              onClick={() => setActiveTab("alerts")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "alerts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Bell className="w-4 h-4 inline mr-2" />
              Smart Alerts
            </button>
            <button
              onClick={() => setActiveTab("tasks")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "tasks"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Clock className="w-4 h-4 inline mr-2" />
              Scheduled Tasks
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "reports" && <AutomatedReports />}
        {activeTab === "alerts" && <SmartAlerts />}
        {activeTab === "tasks" && <ScheduledTasks />}
      </div>
    </div>
  );
}
