"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Phone,
  Users,
  TrendingUp,
  Shield,
  RefreshCw,
  Zap,
  Activity,
  Timer,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils";

interface EmergencyBooking {
  id: string;
  number: string;
  customerName: string;
  jobTitle: string;
  status: string;
  createdAt: string;
  startAt?: string;
  workerName: string;
  workerId: string;
  responseTimeMs: number | null;
  contactReleased: boolean;
  hasMaskedNumber: boolean;
}

interface EmergencySummary {
  total: number;
  active: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  avgResponseTimeMs: number;
  fastestResponseMs: number;
  slowestResponseMs: number;
  contactReleaseRate: number;
}

interface EmergencyData {
  summary: EmergencySummary;
  bookings: EmergencyBooking[];
}

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "requested":
      return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20";
    case "quoting":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "quoted":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
    case "confirmed":
    case "pendingPayment":
      return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20";
    case "inProgress":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "completionPending":
      return "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20";
    case "completed":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
    case "cancelled":
    case "declined":
    case "noShow":
      return "bg-ink-500/10 text-ink-500 dark:text-ink-400 border-ink-500/20";
    default:
      return "bg-ink-500/10 text-ink-500";
  }
}

function getResponseTimeBadge(ms: number | null): { label: string; color: string } {
  if (ms === null) return { label: "Awaiting", color: "bg-amber-500/10 text-amber-700" };
  const seconds = ms / 1000;
  if (seconds < 30) return { label: "⚡ < 30s", color: "bg-emerald-500/10 text-emerald-700" };
  if (seconds < 120) return { label: "✓ < 2m", color: "bg-emerald-500/10 text-emerald-700" };
  if (seconds < 300) return { label: "~ 2-5m", color: "bg-amber-500/10 text-amber-700" };
  return { label: "⚠ > 5m", color: "bg-red-500/10 text-red-700" };
}

