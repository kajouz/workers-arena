"use client";

import { useState } from "react";
import { cn, formatNumber } from "@/lib/utils";
import { DollarSign, TrendingUp, TrendingDown, Wallet, Clock, Download, Eye, ChevronDown, ChevronRight } from "lucide-react";

interface WorkerEarning {
  id: string;
  workerId: string;
  workerName: string;
  workerNameAr: string;
  totalEarnings: number;
  pendingPayouts: number;
  completedBookings: number;
  averageRating: number;
  recentTransactions: { id: string; type: "earning" | "payout" | "refund"; amount: number; date: string; description: string }[];
}

export function WorkerEarnings() {
  const [workers, setWorkers] = useState<WorkerEarning[]>([
    { id: "1", workerId: "w1", workerName: "Khaled Al Harbi", workerNameAr: "خالد الحربي", totalEarnings: 12500, pendingPayouts: 2500, completedBookings: 45, averageRating: 4.8, recentTransactions: [{ id: "t1", type: "earning", amount: 500, date: "2025-01-17", description: "Plumbing service - BK-1002" }, { id: "t2", type: "payout", amount: -1000, date: "2025-01-15", description: "Payout to OMT" }] },
    { id: "2", workerId: "w2", workerName: "Ali Hassan", workerNameAr: "علي حسن", totalEarnings: 8900, pendingPayouts: 1800, completedBookings: 32, averageRating: 4.6, recentTransactions: [{ id: "t3", type: "earning", amount: 750, date: "2025-01-16", description: "Carpentry service - BK-0998" }] },
    { id: "3", workerId: "w3", workerName: "Omar Al Mutairi", workerNameAr: "عمر المطيري", totalEarnings: 6200, pendingPayouts: 800, completedBookings: 24, averageRating: 4.9, recentTransactions: [] },
  ]);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-ink-900 dark:text-ink-50">${formatNumber(workers.reduce((s, w) => s + w.totalEarnings, 0))}</p><p className="text-sm text-ink-500 dark:text-ink-400">Total Earnings</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-orange-600">${formatNumber(workers.reduce((s, w) => s + w.pendingPayouts, 0))}</p><p className="text-sm text-ink-500 dark:text-ink-400">Pending Payouts</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-green-600">{workers.reduce((s, w) => s + w.completedBookings, 0)}</p><p className="text-sm text-ink-500 dark:text-ink-400">Completed Bookings</p></div>
        <div className="bg-white dark:bg-ink-900 rounded-xl p-4 border border-ink-200 dark:border-ink-800"><p className="text-2xl font-bold text-yellow-600">{(workers.reduce((s, w) => s + w.averageRating, 0) / workers.length).toFixed(1)} ⭐</p><p className="text-sm text-ink-500 dark:text-ink-400">Avg Rating</p></div>
      </div>
      <div className="bg-white dark:bg-ink-900 rounded-xl border border-ink-200 dark:border-ink-800 overflow-hidden">
        {workers.map((worker) => (
          <div key={worker.id} className="border-b border-ink-200 dark:border-ink-800 last:border-b-0">
            <button onClick={() => setExpandedWorker(expandedWorker === worker.id ? null : worker.id)} className="w-full flex items-center justify-between p-4 hover:bg-ink-50 dark:hover:bg-ink-950">
              <div className="flex items-center gap-4"><div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold">{worker.workerName.charAt(0)}</div><div className="text-start"><p className="font-medium text-ink-900 dark:text-ink-50">{worker.workerName}</p><p className="text-sm text-ink-500 dark:text-ink-400">{worker.workerNameAr}</p></div></div>
              <div className="flex items-center gap-8 text-sm"><div className="text-end"><p className="font-bold text-green-600">${formatNumber(worker.totalEarnings)}</p><p className="text-ink-500 dark:text-ink-400">Earnings</p></div><div className="text-end"><p className="font-bold text-orange-600">${formatNumber(worker.pendingPayouts)}</p><p className="text-ink-500 dark:text-ink-400">Pending</p></div><div className="text-end"><p className="font-bold">{worker.completedBookings}</p><p className="text-ink-500 dark:text-ink-400">Bookings</p></div>{expandedWorker === worker.id ? <ChevronDown className="w-5 h-5 text-ink-400 dark:text-ink-500" /> : <ChevronRight className="w-5 h-5 text-ink-400 dark:text-ink-500" />}</div>
            </button>
            {expandedWorker === worker.id && (
              <div className="p-4 bg-ink-50 dark:bg-ink-950 border-t border-ink-200 dark:border-ink-800">
                <p className="font-medium text-ink-700 dark:text-ink-200 mb-2">Recent Transactions</p>
                {worker.recentTransactions.length === 0 ? <p className="text-sm text-ink-500 dark:text-ink-400">No recent transactions</p> : (
                  <div className="space-y-2">
                    {worker.recentTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-2 bg-white dark:bg-ink-900 rounded-lg">
                        <div className="flex items-center gap-2">{tx.type === "earning" ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />}<div><p className="text-sm font-medium">{tx.description}</p><p className="text-xs text-ink-500 dark:text-ink-400">{tx.date}</p></div></div>
                        <span className={cn("font-bold", tx.amount > 0 ? "text-green-600" : "text-red-600")}>{tx.amount > 0 ? "+" : ""}${Math.abs(tx.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
