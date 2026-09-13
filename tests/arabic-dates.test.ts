import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatDate, formatDateTime, formatMonthDay, formatPrice, formatTime } from "@/lib/utils";
import { formatDayDate, formatSlotRange } from "@/lib/data/booking-ui";
import { auditFmtDate, auditFmtDateTime, auditFmtTime } from "@/lib/data/booking-print";
import { intlLocale } from "@/lib/tenant/countries";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Arabic dates are a COUNTRY decision: the served tenant (lb) spells months the
 * Levantine way (آذار), while the Egyptian/Gulf convention spells the same month
 * مارس. Both are "correct Arabic", so a wrong tag is invisible to every other
 * check — no type error, no crash, just silently different words for the same
 * day. These tests make the rendered month names explicit, so a locale-tag
 * change is a deliberate, reviewable diff rather than a quiet UI change.
 *
 * They also pin the numeric-half formats (audit dates, slot times) and the
 * digit convention, since a `numberingSystem`/tag change moves those too.
 */

interface MonthFixture {
  /** 0-based month index. */
  month: number;
  /** The Levantine month name the served tenant must render. */
  ar: string;
  /** The Egyptian name the SAME month would render under an ar-EG tag. */
  egyptian: string;
  en: string;
  /** Short weekday for the 5th of that month in 2026, per locale. */
  weekdayEn: string;
  weekdayAr: string;
}

/** 2026-<month>-05, the fixed date each formatter is pinned against. */
const MONTHS: MonthFixture[] = [
  { month: 0, ar: "كانون الثاني", egyptian: "يناير", en: "Jan", weekdayEn: "Mon", weekdayAr: "الاثنين" },
  { month: 1, ar: "شباط", egyptian: "فبراير", en: "Feb", weekdayEn: "Thu", weekdayAr: "الخميس" },
  { month: 2, ar: "آذار", egyptian: "مارس", en: "Mar", weekdayEn: "Thu", weekdayAr: "الخميس" },
  { month: 3, ar: "نيسان", egyptian: "أبريل", en: "Apr", weekdayEn: "Sun", weekdayAr: "الأحد" },
  { month: 4, ar: "أيار", egyptian: "مايو", en: "May", weekdayEn: "Tue", weekdayAr: "الثلاثاء" },
  { month: 5, ar: "حزيران", egyptian: "يونيو", en: "Jun", weekdayEn: "Fri", weekdayAr: "الجمعة" },
  { month: 6, ar: "تموز", egyptian: "يوليو", en: "Jul", weekdayEn: "Sun", weekdayAr: "الأحد" },
  { month: 7, ar: "آب", egyptian: "أغسطس", en: "Aug", weekdayEn: "Wed", weekdayAr: "الأربعاء" },
  { month: 8, ar: "أيلول", egyptian: "سبتمبر", en: "Sep", weekdayEn: "Sat", weekdayAr: "السبت" },
  { month: 9, ar: "تشرين الأول", egyptian: "أكتوبر", en: "Oct", weekdayEn: "Mon", weekdayAr: "الاثنين" },
  { month: 10, ar: "تشرين الثاني", egyptian: "نوفمبر", en: "Nov", weekdayEn: "Thu", weekdayAr: "الخميس" },
  { month: 11, ar: "كانون الأول", egyptian: "ديسمبر", en: "Dec", weekdayEn: "Sat", weekdayAr: "السبت" },
];

/** Local noon — the same calendar day in every runtime time zone. */
function noonUtc(month: number, day = 5, year = 2026): Date {
  return new Date(year, month, day, 12, 0, 0);
}

/** Arabic-Indic digits (١٢٣…) — what the Arabic date formats use. */
const ARABIC_INDIC = /[\u0660-\u0669]/;
/** Latin digits (123…) — what the money format keeps, in both locales. */
const LATIN_DIGITS = /[0-9]/;
/** U+200F RIGHT-TO-LEFT MARK — ICU inserts these into ar numeric dates. */
const RLM = "\u200f";

