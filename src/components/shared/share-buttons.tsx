"use client";

import { useState } from "react";
import { Share2, Copy, Check, Facebook, Twitter, Linkedin, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface ShareButtonsProps {
  url: string;
  title: string;
  description?: string;
  image?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  showLabels?: boolean;
  className?: string;
}

const SHARE_PLATFORMS = [
  {
    name: "Facebook",
    icon: Facebook,
    getUrl: (url: string, title: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    color: "hover:bg-blue-600 hover:text-white",
  },
  {
    name: "Twitter",
    icon: Twitter,
    getUrl: (url: string, title: string) =>
      `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    color: "hover:bg-sky-500 hover:text-white",
  },
  {
    name: "LinkedIn",
    icon: Linkedin,
    getUrl: (url: string, title: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    color: "hover:bg-blue-700 hover:text-white",
  },
  {
    name: "Email",
    icon: Mail,
    getUrl: (url: string, title: string) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Check this out: ${url}`)}`,
    color: "hover:bg-ink-600 hover:text-white",
  },
];

/**
 * Social media sharing buttons
 */
export function ShareButtons({
  url,
  title,
  description,
  image,
  variant = "outline",
  size = "icon",
  showLabels = false,
  className,
}: ShareButtonsProps) {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const isArabic = locale === "ar";

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
      } catch (error) {
        // User cancelled or error
      }
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasNativeShare = typeof navigator !== "undefined" && navigator.share;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Native share button (mobile) */}
      {hasNativeShare && (
        <Button variant={variant} size={size} onClick={handleShare}>
          <Share2 className="size-4" />
          {showLabels && (isArabic ? "مشاركة" : "Share")}
        </Button>
      )}

      {/* Platform buttons */}
      {SHARE_PLATFORMS.map((platform) => (
        <Button
          key={platform.name}
          variant={variant}
          size={size}
          className={platform.color}
          onClick={() => window.open(platform.getUrl(url, title), "_blank", "width=600,height=400")}
        >
          <platform.icon className="size-4" />
          {showLabels && platform.name}
        </Button>
      ))}

      {/* Copy link button */}
      <Button
        variant={variant}
        size={size}
        onClick={handleCopyLink}
        className={copied ? "bg-emerald-500 text-white" : ""}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {showLabels && (copied ? (isArabic ? "تم النسخ" : "Copied!") : (isArabic ? "نسخ الرابط" : "Copy Link"))}
      </Button>
    </div>
  );
}

/**
 * Share dialog with full options
 */
export function ShareDialog({
  open,
  onClose,
  url,
  title,
  description,
  image,
}: {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  description?: string;
  image?: string;
}) {
  const { locale } = useLocale();
  const isArabic = locale === "ar";

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
          {isArabic ? "مشاركة" : "Share"}
        </h3>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{title}</p>

        <div className="mt-6 space-y-3">
          {SHARE_PLATFORMS.map((platform) => (
            <button
              key={platform.name}
              onClick={() => {
                window.open(platform.getUrl(url, title), "_blank", "width=600,height=400");
                onClose();
              }}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-start transition-colors hover:bg-ink-50 dark:hover:bg-ink-800"
            >
              <platform.icon className="size-5" />
              <span className="font-medium text-ink-900 dark:text-ink-50">{platform.name}</span>
            </button>
          ))}
        </div>

        <Button variant="ghost" className="mt-4 w-full" onClick={onClose}>
          {isArabic ? "إغلاق" : "Close"}
        </Button>
      </div>
    </div>
  );
}
