"use client";
import { ArrowLeft, Shield, Eye, Keyboard, Type, Palette, CheckCircle, AlertTriangle, Download, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState, useCallback } from "react";
import { runAxeAudit, generateAxeReport, type AxeAuditResult } from "@/lib/accessibility/axe-adapter";
import { useReducedMotion } from "@/lib/accessibility/keyboard-utils";

export default function AccessibilityPage() {
  const prefersReducedMotion = useReducedMotion();
  const [report, setReport] = useState<AxeAuditResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runAudit = useCallback(async () => {
    setIsRunning(true);
    // Allow UI to update
    await new Promise((r) => setTimeout(r, 500));
    const result = await runAxeAudit();
    setReport(result);
    setIsRunning(false);
  }, []);

  const downloadReport = useCallback(() => {
    if (!report) return;
    const html = generateAxeReport(report);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `accessibility-report-${new Date().toISOString().split("T")[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  const scoreColor = report
    ? report.score >= 90
      ? "text-emerald-500"
      : report.score >= 70
      ? "text-amber-500"
      : "text-red-500"
    : "text-gray-400";

  const scoreBg = report
    ? report.score >= 90
      ? "bg-emerald-500/10"
      : report.score >= 70
      ? "bg-amber-500/10"
      : "bg-red-500/10"
    : "bg-gray-100";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/admin"
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">WCAG 2.1 AA Accessibility Audit</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Automated accessibility testing against WCAG 2.1 AA guidelines
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={runAudit}
              disabled={isRunning}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              {isRunning ? "Running..." : "Run Audit"}
            </button>
            {report && (
              <button
                onClick={downloadReport}
                className="flex items-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export HTML Report
              </button>
            )}
          </div>
        </div>

        {/* WCAG Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Eye, label: "Perceivable", desc: "1.x — Text alternatives, adaptable, distinguishable", color: "text-blue-600" },
            { icon: Keyboard, label: "Operable", desc: "2.x — Keyboard, timing, navigation", color: "text-emerald-600" },
            { icon: Type, label: "Understandable", desc: "3.x — Readable, predictable, input assistance", color: "text-amber-600" },
            { icon: Palette, label: "Robust", desc: "4.x — Compatible with assistive technologies", color: "text-purple-600" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800"
            >
              <item.icon className={`w-6 h-6 ${item.color} mb-2`} />
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">{item.label}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Reduced motion indicator */}
        {prefersReducedMotion && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-6 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-4 h-4" />
            <span>Your system has <strong>reduced motion</strong> enabled. Animations in this report are disabled.</span>
          </div>
        )}

        {/* Score & Summary */}
        {report && (
          <div className="space-y-6 mb-8">
            {/* Score Card */}
            <div className={`rounded-2xl p-8 text-center border border-gray-200 dark:border-gray-800 ${scoreBg}`}>
              <div className={`text-7xl font-black ${scoreColor}`}>{report.score}%</div>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-2">
                WCAG {report.wcagLevel} Compliance
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                {report.score >= 90
                  ? "✅ Excellent — your site meets accessibility standards"
                  : report.score >= 70
                  ? "⚠️ Good — some improvements needed"
                  : "❌ Needs work — significant accessibility issues found"}
              </p>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { label: "Total Rules", value: report.summary.totalRules, color: "text-gray-900 dark:text-white" },
                { label: "Passed", value: report.summary.passed, color: "text-emerald-600" },
                { label: "Violations", value: report.summary.violations, color: "text-red-600" },
                { label: "Incomplete", value: report.summary.incomplete, color: "text-amber-600" },
                { label: "Inapplicable", value: report.summary.inapplicable, color: "text-gray-400" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-800 text-center"
                >
                  <div className={`text-3xl font-black ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Violations */}
        {report && report.violations.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded text-sm font-bold">
                {report.violations.length}
              </span>
              Violations
            </h2>
            <div className="space-y-3">
              {report.violations.map((v) => (
                <div
                  key={v.id}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-900 p-4"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        v.impact === "critical"
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          : v.impact === "serious"
                          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                          : v.impact === "moderate"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}
                    >
                      {v.impact}
                    </span>
                    <code className="text-sm font-mono text-gray-900 dark:text-white font-bold">{v.id}</code>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">{v.help}</p>
                  <div className="space-y-2">
                    {v.nodes.slice(0, 3).map((n, i) => (
                      <div
                        key={i}
                        className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-100 dark:border-red-900/30"
                      >
                        <code className="text-xs text-red-800 dark:text-red-300 break-all block">
                          {n.html.slice(0, 150)}
                        </code>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-semibold">
                          {n.failureSummary}
                        </p>
                      </div>
                    ))}
                    {v.nodes.length > 3 && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        + {v.nodes.length - 3} more affected elements
                      </p>
                    )}
                  </div>
                  <a
                    href={v.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mt-2 inline-block"
                  >
                    Learn more →
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Passed Rules */}
        {report && report.passes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <span className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded text-sm font-bold">
                {report.passes.length}
              </span>
              Passed
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {report.passes.map((p) => (
                <div
                  key={p.id}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-emerald-200 dark:border-emerald-900 p-3 flex items-start gap-3"
                >
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <code className="text-xs font-mono text-gray-900 dark:text-white font-bold">{p.id}</code>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!report && !isRunning && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-16 text-center">
            <Shield className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Run Accessibility Audit</h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Scan the current page against WCAG 2.1 AA guidelines to find accessibility issues.
              The audit checks color contrast, form labels, heading hierarchy, ARIA attributes,
              keyboard navigation, and more.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
