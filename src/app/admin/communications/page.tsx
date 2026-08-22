"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmailCampaignManager } from "@/components/dashboard/email-campaign-manager";
import { PushNotificationManager } from "@/components/dashboard/push-notification-manager";
import { DiscountCodeManager } from "@/components/dashboard/discount-code-manager";
import {
  Mail,
  Bell,
  Tag,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

type ActiveTab = "email" | "push" | "discounts";

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("email");

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Communication Tools</h1>
          <p className="text-gray-600 mt-2">Manage email campaigns, push notifications, and promotional codes</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab("email")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "email"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Mail className="w-4 h-4 inline mr-2" />
              Email Campaigns
            </button>
            <button
              onClick={() => setActiveTab("push")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "push"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Bell className="w-4 h-4 inline mr-2" />
              Push Notifications
            </button>
            <button
              onClick={() => setActiveTab("discounts")}
              className={cn(
                "pb-3 px-1 text-sm font-medium border-b-2 transition-colors",
                activeTab === "discounts"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Tag className="w-4 h-4 inline mr-2" />
              Discount Codes
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "email" && <EmailCampaignManager />}
        {activeTab === "push" && <PushNotificationManager />}
        {activeTab === "discounts" && <DiscountCodeManager />}
      </div>
    </div>
  );
}