describe("the served tenant renders Arabic dates in its own month vocabulary", () => {
  it("pins the locale tag these expectations are derived from", () => {
    // The single mutation this file defends against: pointing `ar` at another
    // country (ar-EG / ar-SA) silently re-words every Arabic date in the app.
    expect(intlLocale("ar"), "tenant lb reads its Arabic tag from the country registry").toBe("ar-LB");
    expect(intlLocale("en")).toBe("en-US");
  });

  it("spells all twelve Arabic months the Levantine way — and never the Egyptian way", () => {
    for (const fixture of MONTHS) {
      const d = noonUtc(fixture.month);
      const ar = formatDate(d, "ar");

      expect(ar, `formatDate ar, month ${fixture.month + 1}`).toBe(`٥ ${fixture.ar} ٢٠٢٦`);
      expect(ar, `formatDate ar must not use the Egyptian name for ${fixture.ar}`).not.toContain(
        fixture.egyptian
      );
    }
  });

  it("keeps the two-word months unambiguous", () => {
    // "كانون الأول" (December) contains a prefix of "كانون الثاني" (January) —
    // a sloppy substring assertion would pass on the wrong month.
    const january = formatDate(noonUtc(0), "ar");
    const december = formatDate(noonUtc(11), "ar");
    expect(january).toContain("كانون الثاني");
    expect(january).not.toContain("كانون الأول");
    expect(december).toContain("كانون الأول");
    expect(december).not.toContain("كانون الثاني");
    // Same trap for the تشرين pair (October / November).
    expect(formatDate(noonUtc(9), "ar")).toContain("تشرين الأول");
    expect(formatDate(noonUtc(9), "ar")).not.toContain("تشرين الثاني");
    expect(formatDate(noonUtc(10), "ar")).toContain("تشرين الثاني");
  });

  it("every shared formatter agrees on the month name (no surface drifts)", () => {
    for (const fixture of MONTHS) {
      const d = noonUtc(fixture.month);
      const iso = d.toISOString();
      const where = `month ${fixture.month + 1} (${fixture.ar})`;

      // The three user-facing month-name formatters must spell it identically —
      // this is the assertion that catches one surface keeping its own tag.
      expect(formatDate(d, "ar"), `formatDate — ${where}`).toContain(fixture.ar);
      expect(formatMonthDay(d, "ar"), `formatMonthDay — ${where}`).toContain(fixture.ar);
      expect(formatDayDate(iso, "ar"), `formatDayDate — ${where}`).toContain(fixture.ar);

      expect(formatMonthDay(d, "ar"), `formatMonthDay — ${where}`).toBe(`٥ ${fixture.ar}`);
      expect(formatDayDate(iso, "ar"), `formatDayDate — ${where}`).toBe(
        `${fixture.weekdayAr}، ٥ ${fixture.ar}`
      );
    }
  });

  it("keeps English dates in the served locale's ordering", () => {
    for (const fixture of MONTHS) {
      const d = noonUtc(fixture.month);
      expect(formatDate(d, "en"), `formatDate en, month ${fixture.month + 1}`).toBe(
        `${fixture.en} 5, 2026`
      );
      expect(formatMonthDay(d, "en")).toBe(`${fixture.en} 5`);
      // Not the en-GB "Thu 5 Mar" shape the reschedule dialog used to render.
      expect(formatDayDate(d.toISOString(), "en")).toBe(`${fixture.weekdayEn}, ${fixture.en} 5`);
    }
  });
});

