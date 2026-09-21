import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { NUMBER_LOCALE, intlLocale } from "@/lib/tenant/countries";

/** Weekday display names (index 0 = Sunday) — shared by profile hours & slot pickers. */
export const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/** Merge Tailwind classes safely (shadcn convention). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with grouped separators — ALWAYS ASCII digits.
 *
 * THE digit convention (see `NUMBER_LOCALE` in `@/lib/tenant/countries`): only
 * calendar/clock output follows the locale's digit system; every other number
 * the app formats is ASCII in both languages — so this takes NO locale argument.
 * There is deliberately nothing to pass and get wrong: `formatNumber(1500)` is
 * "1,500" whether the reader is on an English or an Arabic page, and it can
 * never drift into "١٬٥٠٠" the way a locale-derived tag would.
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE).format(n);
}

/** Compact numbers: 12.4K — ASCII digits, same rule as `formatNumber`. */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat(NUMBER_LOCALE, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** The two display parts of a countdown/deadline: hours and whole minutes. */
export interface DurationParts {
  /** Whole hours remaining. */
  hours: number;
  /** Minutes past the last whole hour (0–59). */
  minutes: number;
}

/**
 * Split a remaining-milliseconds deadline into countdown parts — the ONE
 * arithmetic every countdown shares, so the SLA banner (admin), the customer
 * /bookings row, the worker dashboard card and the two pre-request dialogs can
 * never disagree about how many hours a deadline has left.
 *
 * Rounds UP to the next whole minute (`ceil`): a deadline 30s away still reads
 * "1 د" rather than "0", matching how the copy says the request is about to
 * expire rather than already expired. Negative remainders clamp to zero.
 */
export function durationParts(remainingMs: number): DurationParts {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * Fill a countdown/duration translation's `{hours}` / `{minutes}` placeholders.
 *
 * This is the digit convention's enforcement point for durations: both parts go
 * through `formatNumber`, so the numbers are ASCII in BOTH languages. It takes no
 * locale at all — a duration has no locale knob to get wrong, which is what the
 * four hand-rolled `copy.replace("{hours}", String(hours))` sites used to get
 * subtly wrong (and any future `.toLocaleString()` there would have gone back to
 * Arabic-Indic digits beside the Latin ones in the same row). A placeholder the
 * copy does not use (e.g. a `{hours}`-only policy line) is simply left alone.
 */
export function fillDuration(copy: string, parts: DurationParts): string {
  return copy
    .replace(/\{hours\}/g, formatNumber(parts.hours))
    .replace(/\{minutes\}/g, formatNumber(parts.minutes));
}

/**
 * The currency type and price formatter live in `@/lib/currency` — the single
 * source of truth — and are re-exported here so the many `@/lib/utils` import
 * sites keep working without a second, drifting definition.
 */
export { formatPrice, type CurrencyCode } from "./currency";

/** Format a date for a given locale. */
export function formatDate(date: Date | string, locale: "en" | "ar" = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Day + month only (e.g. "٥ آذار" / "Mar 5") — the compact label used by
 * message-day separators, availability headers and chart axes.
 *
 * Shares the country-aware locale with `formatDate`, so every spelled-out month
 * name in the UI comes from ONE vocabulary — switching a country's Intl tag can
 * never leave two surfaces disagreeing (tests/arabic-dates.test.ts pins the
 * rendered Arabic months for this reason).
 */
export function formatMonthDay(date: Date | string, locale: "en" | "ar" = "en"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * Date + time for a given locale ("Mar 5, 2026, 10:30 AM" / "٥ آذار ٢٠٢٦، ١٠:٣٠ ص").
 *
 * The locale is REQUIRED — deliberately no default. This is the shared
 * replacement for the bare `new Date(x).toLocaleString()` that ~40 admin and
 * dashboard artifacts used, which took the RUNTIME locale: on an Arabic page it
 * rendered an English date (M/D/YYYY, 10:30:00 AM) while the row beside it showed
 * a Levantine one, and it disagreed between the server render and the client
 * whenever the two ran on different machines. Requiring the argument makes
 * "which locale?" a compile-time question rather than an invisible one.
 */
export function formatDateTime(date: Date | string, locale: "en" | "ar"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/**
 * Clock time only for a given locale ("10:30 AM" / "١٠:٣٠ ص") — the replacement
 * for a bare `toLocaleTimeString()`. Same required-locale contract as
 * `formatDateTime`; seconds are dropped because every existing surface that used
 * `toLocaleTimeString()` shows a "last updated" style timestamp where they are
 * noise.
 */
export function formatTime(date: Date | string, locale: "en" | "ar"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
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
  // The count goes through formatNumber, not bare interpolation: a relative time
  // is a duration (non-date) number, so it renders ASCII digits in both locales.
  const count = formatNumber(value);
  if (locale === "ar") return `منذ ${count} ${unitAr}`;
  return `${count} ${unitEn}${value === 1 ? "" : "s"} ago`;
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

/** Distance (km) between two coordinates — used by the "nearest" sort (single centre: Beirut). */
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
/**
 * Is this worker open at `at`?
 *
 * `hours` is treated as OPTIONAL. It is typed as required, but a worker row can
 * reach the UI without it — the Prisma adapter does not always load the
 * relation, and a worker who has not filled in their schedule has none. The
 * previous version went straight to `worker.hours.find(...)` and threw, which
 * only stayed hidden because the one caller was reading `worker.emergency`
 * instead. No hours on file means no claim: not open.
 */
export function isOpenNow(
  worker: { hours?: { day: number; open: string; close: string; closed?: boolean }[] },
  /** Injectable clock — callers on prerendered pages pass a post-mount time. */
  at: Date = new Date()
): boolean {
  const now = at;
  const day = now.getDay(); // 0 = Sunday
  const dayInfo = worker.hours?.find((h) => h.day === day);
  if (!dayInfo || dayInfo.closed) return false;
  if (dayInfo.open === "00:00" && dayInfo.close === "00:00") return true; // 24/7
  const mins = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = dayInfo.open.split(":").map(Number);
  const [ch, cm] = dayInfo.close.split(":").map(Number);
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}
