"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  RefreshCw,
  Eye,
  Keyboard,
  Type,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import {
  runAudit,
  generateReportHTML,
  type AuditReport,
  type AuditResult,
} from "@/lib/accessibility/wcag-audit";

/**
 * WCAG 2.1 AA Compliance Audit Component
 */
export function AccessibilityAuditor() {
  const { locale } = useLocale();
  const isArabic = locale === "ar";

  const [report, setReport] = useState<AuditReport | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "passed" | "failed">("all");

  const runAccessibilityAudit = () => {
    setIsRunning(true);

    // Small delay to show loading state
    setTimeout(() => {
      const auditReport = runAudit();
      setReport(auditReport);
      setIsRunning(false);
    }, 1000);
  };

  const downloadReport = () => {
    if (!report) return;

    const html = generateReportHTML(report);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accessibility-report-${new Date().toISOString().split("T")[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredResults = report?.results.filter((r) => {
    if (filter === "passed") return r.passed;
    if (filter === "failed") return !r.passed;
    return true;
  });

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-500";
    if (score >= 70) return "text-amber-500";
    return "text-red-500";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return isArabic ? "ممتاز" : "Excellent";
    if (score >= 70) return isArabic ? "جيد" : "Good";
    if (score >= 50) return isArabic ? "مقبول" : "Needs Work";
    return isArabic ? "سيء" : "Poor";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink-900 dark:text-ink-50">
            {isArabic ? "auditتوافق WCAG 2.1 AA" : "WCAG 2.1 AA Audit"}
          </h2>
          <p className="text-sm text-ink-500 dark:text-ink-400">
            {isArabic
              ? "فحص توافق الموقع مع معايير إمكانية الوصول"
              : "Check your website's accessibility compliance"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runAccessibilityAudit}
            disabled={isRunning}
            className="gap-2"
          >
            {isRunning ? (
              <RefreshCw className="size-4 animate-spin" />
            ) : (
              <Eye className="size-4" />
            )}
            {isRunning
              ? isArabic ? "جاري الفحص..." : "Running..."
              : isArabic ? "بدء الفحص" : "Run Audit"}
          </Button>
          {report && (
            <Button variant="outline" onClick={downloadReport} className="gap-2">
              <Download className="size-4" />
              {isArabic ? "تحميل التقرير" : "Download Report"}
            </Button>
          )}
        </div>
      </div>

      {/* Results */}
      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Score */}
            <div className="rounded-2xl border border-ink-200/80 bg-white p-6 text-center shadow-soft dark:border-ink-800 dark:bg-ink-900">
              <div className={cn("text-6xl font-black", getScoreColor(report.score))}>
                {report.score}%
              </div>
              <p className="mt-2 text-lg font-bold text-ink-900 dark:text-ink-50">
                {getScoreLabel(report.score)}
              </p>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {isArabic ? "合规 WCAG 2.1 AA" : "WCAG 2.1 AA Compliance"}
              </p>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl bg-emerald-500/10 p-4 text-center">
                <CheckCircle className="mx-auto size-8 text-emerald-500" />
                <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {report.summary.passed}
                </p>
                <p className="text-xs text-emerald-600 dark:text-emerald-300">
                  {isArabic ? "ناجح" : "Passed"}
                </p>
              </div>
              <div className="rounded-xl bg-red-500/10 p-4 text-center">
                <XCircle className="mx-auto size-8 text-red-500" />
                <p className="mt-2 text-2xl font-bold text-red-700 dark:text-red-400">
                  {report.summary.failed}
                </p>
                <p className="text-xs text-red-600 dark:text-red-300">
                  {isArabic ? "خطأ" : "Errors"}
                </p>
              </div>
              <div className="rounded-xl bg-amber-500/10 p-4 text-center">
                <AlertTriangle className="mx-auto size-8 text-amber-500" />
                <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {report.summary.warnings}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-300">
                  {isArabic ? "تحذير" : "Warnings"}
                </p>
              </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2">
              {[
                { key: "all", label: isArabic ? "الكل" : "All" },
                { key: "passed", label: isArabic ? "ناجح" : "Passed" },
                { key: "failed", label: isArabic ? "فشل" : "Failed" },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key as typeof filter)}
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-bold transition-colors",
                    filter === item.key
                      ? "bg-brand-700 text-white"
                      : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Results list */}
            <div className="space-y-3">
              {filteredResults?.map((result, i) => (
                <ResultCard key={i} result={result} isArabic={isArabic} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!report && !isRunning && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-ink-300 bg-white/60 px-6 py-16 text-center dark:border-ink-700 dark:bg-ink-900/40">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800">
            <Eye className="size-8 text-ink-400" />
          </div>
          <h3 className="mt-5 text-lg font-bold text-ink-900 dark:text-ink-50">
            {isArabic ? "ابدأ فحص إمكانية الوصول" : "Run Accessibility Audit"}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-ink-500 dark:text-ink-400">
            {isArabic
              ? "فحص الموقع ضد معايير WCAG 2.1 AA لاكتشاف مشاكل إمكانية الوصول"
              : "Scan your page against WCAG 2.1 AA guidelines to find accessibility issues"}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Individual audit result card
 */
function ResultCard({
  result,
  isArabic,
}: {
  result: AuditResult;
  isArabic: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all",
        result.passed
          ? "border-emerald-500/30 bg-emerald-500/5"
          : result.severity === "error"
          ? "border-red-500/30 bg-red-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 text-start"
      >
        {result.passed ? (
          <CheckCircle className="mt-0.5 size-5 shrink-0 text-emerald-500" />
        ) : result.severity === "error" ? (
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-500" />
        ) : (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-bold text-ink-900 dark:text-ink-50">
              {isArabic ? result.ruleAr : result.rule}
            </p>
            <Badge
              variant={
                result.passed
                  ? "success"
                  : result.severity === "error"
                  ? "danger"
                  : "outline"
              }
              className="text-[10px]"
            >
              {result.passed ? "✓" : result.severity === "error" ? "Error" : "Warning"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-ink-600 dark:text-ink-300">
            {isArabic ? result.descriptionAr : result.description}
          </p>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
              {result.element && (
                <div>
                  <p className="text-xs font-bold text-ink-500 dark:text-ink-400">
                    {isArabic ? "العنصر" : "Element"}
                  </p>
                  <code className="mt-1 block overflow-x-auto rounded bg-ink-100 p-2 text-xs dark:bg-ink-800">
                    {result.element}
                  </code>
                </div>
              )}
              {result.recommendation && (
                <div>
                  <p className="text-xs font-bold text-ink-500 dark:text-ink-400">
                    {isArabic ? "التوصية" : "Recommendation"}
                  </p>
                  <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">
                    {isArabic ? result.recommendationAr : result.recommendation}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
