"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FileText, Download, Calendar, TrendingUp, DollarSign, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatCompact } from "@/lib/utils";

interface QuarterlyData {
  quarter: string;
  year: number;
  revenue: number;
  expenses: number;
  fees: number;
  refunds: number;
  netIncome: number;
  workers: number;
  transactions: number;
}

interface TaxComplianceProps {
  locale?: string;
}

export function TaxComplianceReport({ locale = "en" }: TaxComplianceProps) {
  const [selectedYear, setSelectedYear] = useState(2024);

  // Demo quarterly data
  const quarterlyData: QuarterlyData[] = [
    { quarter: "Q1", year: 2024, revenue: 45200, expenses: 12300, fees: 8400, refunds: 1200, netIncome: 23300, workers: 156, transactions: 2340 },
    { quarter: "Q2", year: 2024, revenue: 52800, expenses: 14100, fees: 9800, refunds: 1500, netIncome: 27400, workers: 189, transactions: 2780 },
    { quarter: "Q3", year: 2024, revenue: 61400, expenses: 15800, fees: 11200, refunds: 1800, netIncome: 32600, workers: 215, transactions: 3120 },
    { quarter: "Q4", year: 2024, revenue: 58900, expenses: 14900, fees: 10600, refunds: 1600, netIncome: 31800, workers: 232, transactions: 2950 },
  ];

  const yearData = quarterlyData.filter((q) => q.year === selectedYear);
  const totalRevenue = yearData.reduce((s, q) => s + q.revenue, 0);
  const totalExpenses = yearData.reduce((s, q) => s + q.expenses, 0);
  const totalFees = yearData.reduce((s, q) => s + q.fees, 0);
  const totalRefunds = yearData.reduce((s, q) => s + q.refunds, 0);
  const totalNetIncome = yearData.reduce((s, q) => s + q.netIncome, 0);
  const totalTransactions = yearData.reduce((s, q) => s + q.transactions, 0);

  const exportReport = () => {
    const headers = ["Quarter", "Revenue", "Expenses", "Platform Fees", "Refunds", "Net Income", "Workers", "Transactions"];
    const rows = yearData.map((q) => [
      q.quarter,
      q.revenue.toFixed(2),
      q.expenses.toFixed(2),
      q.fees.toFixed(2),
      q.refunds.toFixed(2),
      q.netIncome.toFixed(2),
      q.workers.toString(),
      q.transactions.toString(),
    ]);
    const summary = ["TOTAL", totalRevenue.toFixed(2), totalExpenses.toFixed(2), totalFees.toFixed(2), totalRefunds.toFixed(2), totalNetIncome.toFixed(2), "", totalTransactions.toString()];
    const csv = [headers, ...rows, summary].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-report-${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-5 text-brand-500" />
          {locale === "ar" ? "تقرير الضرائب والامتثال" : "Tax & Compliance Report"}
        </CardTitle>
        <div className="flex items-center gap-2">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="h-8 rounded-lg border border-ink-200 bg-white px-2 text-xs dark:border-ink-700 dark:bg-ink-900"
          >
            <option value={2024}>2024</option>
            <option value={2023}>2023</option>
          </select>
          <Button onClick={exportReport} variant="outline" size="sm" className="h-8">
            <Download className="size-3 mr-1" />
            Export
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Annual Summary */}
        <div className="grid grid-cols-2 gap-3">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-emerald-500/10 p-4"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="size-4 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">
                {locale === "ar" ? "صافي الدخل" : "Net Income"}
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-600">
              ${formatCompact(totalNetIncome)}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl bg-blue-500/10 p-4"
          >
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-blue-500" />
              <span className="text-xs font-medium text-blue-600">
                {locale === "ar" ? "الإيرادات" : "Total Revenue"}
              </span>
            </div>
            <p className="mt-2 text-2xl font-black text-blue-600">
              ${formatCompact(totalRevenue)}
            </p>
          </motion.div>
        </div>

        {/* Quarterly Breakdown */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">
            {locale === "ar" ? "المبيعات الفصلية" : "Quarterly Breakdown"}
          </h4>
          <div className="space-y-2">
            {yearData.map((q, i) => (
              <motion.div
                key={q.quarter}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-xl bg-white/70 p-3 dark:bg-ink-900/70"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">{q.quarter}</Badge>
                    <span className="text-sm font-bold text-ink-900 dark:text-ink-50">
                      ${formatCompact(q.revenue)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-emerald-600">+${formatCompact(q.netIncome)}</span>
                    <span className="text-ink-400">·</span>
                    <span className="text-ink-500">{q.transactions} txns</span>
                  </div>
                </div>
                {/* Mini bar */}
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${(q.netIncome / q.revenue) * 100}%` }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Summary Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-ink-100 dark:border-ink-800">
                <th className="px-2 py-2 text-left font-semibold text-ink-500">Metric</th>
                <th className="px-2 py-2 text-right font-semibold text-ink-500">Amount</th>
                <th className="px-2 py-2 text-right font-semibold text-ink-500">% of Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: locale === "ar" ? "الإيرادات" : "Revenue", value: totalRevenue, color: "text-blue-600" },
                { label: locale === "ar" ? "المصروفات" : "Expenses", value: totalExpenses, color: "text-red-600" },
                { label: locale === "ar" ? "رسوم المنصة" : "Platform Fees", value: totalFees, color: "text-brand-600" },
                { label: locale === "ar" ? "المبالغ المستردة" : "Refunds", value: totalRefunds, color: "text-amber-600" },
                { label: locale === "ar" ? "صافي الدخل" : "Net Income", value: totalNetIncome, color: "text-emerald-600" },
              ].map((row) => (
                <tr key={row.label} className="border-b border-ink-50 dark:border-ink-800/50">
                  <td className="px-2 py-2 font-medium text-ink-700 dark:text-ink-200">{row.label}</td>
                  <td className={`px-2 py-2 text-right font-bold ${row.color}`}>
                    ${formatCompact(row.value)}
                  </td>
                  <td className="px-2 py-2 text-right text-ink-500">
                    {totalRevenue > 0 ? ((row.value / totalRevenue) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Compliance Notes */}
        <div className="rounded-xl bg-ink-50 p-4 dark:bg-ink-800/50">
          <h4 className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
            {locale === "ar" ? "ملاحظات الامتثال" : "Compliance Notes"}
          </h4>
          <ul className="space-y-1 text-xs text-ink-500">
            <li>• {locale === "ar" ? "جميع المعاملات مسجلة ومدفوعة الضريبة" : "All transactions are recorded and tax-compliant"}</li>
            <li>• {locale === "ar" ? "snd invoices generated automatically" : "Invoices generated automatically for each transaction"}</li>
            <li>• {locale === "ar" ? "بيانات محفوظة لمدة 7 سنوات" : "Data retained for 7 years per regulatory requirements"}</li>
            <li>• {locale === "ar" ? "تصدير CSV متاح للتقارير المحاسبية" : "CSV export available for accounting reports"}</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
