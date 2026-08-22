"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { CacheManagement } from "@/components/admin/cache-management";

export default function CachePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Cache Management</h1>
        <CacheManagement />
      </div>
    </div>
  );
}
