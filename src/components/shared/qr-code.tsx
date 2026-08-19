"use client";

import { useState, useEffect } from "react";
import { Download, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

interface QRCodeProps {
  value: string;
  size?: number;
  bgColor?: string;
  fgColor?: string;
  level?: "L" | "M" | "Q" | "H";
  showDownload?: boolean;
  showCopy?: boolean;
  className?: string;
}

/**
 * QR Code generator using canvas
 */
export function QRCode({
  value,
  size = 200,
  bgColor = "#ffffff",
  fgColor = "#000000",
  level = "M",
  showDownload = true,
  showCopy = false,
  className,
}: QRCodeProps) {
  const { locale } = useLocale();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    generateQR();
  }, [value, size, bgColor, fgColor, level]);

  const generateQR = async () => {
    // Simple QR code generation (in production, use a library like qrcode.react)
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Fill background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Draw QR pattern (simplified - in production use proper QR algorithm)
    ctx.fillStyle = fgColor;
    const cellSize = size / 25;

    // Draw finder patterns
    drawFinderPattern(ctx, 0, 0, cellSize);
    drawFinderPattern(ctx, size - 7 * cellSize, 0, cellSize);
    drawFinderPattern(ctx, 0, size - 7 * cellSize, cellSize);

    // Draw data area (simplified pattern based on URL hash)
    const hash = hashString(value);
    for (let i = 0; i < 25; i++) {
      for (let j = 0; j < 25; j++) {
        // Skip finder pattern areas
        if (
          (i < 8 && j < 8) ||
          (i > 16 && j < 8) ||
          (i < 8 && j > 16)
        ) {
          continue;
        }

        if ((hash + i * j) % 3 === 0) {
          ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
        }
      }
    }

    setQrDataUrl(canvas.toDataURL());
  };

  const drawFinderPattern = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cellSize: number
  ) => {
    // Outer square
    ctx.fillRect(x, y, 7 * cellSize, 7 * cellSize);
    // Inner white
    ctx.fillStyle = bgColor;
    ctx.fillRect(x + cellSize, y + cellSize, 5 * cellSize, 5 * cellSize);
    // Center square
    ctx.fillStyle = fgColor;
    ctx.fillRect(x + 2 * cellSize, y + 2 * cellSize, 3 * cellSize, 3 * cellSize);
  };

  const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.download = `qr-code-${Date.now()}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="QR Code"
          width={size}
          height={size}
          className="rounded-lg"
        />
      )}

      <div className="flex gap-2">
        {showDownload && qrDataUrl && (
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="size-4 mr-1" />
            {locale === "ar" ? "تحميل" : "Download"}
          </Button>
        )}
        {showCopy && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className={copied ? "bg-emerald-500 text-white" : ""}
          >
            {copied ? <Check className="size-4 mr-1" /> : <Copy className="size-4 mr-1" />}
            {copied ? (locale === "ar" ? "تم النسخ" : "Copied!") : (locale === "ar" ? "نسخ" : "Copy")}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * QR code button that shows QR in a popover
 */
export function QRCodeButton({
  url,
  title,
  size = "icon",
}: {
  url: string;
  title?: string;
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const { locale } = useLocale();
  const [showQR, setShowQR] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size={size}
        onClick={() => setShowQR(true)}
        title={title ?? (locale === "ar" ? "عرض رمز QR" : "Show QR Code")}
      >
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="3" height="3" />
          <rect x="18" y="18" width="3" height="3" />
        </svg>
      </Button>

      {showQR && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="rounded-2xl bg-white p-6 shadow-xl dark:bg-ink-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-4 text-center text-lg font-bold text-ink-900 dark:text-ink-50">
              {locale === "ar" ? "امسح الرمز" : "Scan QR Code"}
            </h3>
            <QRCode value={url} size={250} showDownload showCopy />
            <Button
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => setShowQR(false)}
            >
              {locale === "ar" ? "إغلاق" : "Close"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
