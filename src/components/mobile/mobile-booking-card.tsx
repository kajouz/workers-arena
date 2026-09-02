"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Phone, MessageSquare, ChevronRight, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/avatar";
import { BookingStatusBadge } from "@/components/bookings/booking-status-badge";
import { CallButton } from "@/components/calling/call-button";
import { useLocale } from "@/components/providers/locale-provider";
import { formatDate, cn } from "@/lib/utils";
import { formatSlotRange } from "@/lib/data/booking-ui";
import type { Booking } from "@/lib/data/types";

interface MobileBookingCardProps {
  booking: Booking;
  workerName?: string;
  workerSlug?: string;
  workerPhone?: string;
  viewerRole: "customer" | "worker";
}

export function MobileBookingCard({
  booking,
  workerName,
  workerSlug,
  workerPhone,
  viewerRole,
}: MobileBookingCardProps) {
  const { locale, t } = useLocale();
  const [expanded, setExpanded] = useState(false);

  const name = locale === "ar" 
    ? (viewerRole === "customer" ? workerName : booking.customerName)
    : (viewerRole === "customer" ? workerName : booking.customerName);

  return (
    <Card className="overflow-hidden touch-manipulation">
      <CardContent className="p-4">
        {/* Main row — touch-friendly */}
        <div 
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <GradientAvatar 
            name={name || "U"} 
            className="size-12 shrink-0" 
          />
          
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-ink-900 dark:text-ink-50 truncate">
                {name}
              </p>
              <BookingStatusBadge status={booking.status} className="text-[10px] ms-auto" />
            </div>
            
            <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-1">
              {booking.jobTitle}
            </p>
            
            {booking.startAt && (
              <div className="flex items-center gap-1 mt-1 text-xs text-ink-400">
                <CalendarClock className="size-3" />
                <span>{formatDate(booking.startAt, locale)}</span>
                <span className="text-ink-300">·</span>
                <span>{formatSlotRange(booking, locale)}</span>
              </div>
            )}
          </div>

          <ChevronRight 
            className={cn(
              "size-4 text-ink-400 transition-transform shrink-0",
              expanded && "rotate-90"
            )} 
          />
        </div>

        {/* Expanded details — touch-friendly actions */}
        {expanded && (
          <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800 space-y-3">
            {/* Quick actions */}
            <div className="flex items-center gap-2">
              {viewerRole === "worker" && (
                <CallButton
                  bookingId={booking.id}
                  partyType="worker"
                  partyName={booking.customerName}
                  className="flex-1"
                />
              )}
              {viewerRole === "customer" && workerSlug && (
                <CallButton
                  bookingId={booking.id}
                  partyType="customer"
                  partyName={workerName || "Worker"}
                  className="flex-1"
                />
              )}
              
              <Link 
                href={viewerRole === "customer" 
                  ? `/workers/${workerSlug}` 
                  : `/bookings`}
                className="flex-1"
              >
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <MapPin className="size-3.5" />
                  {viewerRole === "customer" ? t("booking.viewWorker") : t("booking.viewDetails")}
                </Button>
              </Link>
            </div>

            {/* Booking number */}
            <div className="flex items-center justify-between text-xs text-ink-400">
              <span>{t("booking.bookingNumber")} {booking.number}</span>
              {booking.quote !== undefined && (
                <span className="font-bold text-brand-600 dark:text-brand-400">
                  {(booking.quote / 100).toFixed(2)} {booking.currency}
                </span>
              )}
            </div>

            {/* Note preview */}
            {booking.note && (
              <p className="text-xs text-ink-500 dark:text-ink-400 line-clamp-2 italic">
                &ldquo;{booking.note}&rdquo;
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
