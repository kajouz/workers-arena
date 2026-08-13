import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Weekday display names (index 0 = Sunday) — shared by profile hours & slot pickers. */
export const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Merge Tailwind classes safely (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with locale-aware separators (keeps Latin digits in both locales). */
export function formatNumber(n: number, locale = "en"): string {
  return new Intl.NumberFormat(locale === "ar" ? "en-US" : locale).format(n);
}

/** Compact numbers: 12.4K */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export type CurrencyCode = "SAR" | "AED" | "EGP" | "JOD" | "MAD" | "USD";

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  SAR: "ر.س",
  AED: "د.إ",
  EGP: "ج.م",
  JOD: "د.أ",
  MAD: "د.م",
  USD: "$",
};

/** RTL-safe price formatting: "150 ر.س" in Arabic, "SAR 150" in English. */
export function formatPrice(amount: number, currency: CurrencyCode, locale: "en" | "ar" = "en"): string {
  const num = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount);
  if (locale === "ar") {
    return `${num} ${CURRENCY_SYMBOLS[currency]}`;
  }
  if (currency === "USD") return `$${num}`;
  return `${currency} ${num}`;
}

/** Format a date for a given locale. */
export function formatDate(date: Date | string, locale: "en" | "ar" = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Human "time ago" — used for reviews & activity logs. */
export function timeAgo(date: Date | string, locale: "en" | "ar" = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const units: [number, string, string][] = [
    [60, "second", "ثانية"],
    [60, "minute", "دقيقة"],
    [24, "hour", "ساعة"],
    [30, "day", "يوم"],
    [12, "month", "شهر"],
    [Infinity, "year", "سنة"],
  ];
  let value = seconds;
  let unitEn = "second";
  let unitAr = "ثانية";
  for (const [div, en, ar] of units) {
    if (value < div) {
      unitEn = en;
      unitAr = ar;
      break;
    }
    value = Math.floor(value / div);
    unitEn = en;
    unitAr = ar;
  }
  if (locale === "ar") return `منذ ${value} ${unitAr}`;
  return `${value} ${unitEn}${value === 1 ? "" : "s"} ago`;
}

/** Deterministic initials from a name (used by gradient avatars). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "W";
  const second = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + second).toUpperCase();
}

/** Deterministic hue from a string seed — used to build per-worker gradients. */
export function hueFromSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** Gentle helper: clamp a number into a range. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Distance (km) between two coordinates — used by the "nearest" sort. */
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Is the worker open right now, per their weekly hours (00:00–00:00 = 24/7)? */
export function isOpenNow(worker: { hours: { day: number; open: string; close: string; closed?: boolean }[] }): boolean {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const dayInfo = worker.hours.find((h) => h.day === day);
  if (!dayInfo || dayInfo.closed) return false;
  if (dayInfo.open === "00:00" && dayInfo.close === "00:00") return true; // 24/7
  const mins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = dayInfo.open.split(":").map(Number);
  const [ch, cm] = dayInfo.close.split(":").map(Number);
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}
