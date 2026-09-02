"use client";

/**
 * CallButton — Initiates a call through the masked number system.
 *
 * Shows the masked number and allows the user to call without
 * revealing the other party's real phone number.
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Phone, PhoneCall, PhoneOff, Shield, Clock, Copy, Check } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import type { MaskedNumberPublic } from "@/lib/calling/masked-number-service";

interface CallButtonProps {
  bookingId: string;
  partyType: "worker" | "customer";
  partyName: string;
  className?: string;
}

export function CallButton({ bookingId, partyType, partyName, className }: CallButtonProps) {
  const { t, locale } = useLocale();
  const [maskedNumber, setMaskedNumber] = useState<MaskedNumberPublic | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  // Fetch existing masked number on mount
  useEffect(() => {
    async function fetchMaskedNumber() {
      try {
        const res = await fetch(`/api/calling/masked?bookingId=${bookingId}&partyType=${partyType}`);
        if (res.ok) {
          const data = await res.json();
          if (data.maskedNumber) {
            setMaskedNumber(data.maskedNumber);
          }
        }
      } catch (err) {
        console.error("Failed to fetch masked number:", err);
      }
    }
    fetchMaskedNumber();
  }, [bookingId, partyType]);

  const handleCreateMaskedNumbers = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/calling/masked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, partyType }),
      });

      if (res.ok) {
        const data = await res.json();
        setMaskedNumber(
          partyType === "worker" ? data.workerMasked : data.customerMasked
        );
        toast("success", t("calling.numbersCreated") || "Masked numbers created successfully");
      } else {
        toast("error", t("calling.failedToCreate") || "Failed to create masked numbers");
      }
    } catch (err) {
      toast("error", t("calling.failedToCreate") || "Failed to create masked numbers");
    } finally {
      setCreating(false);
    }
  };

  const handleCall = () => {
    if (!maskedNumber) return;
    // Initiate call via tel: link to the masked number
    window.location.href = `tel:${maskedNumber.maskedNumber.replace(/[^\d+]/g, "")}`;
  };

  const handleCopy = async () => {
    if (!maskedNumber) return;
    await navigator.clipboard.writeText(maskedNumber.maskedNumber);
    setCopied(true);
    toast("success", t("calling.numberCopied") || "Number copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(locale === "ar" ? "ar-LB" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(date));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50", className)}
        >
          <Phone className="size-4" />
          {t("calling.call") || "Call"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-5 text-emerald-600" />
            {t("calling.privacyCall") || "Privacy Call"}
          </DialogTitle>
          <DialogDescription>
            {t("calling.description", { name: partyName }) ||
              `Call ${partyName} without revealing your phone number. The platform provides a temporary number for this booking.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!maskedNumber ? (
            <div className="text-center space-y-4">
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                <Shield className="size-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-sm text-emerald-800 dark:text-emerald-200">
                  {t("calling.noNumberYet") || "No masked number has been created for this booking yet."}
                </p>
              </div>
              <Button
                onClick={handleCreateMaskedNumbers}
                disabled={creating}
                className="w-full"
              >
                {creating ? (
                  <>
                    <PhoneCall className="size-4 mr-2 animate-pulse" />
                    {t("calling.creating") || "Creating..."}
                  </>
                ) : (
                  <>
                    <Phone className="size-4 mr-2" />
                    {t("calling.createNumber") || "Create Masked Number"}
                  </>
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Masked Number Display */}
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  {t("calling.yourMaskedNumber") || "Your masked number for this booking"}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xl font-mono font-bold text-gray-900 dark:text-gray-100">
                    {maskedNumber.maskedNumber}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>

              {/* Expiration Info */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Clock className="size-3.5" />
                <span>
                  {t("calling.expires") || "Expires"}: {formatDate(maskedNumber.expiresAt)}
                </span>
              </div>

              {/* Privacy Notice */}
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <Shield className="size-3.5 inline mr-1" />
                  {t("calling.privacyNotice") || "Your real phone number is never shared. Both parties see only platform-provided numbers."}
                </p>
              </div>

              {/* Call Button */}
              <Button onClick={handleCall} className="w-full" size="lg">
                <PhoneCall className="size-5 mr-2" />
                {t("calling.callNow") || "Call Now"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
