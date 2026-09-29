"use client";

import { MessageCircle } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { whatsappRequestHref, type WhatsAppRequestInput } from "@/lib/data/contact-guard";

/**
 * "Request on WhatsApp" — to WorkersArena's number, never the worker's (see
 * src/lib/data/contact-guard.ts). Renders nothing when no platform number is
 * configured (`NEXT_PUBLIC_WHATSAPP_NUMBER`).
 */
export function WhatsAppRequestButton({
  request,
  variant = "full",
  className,
}: {
  request: Omit<WhatsAppRequestInput, "locale">;
  /** `full` = labelled button; `icon` = square icon button; `floating` = corner FAB. */
  variant?: "full" | "icon" | "floating";
  className?: string;
}) {
  const { locale, t } = useLocale();
  const href = whatsappRequestHref({ ...request, locale });
  if (!href) return null;
  const label = t("worker.whatsappRequest");

  if (variant === "floating") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        className={cn(
          "fixed bottom-[calc(var(--bottom-chrome)+1.5rem)] end-6 z-fab inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 font-semibold text-white shadow-lg transition-transform hover:scale-105",
          className
        )}
      >
        <MessageCircle className="size-5" />
        {label}
      </a>
    );
  }

  return (
    <Button
      asChild
      variant={variant === "icon" ? "outline" : "success"}
      size={variant === "icon" ? "icon" : "default"}
      className={cn(variant === "icon" && "size-11 shrink-0 border-[#25D366]/40 text-[#25D366]", className)}
    >
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
        <MessageCircle className="size-4" />
        {variant === "full" && label}
      </a>
    </Button>
  );
}