describe("the numeric date/time formats are pinned too", () => {
  const march = noonUtc(2);

  it("audit dates (dateStyle: medium) render Arabic-Indic digits", () => {
    const iso = march.toISOString();
    expect(auditFmtDate("ar", iso)).toBe(`٠٥${RLM}/٠٣${RLM}/٢٠٢٦`);
    expect(auditFmtTime("ar", iso)).toBe("١٢:٠٠ م");
    expect(auditFmtDateTime("ar", iso)).toBe(`٠٥${RLM}/٠٣${RLM}/٢٠٢٦, ١٢:٠٠ م`);
    expect(auditFmtDate("en", iso)).toBe("Mar 5, 2026");
    expect(auditFmtTime("en", iso)).toBe("12:00 PM");
  });

  it("slot ranges render Arabic-Indic times", () => {
    const slot = {
      startAt: new Date(2026, 2, 5, 9, 0, 0).toISOString(),
      endAt: new Date(2026, 2, 5, 10, 0, 0).toISOString(),
    };
    expect(formatSlotRange(slot, "ar")).toBe("٠٩:٠٠ – ١٠:٠٠");
    expect(formatSlotRange(slot, "en")).toBe("09:00 – 10:00");
  });

  it("pins the shared date+time and time-only formatters", () => {
    // The two helpers that replaced the bare `toLocaleString()` /
    // `toLocaleTimeString()` the admin & dashboard artifacts used. Their output
    // is the contract every one of those ~40 call sites now depends on.
    expect(formatDateTime(march, "en")).toBe("Mar 5, 2026, 12:00 PM");
    expect(formatTime(march, "en")).toBe("12:00 PM");
    // Arabic follows the country tag (dateStyle/timeStyle "medium"/"short"
    // render numerically here, exactly like the audit formats above) and keeps
    // the Arabic-Indic digits the calendar family uses.
    expect(formatDateTime(march, "ar")).toBe(`٠٥${RLM}/٠٣${RLM}/٢٠٢٦، ١٢:٠٠ م`);
    expect(formatTime(march, "ar")).toBe("١٢:٠٠ م");
    expect(formatTime(march, "ar")).toMatch(ARABIC_INDIC);
    // The runtime default is never reached: the locale is REQUIRED, so a caller
    // that forgets gets a type error rather than a silently English date. The
    // directive is the pin — if the parameter ever gains a default, `tsc` fails
    // this file with "unused '@ts-expect-error' directive".
    // @ts-expect-error the locale parameter is required
    expect(formatTime(march)).toBe("12:00 PM");
  });

  it("documents the digit convention: Arabic dates use Arabic-Indic, money stays Latin", () => {
    // A deliberate, long-standing divergence — pinned so either side changing is
    // a conscious decision rather than a side effect of an Intl option edit.
    const ar = formatDate(march, "ar");
    expect(ar).toMatch(ARABIC_INDIC);
    expect(ar).not.toMatch(LATIN_DIGITS);

    const priceAr = formatPrice(1500, "USD", "ar");
    expect(priceAr).toMatch(/\$[\d,]+/);
    expect(priceAr).not.toMatch(ARABIC_INDIC);
  });
});

/**
 * Files that may legitimately pass a literal locale tag to a date formatter,
 * each with the reason it is not routed through the country registry.
 */
const DATE_TAG_ALLOWLIST = [
  {
    file: path.join("src", "app", "blog", "page.tsx"),
    why: "English-only marketing content (its articles and UI copy are English)",
  },
  {
    file: path.join("src", "components", "admin", "filters", "date-range-picker.tsx"),
    why: "self-contained English admin control (its own \"Select date\" copy, no locale in scope)",
  },
  {
    file: path.join("src", "components", "disputes", "dispute-form.tsx"),
    why: "admin-only dispute thread whose copy is English (see TESTING-PROCEDURES i18n gaps)",
  },
  {
    file: path.join("src", "components", "worker", "earnings-dashboard.tsx"),
    why: "orphaned component — not mounted anywhere (tracked for deletion in the plan's Phase 0)",
  },
];

/**
 * A literal locale tag handed to a date/time formatter — the shape that made
 * booking surfaces render "٥ مارس" (ar-SA) beside the app's "٥ آذار" (ar-LB).
 * It accepts the tag as the first argument (`("en-US", …)`) and behind the
 * hand-rolled country ternary (`(locale === "ar" ? "ar-SA" : …)`), and rejects
 * the correct `(intlLocale(locale), { dateStyle: "medium" })` — where the only
 * quoted strings are option KEYS, not a tag.
 *
 * `toLocaleString` is intentionally excluded: it formats NUMBERS too, where the
 * Latin-digit pins in `@/lib/utils` are deliberate.
 */
