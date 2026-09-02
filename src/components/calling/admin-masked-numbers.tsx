"use client";

/**
 * AdminMaskedNumbers — Admin panel for managing masked numbers.
 *
 * Shows all active masked numbers, allows admins to reveal real numbers,
 * and manage number expiration.
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Shield,
  Eye,
  Phone,
  User,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";

interface MaskedNumberAdmin {
  id: string;
  maskedNumber: string;
  partyType: "worker" | "customer";
  bookingId: string;
  createdAt: string;
  expiresAt: string;
  isActive: boolean;
  callCount: number;
  lastUsedAt?: string;
  realNumber: string;
}

export function AdminMaskedNumbers() {
  const { t, locale } = useLocale();
  const [maskedNumbers, setMaskedNumbers] = useState<MaskedNumberAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealedNumbers, setRevealedNumbers] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchMaskedNumbers();
  }, []);

  const fetchMaskedNumbers = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/calling/admin");
      if (res.ok) {
        const data = await res.json();
        setMaskedNumbers(data.maskedNumbers || []);
      }
    } catch {
      toast("error", t("calling.failedToFetch") || "Failed to fetch masked numbers");
    } finally {
      setLoading(false);
    }
  };

  const handleRevealRealNumber = (maskedNumberId: string) => {
    setRevealedNumbers((prev) => new Set(prev).add(maskedNumberId));
  };

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-LB" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  };

  const activeCount = maskedNumbers.filter((mn) => mn.isActive).length;
  const expiredCount = maskedNumbers.filter((mn) => !mn.isActive).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
            <Shield className="size-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
              {t("calling.adminTitle") || "Masked Numbers Management"}
            </h2>
            <p className="text-sm text-ink-500">
              {t("calling.adminSubtitle") || "Manage privacy-protected phone numbers for bookings"}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={fetchMaskedNumbers}>
          <RefreshCw className="size-4 mr-2" />
          {t("calling.refresh") || "Refresh"}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Phone className="size-5 text-emerald-600" />
              <div>
                <p className="text-2xl font-bold">{maskedNumbers.length}</p>
                <p className="text-xs text-ink-500">{t("calling.total") || "Total"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="size-5 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-blue-600">{activeCount}</p>
                <p className="text-xs text-ink-500">{t("calling.active") || "Active"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-orange-600">{expiredCount}</p>
                <p className="text-xs text-ink-500">{t("calling.expired") || "Expired"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Masked Numbers List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("calling.allMaskedNumbers") || "All Masked Numbers"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="size-6 animate-spin text-ink-400" />
            </div>
          ) : maskedNumbers.length === 0 ? (
            <div className="text-center py-8 text-ink-500">
              <Phone className="size-12 mx-auto mb-3 text-ink-300" />
              <p>{t("calling.noMaskedNumbers") || "No masked numbers found"}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {maskedNumbers.map((mn) => (
                <div
                  key={mn.id}
                  className={cn(
                    "p-4 rounded-lg border",
                    mn.isActive
                      ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800"
                      : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold">{mn.maskedNumber}</span>
                        <Badge variant={mn.partyType === "worker" ? "default" : "secondary"}>
                          {mn.partyType === "worker" ? (
                            <User className="size-3 mr-1" />
                          ) : (
                            <Phone className="size-3 mr-1" />
                          )}
                          {mn.partyType}
                        </Badge>
                        <Badge variant={mn.isActive ? "success" : "danger"}>
                          {mn.isActive ? t("calling.active") || "Active" : t("calling.expired") || "Expired"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-ink-500">
                        <span>{t("calling.booking") || "Booking"}: {mn.bookingId}</span>
                        <span>{t("calling.calls") || "Calls"}: {mn.callCount}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {t("calling.created") || "Created"}: {formatDate(mn.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Reveal Real Number */}
                    <div>
                      {revealedNumbers.has(mn.id) ? (
                        <div className="text-right">
                          <p className="text-xs text-ink-500 mb-1">
                            {t("calling.realNumber") || "Real Number"}
                          </p>
                          <p className="font-mono text-sm font-bold text-emerald-600">{mn.realNumber}</p>
                        </div>
                      ) : (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevealRealNumber(mn.id)}
                            >
                              <Eye className="size-4 mr-1" />
                              {t("calling.reveal") || "Reveal"}
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <Shield className="size-5 text-emerald-600" />
                                {t("calling.revealRealNumber") || "Reveal Real Number"}
                              </DialogTitle>
                              <DialogDescription>
                                {t("calling.revealWarning") || "This action is logged for audit purposes. Only admins can view real phone numbers."}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                                <p className="text-xs text-gray-500 mb-1">
                                  {t("calling.realNumberFor") || "Real number for"} {mn.partyType}
                                </p>
                                <p className="text-2xl font-mono font-bold text-gray-900 dark:text-gray-100">
                                  {mn.realNumber}
                                </p>
                              </div>
                              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                                <p className="text-xs text-amber-800 dark:text-amber-200">
                                  <AlertTriangle className="size-3.5 inline mr-1" />
                                  {t("calling.auditNotice") || "This action is logged for compliance and audit purposes."}
                                </p>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
