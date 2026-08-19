"use client";

import { useState } from "react";
import { Download, FileText, Table, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import { exportToCSV, exportToPDF, exportToJSON } from "@/lib/export/csv-export";

interface AnalyticsData {
  pageViews: { path: string; views: number; uniqueVisitors: number }[];
  topWorkers: { name: string; views: number; leads: number; bookings: number }[];
  revenue: { date: string; amount: number; currency: string }[];
  searchQueries: { query: string; count: number; results: number }[];
  deviceBreakdown: { device: string; percentage: number }[];
  locationBreakdown: { city: string; visitors: number }[];
}

interface AnalyticsExportProps {
  data: AnalyticsData;
  dateRange?: { start: Date; end: Date };
  className?: string;
}

type ExportFormat = "csv" | "pdf" | "json";
type ExportSection = "pageViews" | "topWorkers" | "revenue" | "searchQueries" | "deviceBreakdown" | "locationBreakdown";

const SECTION_LABELS: Record<ExportSection, { en: string; ar: string }> = {
  pageViews: { en: "Page Views", ar: "مشاهدات الصفحة" },
  topWorkers: { en: "Top Workers", ar: "أفضل العمال" },
  revenue: { en: "Revenue", ar: "الإيرادات" },
  searchQueries: { en: "Search Queries", ar: "استعلامات البحث" },
  deviceBreakdown: { en: "Device Breakdown", ar: "توزيع الأجهزة" },
  locationBreakdown: { en: "Location Breakdown", ar: "توزيع المواقع" },
};

/**
 * Analytics export component
 */
export function AnalyticsExport({
  data,
  dateRange,
  className,
}: AnalyticsExportProps) {
  const { locale } = useLocale();
  const isArabic = locale === "ar";
  const [exporting, setExporting] = useState<string | null>(null);

  const dateRangeLabel = dateRange
    ? `${dateRange.start.toLocaleDateString()} - ${dateRange.end.toLocaleDateString()}`
    : "";

  const handleExport = async (section: ExportSection, format: ExportFormat) => {
    setExporting(`${section}-${format}`);

    try {
      const sectionData = data[section] as any[];
      const filename = `analytics-${section}-${new Date().toISOString().split("T")[0]}`;

      const columns = getColumnsForSection(section);

      switch (format) {
        case "csv":
          exportToCSV(sectionData, columns, filename);
          break;
        case "pdf":
          exportToPDF(
            sectionData as any,
            columns as any,
            `${SECTION_LABELS[section][isArabic ? "ar" : "en"]} ${dateRangeLabel}`,
            filename
          );
          break;
        case "json":
          exportToJSON(sectionData, filename);
          break;
      }
    } catch (error) {
      console.error("[AnalyticsExport] Export failed:", error);
    } finally {
      setExporting(null);
    }
  };

  const handleExportAll = async (format: ExportFormat) => {
    setExporting(`all-${format}`);

    try {
      const allData = {
        pageViews: data.pageViews,
        topWorkers: data.topWorkers,
        revenue: data.revenue,
        searchQueries: data.searchQueries,
        deviceBreakdown: data.deviceBreakdown,
        locationBreakdown: data.locationBreakdown,
      };

      const filename = `analytics-full-${new Date().toISOString().split("T")[0]}`;

      switch (format) {
        case "csv":
          // Export each section as separate CSV
          Object.entries(allData).forEach(([key, sectionData]) => {
            const columns = getColumnsForSection(key as ExportSection);
            exportToCSV(sectionData as Record<string, any>[], columns as any, `${filename}-${key}`);
          });
          break;
        case "pdf":
          // Create combined PDF
          const html = generateCombinedPDFHTML(allData, dateRangeLabel, isArabic);
          const printWindow = window.open("", "_blank");
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.print();
          }
          break;
        case "json":
          exportToJSON([allData], filename);
          break;
      }
    } catch (error) {
      console.error("[AnalyticsExport] Export all failed:", error);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Export all */}
      <div className="flex items-center justify-between rounded-xl border border-ink-200/80 bg-white p-4 dark:border-ink-800 dark:bg-ink-900">
        <div>
          <h3 className="font-bold text-ink-900 dark:text-ink-50">
            {isArabic ? "تصدير البيانات" : "Export Data"}
          </h3>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {isArabic ? "تحميل التقارير بصيغ مختلفة" : "Download reports in various formats"}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportButton
            format="csv"
            onClick={() => handleExportAll("csv")}
            loading={exporting === "all-csv"}
            isArabic={isArabic}
          />
          <ExportButton
            format="pdf"
            onClick={() => handleExportAll("pdf")}
            loading={exporting === "all-pdf"}
            isArabic={isArabic}
          />
          <ExportButton
            format="json"
            onClick={() => handleExportAll("json")}
            loading={exporting === "all-json"}
            isArabic={isArabic}
          />
        </div>
      </div>

      {/* Section exports */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(SECTION_LABELS) as ExportSection[]).map((section) => (
          <div
            key={section}
            className="rounded-xl border border-ink-200/80 bg-white p-4 dark:border-ink-800 dark:bg-ink-900"
          >
            <h4 className="mb-3 font-bold text-ink-900 dark:text-ink-50">
              {SECTION_LABELS[section][isArabic ? "ar" : "en"]}
            </h4>
            <div className="flex gap-2">
              <ExportButton
                format="csv"
                onClick={() => handleExport(section, "csv")}
                loading={exporting === `${section}-csv`}
                isArabic={isArabic}
                size="sm"
              />
              <ExportButton
                format="pdf"
                onClick={() => handleExport(section, "pdf")}
                loading={exporting === `${section}-pdf`}
                isArabic={isArabic}
                size="sm"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExportButton({
  format,
  onClick,
  loading,
  isArabic,
  size = "default",
}: {
  format: ExportFormat;
  onClick: () => void;
  loading: boolean;
  isArabic: boolean;
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const labels = {
    csv: isArabic ? "CSV" : "CSV",
    pdf: isArabic ? "PDF" : "PDF",
    json: isArabic ? "JSON" : "JSON",
  };

  return (
    <Button
      variant="outline"
      size={size}
      onClick={onClick}
      disabled={loading}
      className="gap-1.5"
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {labels[format]}
    </Button>
  );
}

function getColumnsForSection(section: ExportSection) {
  const columns: Record<ExportSection, { key: string; label: string }[]> = {
    pageViews: [
      { key: "path", label: "Page" },
      { key: "views", label: "Views" },
      { key: "uniqueVisitors", label: "Unique Visitors" },
    ],
    topWorkers: [
      { key: "name", label: "Worker" },
      { key: "views", label: "Views" },
      { key: "leads", label: "Leads" },
      { key: "bookings", label: "Bookings" },
    ],
    revenue: [
      { key: "date", label: "Date" },
      { key: "amount", label: "Amount" },
      { key: "currency", label: "Currency" },
    ],
    searchQueries: [
      { key: "query", label: "Query" },
      { key: "count", label: "Count" },
      { key: "results", label: "Results" },
    ],
    deviceBreakdown: [
      { key: "device", label: "Device" },
      { key: "percentage", label: "Percentage" },
    ],
    locationBreakdown: [
      { key: "city", label: "City" },
      { key: "visitors", label: "Visitors" },
    ],
  };
  return columns[section];
}

function generateCombinedPDFHTML(
  data: AnalyticsData,
  dateRange: string,
  isArabic: boolean
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Analytics Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    h1 { font-size: 24px; }
    h2 { font-size: 18px; margin-top: 30px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f3f4f6; }
    .subtitle { color: #666; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>WorkersArena Analytics Report</h1>
  <p class="subtitle">${dateRange}</p>

  <h2>Page Views</h2>
  <table>
    <tr><th>Page</th><th>Views</th><th>Unique Visitors</th></tr>
    ${data.pageViews.map((p) => `<tr><td>${p.path}</td><td>${p.views}</td><td>${p.uniqueVisitors}</td></tr>`).join("")}
  </table>

  <h2>Top Workers</h2>
  <table>
    <tr><th>Worker</th><th>Views</th><th>Leads</th><th>Bookings</th></tr>
    ${data.topWorkers.map((w) => `<tr><td>${w.name}</td><td>${w.views}</td><td>${w.leads}</td><td>${w.bookings}</td></tr>`).join("")}
  </table>

  <h2>Revenue</h2>
  <table>
    <tr><th>Date</th><th>Amount</th><th>Currency</th></tr>
    ${data.revenue.map((r) => `<tr><td>${r.date}</td><td>${r.amount}</td><td>${r.currency}</td></tr>`).join("")}
  </table>

  <h2>Search Queries</h2>
  <table>
    <tr><th>Query</th><th>Count</th><th>Results</th></tr>
    ${data.searchQueries.map((s) => `<tr><td>${s.query}</td><td>${s.count}</td><td>${s.results}</td></tr>`).join("")}
  </table>
</body>
</html>
  `;
}