const HARDCODED_DATE_TAG_SOURCE =
  '(toLocaleDateString|toLocaleTimeString|Intl\\.DateTimeFormat)\\(\\s*(?:locale === "ar" \\? |locale, )?["\'](?:ar|en|fr)[-_]?[A-Za-z]*["\']';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

/** Every hardcoded-tag date formatter under src, as `rel/path.ts:line`. */
function findHardcodedDateTags(): string[] {
  const offenders: string[] = [];
  const pattern = new RegExp(HARDCODED_DATE_TAG_SOURCE, "g");
  for (const file of walk(path.join(ROOT, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      offenders.push(`${path.relative(ROOT, file)}:${line}`);
    }
  }
  return offenders;
}

/**
 * Files that may format a date with the RUNTIME locale, each with the reason it
 * is not the tracked user-facing gap. Every one is an English-only artifact: an
 * exported report/CSV or a hidden debug page whose own copy is English, so a
 * runtime-locale date can never sit beside localized copy.
 */
const RUNTIME_LOCALE_ALLOWLIST = [
  {
    file: path.join("src", "app", "debug", "analytics", "page.tsx"),
    why: "hidden English-only debug page (its generated HTML report is English)",
  },
  {
    file: path.join("src", "lib", "accessibility", "axe-adapter.ts"),
    why: "axe audit report HTML — an English compliance artifact",
  },
  {
    file: path.join("src", "lib", "accessibility", "wcag-audit.ts"),
    why: "WCAG audit report HTML — an English compliance artifact",
  },
  {
    file: path.join("src", "lib", "email", "digest.ts"),
    why: "English digest email copy",
  },
  {
    file: path.join("src", "lib", "export", "csv-export.ts"),
    why: "CSV / HTML export artifact with English headers",
  },
];

/**
 * The owner modules — the only places allowed to build a date formatter (they
 * state the convention and implement it); every other module goes through them.
 */
const DATE_FORMAT_OWNERS = [
  path.join("src", "lib", "utils.ts"),
  path.join("src", "lib", "currency.ts"),
  path.join("src", "lib", "tenant", "countries.ts"),
];

/** A Date/time formatter called with NO locale argument. */
const RUNTIME_LOCALE_FORMAT = /\.toLocale(?:Date|Time)?String\(\)/;

function isCommentLine(trimmed: string): boolean {
  // Docs and code comments may NAME the anti-pattern (and do, in
  // booking-notifications.ts / micro-interactions.tsx) — only real calls count.
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("{/*")
  );
}

/** Every `rel/path.ts:line` that formats a date with the runtime locale. */
function findRuntimeLocaleDates(): string[] {
  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, file);
    if (DATE_FORMAT_OWNERS.includes(rel)) continue;
    const source = readFileSync(file, "utf8");
    const lines = source.split("\n");
    const pattern = new RegExp(RUNTIME_LOCALE_FORMAT.source, "g");
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      if (isCommentLine(lines[line - 1]!.trim())) continue;
      offenders.push(`${rel}:${line}`);
    }
  }
  return offenders;
}

