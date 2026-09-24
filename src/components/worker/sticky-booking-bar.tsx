"use client";

import { Phone, MessageCircle, CalendarClock } from "lucide-react";
import type { BookingSlot, Worker } from "@/lib/data/types";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/shared/price";
import { BookingDialog } from "./booking-dialog";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * STICKY BOOKING BAR — the mobile conversion fix (finding 5)
 * ────────────────────────────────────────────────────────────────────────────
 * On a phone the "Request a booking" button sat ~4,100px down an 8,039px
 * profile — five screens below the fold, behind the whole tabbed body. The only
 * action above the fold was WhatsApp, so a customer who wanted to book had to
 * scroll a marathon to find the button (or just left).
 *
 * This bar pins price + Book + Call/WhatsApp to the bottom of the viewport on
 * phones (below `lg`) and lifts above the tab bar via `--bottom-chrome`, so the
 * primary action is always one thumb-tap away. It REPLACES the floating
 * WhatsApp button on mobile (the FAB is hidden below `lg` on the profile).
 *
 * Desktop keeps the sidebar ContactCard + the floating button — a wide screen
 * already shows the booking CTA without scrolling.
 */
export function StickyBookingBar({
  worker,
  slots,
}: {
  worker: Worker;
  slots: BookingSlot[];
}) {
  const { locale, t } = useLocale();
  const name = locale === "ar" ? worker.nameAr : worker.nameEn;

  return (
    <div
      className="fixed inset-x-0 bottom-[var(--bottom-chrome)] z-fab border-t border-ink-200/80 bg-white/95 px-4 py-2.5 backdrop-blur-xl dark:border-ink-800 dark:bg-ink-950/95 lg:hidden"
      style={{ paddingBottom: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="mx-auto flex max-w-lg items-center gap-2">
        {/* Price — anchored so the cost is visible before the customer commits. */}
        <div className="min-w-0 shrink-0">
          <p className="truncate text-[10px] font-medium text-ink-400">{t("worker.priceRange")}</p>
          <Price
            amount={worker.priceMin}
            currency={worker.currency}
            locale={locale}
            className="text-sm font-black text-brand-600 dark:text-brand-400"
          />
        </div>

        {/* Call — the fastest path on a phone. */}
        {worker.phone && (
          <Button asChild variant="outline" size="icon" className="size-11 shrink-0" aria-label={t("common.call")}>
            <a href={`tel:${worker.phone}`}>
              <Phone className="size-4" />
            </a>
          </Button>
        )}

        {/* WhatsApp. */}
        {worker.whatsapp && (
          <Button
            asChild
            variant="outline"
            size="icon"
            className="size-11 shrink-0 border-[#25D366]/40 text-[#25D366]"
            aria-label={t("common.whatsapp")}
          >
            <a
              href={`https://wa.me/${String(worker.whatsapp).replace(/[^\d+]/g, "").replace("+", "")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-4" />
            </a>
          </Button>
        )}

        {/* Book — the primary action, fills the remaining space. */}
        <BookingDialog worker={worker} slots={slots}>
          <Button className="h-11 min-w-0 flex-1" disabled={!worker.available}>
            <CalendarClock className="size-4 shrink-0" />
            <span className="truncate">{t("booking.dialogTitle")}</span>
          </Button>
        </BookingDialog>
      </div>
    </div>
  );
}