export function EmergencyDashboard() {
  const { locale, t } = useLocale();
  const [data, setData] = useState<EmergencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/emergency");
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch emergency data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const summary = data?.summary;
  const bookings = data?.bookings ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink-900 dark:text-ink-50 flex items-center gap-2">
            <AlertTriangle className="size-7 text-red-500" />
            Emergency Dashboard
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mt-1">
            Real-time monitoring of 24/7 emergency service requests
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-ink-400">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(autoRefresh && "border-emerald-500 text-emerald-600")}
          >
            <Activity className={cn("size-3.5 mr-1", autoRefresh && "animate-pulse")} />
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-ink-100 rounded w-1/2 mb-2" />
                <div className="h-8 bg-ink-100 rounded w-1/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : summary ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Active Requests</p>
                    <p className="text-3xl font-black text-red-700 dark:text-red-300 mt-1">{summary.active}</p>
                    <p className="text-xs text-red-500/70 mt-0.5">Awaiting worker response</p>
                  </div>
                  <div className="size-12 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Zap className="size-6 text-red-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">In Progress</p>
                    <p className="text-3xl font-black text-blue-700 dark:text-blue-300 mt-1">{summary.inProgress}</p>
                    <p className="text-xs text-blue-500/70 mt-0.5">Worker dispatched</p>
                  </div>
                  <div className="size-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Users className="size-6 text-blue-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">Completed</p>
                    <p className="text-3xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{summary.completed}</p>
                    <p className="text-xs text-emerald-500/70 mt-0.5">{summary.contactReleaseRate}% contact released</p>
                  </div>
                  <div className="size-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle2 className="size-6 text-emerald-500" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">Avg Response</p>
                    <p className="text-3xl font-black text-amber-700 dark:text-amber-300 mt-1">
                      {formatDuration(summary.avgResponseTimeMs)}
                    </p>
                    <p className="text-xs text-amber-500/70 mt-0.5">
                      Fastest: {formatDuration(summary.fastestResponseMs)}
                    </p>
                  </div>
                  <div className="size-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Timer className="size-6 text-amber-500" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Response Time Metrics */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="size-4 text-emerald-500" />
                  Response Time Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(() => {
                    const fast = bookings.filter((b) => b.responseTimeMs !== null && b.responseTimeMs < 60_000).length;
                    const medium = bookings.filter(
                      (b) => b.responseTimeMs !== null && b.responseTimeMs >= 60_000 && b.responseTimeMs < 300_000
                    ).length;
                    const slow = bookings.filter((b) => b.responseTimeMs !== null && b.responseTimeMs >= 300_000).length;
                    const pending = bookings.filter((b) => b.responseTimeMs === null).length;
                    const total = bookings.length || 1;

                    return (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-emerald-600">
                            <span className="size-2 rounded-full bg-emerald-500" />
                            &lt; 1 minute
                          </span>
                          <span className="font-bold">{fast}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(fast / total) * 100}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-amber-600">
                            <span className="size-2 rounded-full bg-amber-500" />
                            1-5 minutes
                          </span>
                          <span className="font-bold">{medium}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(medium / total) * 100}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-red-600">
                            <span className="size-2 rounded-full bg-red-500" />
                            &gt; 5 minutes
                          </span>
                          <span className="font-bold">{slow}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${(slow / total) * 100}%` }} />
                        </div>

                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-ink-400">
                            <span className="size-2 rounded-full bg-ink-300" />
                            Pending
                          </span>
                          <span className="font-bold">{pending}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
                          <div className="h-full bg-ink-300 rounded-full" style={{ width: `${(pending / total) * 100}%` }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Shield className="size-4 text-blue-500" />
                  Privacy Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Masked Numbers Active</span>
                    <span className="text-sm font-bold text-emerald-600">{summary.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Contact Details Released</span>
                    <span className="text-sm font-bold text-blue-600">{Math.round((summary.contactReleaseRate / 100) * summary.total)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Contact Release Rate</span>
                    <span className="text-sm font-bold">{summary.contactReleaseRate}%</span>
                  </div>
                  <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-[11px] text-blue-700 dark:text-blue-300">
                      <Shield className="size-3 inline mr-1" />
                      All emergency bookings have masked numbers created at submission. Real contact details are released only on arrival or completion.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Phone className="size-4 text-violet-500" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Total Emergency Requests</span>
                    <span className="text-sm font-bold">{summary.total}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Completion Rate</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Cancellation Rate</span>
                    <span className="text-sm font-bold text-red-600">
                      {summary.total > 0 ? Math.round((summary.cancelled / summary.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-500">Fastest Response</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {formatDuration(summary.fastestResponseMs)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Emergency Requests Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <AlertTriangle className="size-5 text-red-500" />
                Emergency Requests ({bookings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookings.length === 0 ? (
                <div className="text-center py-8">
                  <AlertTriangle className="size-12 text-ink-200 mx-auto mb-3" />
                  <p className="text-sm text-ink-500">No emergency requests found</p>
                  <p className="text-xs text-ink-400 mt-1">Emergency requests will appear here when customers submit them</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-ink-100 dark:border-ink-800">
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Booking</th>
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Customer</th>
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Worker</th>
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Status</th>
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Response Time</th>
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Privacy</th>
                        <th className="text-left py-3 px-3 text-xs font-bold text-ink-500 uppercase">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking) => {
                        const responseBadge = getResponseTimeBadge(booking.responseTimeMs);
                        return (
                          <tr
                            key={booking.id}
                            className="border-b border-ink-50 dark:border-ink-800/50 hover:bg-ink-50/50 dark:hover:bg-ink-800/20"
                          >
                            <td className="py-3 px-3">
                              <a
                                href={`/admin/bookings/${booking.number}`}
                                className="flex items-center gap-1.5 font-bold text-brand-600 hover:underline"
                              >
                                {booking.number}
                                <ArrowUpRight className="size-3" />
                              </a>
                              <p className="text-xs text-ink-400 mt-0.5 line-clamp-1">{booking.jobTitle}</p>
                            </td>
                            <td className="py-3 px-3">
                              <p className="font-medium text-ink-900 dark:text-ink-50">{booking.customerName}</p>
                            </td>
                            <td className="py-3 px-3">
                              <a
                                href={`/workers/${booking.workerId}`}
                                className="font-medium text-brand-600 hover:underline"
                              >
                                {booking.workerName}
                              </a>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className={cn("text-[10px] font-bold", getStatusColor(booking.status))}>
                                {booking.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full", responseBadge.color)}>
                                {responseBadge.label}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center gap-1.5">
                                {booking.hasMaskedNumber && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700">
                                    Masked
                                  </span>
                                )}
                                {booking.contactReleased && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700">
                                    Released
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-3">
                              <p className="text-xs text-ink-500">
                                {booking.createdAt ? formatDate(booking.createdAt, locale) : "—"}
                              </p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