describe("no date or time is rendered in the RUNTIME locale", () => {
  it("scans the source tree (the guard cannot pass vacuously)", () => {
    const files = walk(path.join(ROOT, "src"));
    expect(files.length, "src should hold hundreds of modules").toBeGreaterThan(100);
    // And it really can see the file whose date renders the whole class fixed.
    expect(files.some((f) => f.endsWith(path.join("admin", "system-logs.tsx")))).toBe(true);
  });

  it("every user-facing date goes through the shared, country-aware formatter", () => {
    const offenders = findRuntimeLocaleDates();
    const known = new Set(RUNTIME_LOCALE_ALLOWLIST.map((a) => a.file));
    const unexpected = offenders.filter((o) => !known.has(o.split(":")[0]!));
    expect(
      unexpected,
      // A bare `.toLocaleString()` takes the RUNTIME locale: M/D/YYYY, 10:30:00 AM
      // on an Arabic page, and a server/client mismatch when the two differ.
      `Dates must go through formatDate/formatDateTime/formatTime (intlLocale):\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("keeps the allowlist honest (no stale entries)", () => {
    const offenders = findRuntimeLocaleDates();
    for (const entry of RUNTIME_LOCALE_ALLOWLIST) {
      expect(
        offenders.some((o) => o.startsWith(`${entry.file}:`)),
        `${entry.file} is allowlisted but no longer offends (${entry.why})`
      ).toBe(true);
    }
  });

  it("recognizes the exact shapes it replaced (the guard is live)", () => {
    // The real lines those ~40 call sites shipped, plus the correct shapes the
    // pattern must NOT flag — without this a regex edit could silence it.
    const offenders = [
      `{new Date(log.timestamp).toLocaleString()}`,
      `{new Date(backup.createdAt).toLocaleString()}`,
      `{lastRefresh.toLocaleTimeString()}`,
      `return date.toLocaleDateString();`,
      `{entry.timestamp.toLocaleString()}`,
    ];
    for (const line of offenders) expect(RUNTIME_LOCALE_FORMAT.test(line), line).toBe(true);

    const clean = [
      `{formatDateTime(log.timestamp, locale)}`,
      `Last active: {formatDateTime(session.lastActive, locale)}`,
      `{formatDate(code.validFrom, locale)}`,
      `{lastRefresh ? formatTime(lastRefresh, locale) : "—"}`,
      `new Date(x).toLocaleDateString(intlLocale(locale), { dateStyle: "medium" })`,
      `date.toLocaleString("en-US")`,
    ];
    for (const line of clean) expect(RUNTIME_LOCALE_FORMAT.test(line), line).toBe(false);
  });
});

describe("user-facing dates read their locale from the country registry", () => {
  it("no date formatter hardcodes a locale tag", () => {
    const offenders = findHardcodedDateTags();
    const known = new Set(DATE_TAG_ALLOWLIST.map((a) => a.file));
    const unexpected = offenders.filter((o) => !known.has(o.split(":")[0]!));
    expect(
      unexpected,
      `Date formatters must read intlLocale(locale) instead of a literal tag:\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("keeps the allowlist honest (no stale entries)", () => {
    // If a listed file no longer hardcodes a tag, its entry should be deleted —
    // otherwise the guard quietly weakens over time.
    const offenders = findHardcodedDateTags();
    for (const entry of DATE_TAG_ALLOWLIST) {
      expect(
        offenders.some((o) => o.startsWith(`${entry.file}:`)),
        `${entry.file} is allowlisted but no longer needs to be (${entry.why})`
      ).toBe(true);
    }
  });

  it("recognizes the exact hardcoded tags it replaced (the guard is live)", () => {
    // Without this the guard could pass vacuously (e.g. after a regex edit that
    // matches nothing). These are the real lines that shipped "٥ مارس" beside
    // the app's "٥ آذار", plus the English-only tag and the correct call shape
    // the pattern must NOT flag.
    const pattern = new RegExp(HARDCODED_DATE_TAG_SOURCE);
    const offenders = [
      `new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
        weekday: "short",
      });`,
      `const nextDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", { weekday: "short" });`,
      `d.toLocaleTimeString(locale === "ar" ? "ar-SA" : "en-GB", { hour: "2-digit" });`,
      `new Date(x).toLocaleDateString("en-US", { month: "long" });`,
      `new Intl.DateTimeFormat("ar-LB", { day: "numeric" });`,
    ];
    for (const line of offenders) expect(pattern.test(line), line).toBe(true);

    const clean = [
      `new Date(iso).toLocaleDateString(intlLocale(locale), { weekday: "short" });`,
      `new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" });`,
      `new Date(x).toLocaleDateString(locale, { dateStyle: "medium" });`,
      `formatDayDate(startAt, locale);`,
    ];
    for (const line of clean) expect(pattern.test(line), line).toBe(false);
  });
});
