"use client";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/components/i18n/link";
import { WebhookManagement } from "@/components/admin/webhook-management";

export default function WebhooksPage() {
  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin" className="flex items-center gap-2 text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-ink-50 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-ink-900 dark:text-ink-50 mb-8">Webhook Management</h1>
        <WebhookManagement />
      </div>
    </div>
  );
}
