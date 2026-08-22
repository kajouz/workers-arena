"use client";

import { cn } from "@/lib/utils";
import { MessageCircle, Phone, ExternalLink } from "lucide-react";

interface WhatsAppContactProps {
  /** Worker's WhatsApp number (with country code, e.g. "+96171234567") */
  whatsapp: string;
  /** Worker's name for the pre-filled message */
  workerName: string;
  /** Worker's name in Arabic */
  workerNameAr?: string;
  /** Optional pre-filled message */
  message?: string;
  /** Button variant */
  variant?: "primary" | "secondary" | "icon" | "floating";
  /** Button size */
  size?: "sm" | "md" | "lg";
  /** Additional CSS classes */
  className?: string;
  /** Show label text (for icon variant) */
  showLabel?: boolean;
}

/**
 * Format WhatsApp number to international format
 */
function formatWhatsAppNumber(phone: string): string {
  // Remove all non-numeric characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");
  
  // Ensure it starts with + if it doesn't already
  if (!cleaned.startsWith("+")) {
    // Default to Lebanon country code if no + prefix
    if (cleaned.startsWith("0")) {
      cleaned = "+961" + cleaned.slice(1);
    } else {
      cleaned = "+" + cleaned;
    }
  }
  
  return cleaned;
}

/**
 * Generate WhatsApp click URL
 */
function getWhatsAppUrl(
  phone: string,
  message?: string
): string {
  const formatted = formatWhatsAppNumber(phone);
  const encoded = message ? encodeURIComponent(message) : "";
  return `https://wa.me/${formatted.replace("+", "")}${encoded ? `?text=${encoded}` : ""}`;
}

/**
 * WhatsApp contact button for workers
 */
export function WhatsAppContact({
  whatsapp,
  workerName,
  workerNameAr,
  message,
  variant = "primary",
  size = "md",
  className,
  showLabel = true,
}: WhatsAppContactProps) {
  // Default message in both languages
  const defaultMessage = `Hi ${workerName}! I found you on WorkersArena and would like to request a quote for a service.`;
  const finalMessage = message || defaultMessage;
  
  const url = getWhatsAppUrl(whatsapp, finalMessage);
  
  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs gap-1.5",
    md: "px-4 py-2 text-sm gap-2",
    lg: "px-6 py-3 text-base gap-2.5",
  };
  
  const variantClasses = {
    primary: "bg-green-500 hover:bg-green-600 text-white shadow-md",
    secondary: "bg-green-100 hover:bg-green-200 text-green-700 border border-green-200",
    icon: "bg-green-500 hover:bg-green-600 text-white p-2 rounded-full",
    floating: "bg-green-500 hover:bg-green-600 text-white shadow-lg rounded-full fixed bottom-6 right-6 z-40",
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200",
        sizeClasses[size],
        variantClasses[variant],
        variant === "floating" && "animate-bounce",
        className
      )}
      title={`Contact ${workerName} on WhatsApp`}
    >
      <WhatsAppIcon className={cn(
        size === "sm" ? "w-4 h-4" : 
        size === "lg" ? "w-6 h-6" : "w-5 h-5"
      )} />
      {showLabel && variant !== "icon" && variant !== "floating" && (
        <span>WhatsApp</span>
      )}
      {variant === "floating" && (
        <span className="ml-2">Chat</span>
      )}
    </a>
  );
}

/**
 * WhatsApp icon SVG component
 */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/**
 * Quick contact buttons section - combines WhatsApp + Phone
 */
export function QuickContactButtons({
  phone,
  whatsapp,
  workerName,
  workerNameAr,
  locale = "en",
  className,
}: {
  phone: string;
  whatsapp: string;
  workerName: string;
  workerNameAr?: string;
  locale?: "en" | "ar";
  className?: string;
}) {
  const telUrl = `tel:${phone.replace(/[^\d+]/g, "")}`;
  
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <WhatsAppContact
        whatsapp={whatsapp}
        workerName={workerName}
        workerNameAr={workerNameAr}
        variant="primary"
        size="md"
      />
      <a
        href={telUrl}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
      >
        <Phone className="w-5 h-5" />
        <span>{locale === "ar" ? "اتصل" : "Call"}</span>
      </a>
    </div>
  );
}

/**
 * Floating WhatsApp button - appears on worker profile pages
 */
export function FloatingWhatsApp({
  whatsapp,
  workerName,
  className,
}: {
  whatsapp: string;
  workerName: string;
  className?: string;
}) {
  if (!whatsapp) return null;
  
  return (
    <WhatsAppContact
      whatsapp={whatsapp}
      workerName={workerName}
      variant="floating"
      size="lg"
      showLabel={true}
      className={className}
    />
  );
}
