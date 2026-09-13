import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  durationParts,
  fillDuration,
  formatCompact,
  formatDate,
  formatNumber,
  formatPrice,
  timeAgo,
} from "@/lib/utils";
import { NUMBER_LOCALE, intlLocale } from "@/lib/tenant/countries";
import { dictionaries, translate } from "@/lib/i18n/dictionaries";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The app has TWO families of numeric output, and they differ on purpose:
 *
 *   1. CALENDAR / CLOCK — dates, times, weekday and month names. These follow
 *      the country's `intlLocale`, so Arabic renders Arabic-Indic digits
 *      (١٣ أيلول ٢٠٢٦). Pinned in tests/arabic-dates.test.ts.
 *   2. EVERY OTHER NUMBER — money, counts, percentages, durations and the SLA
 *      countdown. These are ASCII in both languages: "47 س 42 د" sits next to
 *      "١٣ أيلول" and beside "$1,500".
 *
 * Family 2 was previously implied rather than decided: `formatNumber` happened to
 * force an en-US tag, the four countdown sites happened to use `String(n)`, and
 * everything else drifted. Three real shapes were found and fixed:
 *
 *   • the admin trails document counted bookings with
 *     `Intl.NumberFormat(intlLocale(locale))` — a country tag, so Arabic really
 *     did print "٢ حجز" beside the document's ASCII money and row indices;
 *   • ~40 counter/money labels used a bare `.toLocaleString()`, which takes the
 *     RUNTIME locale — so the same number rendered two ways on two machines
 *     (Arabic-Indic on a reader whose browser locale is ar-LB, Latin on the
 *     en-US server) and could differ between the server render and the client;
 *   • the booking-row deposit formatted itself with
 *     `(deposit / 100).toLocaleString(locale)` — agreed by accident only because
 *     CLDR resolves a bare "ar" tag to the latn numbering system, while the
 *     country tag it should have used (and that the rest of the app does use)
 *     resolves to arab.
 *
 * That last one is why the guard below is a SOURCE guard rather than only
 * rendered assertions: a formatter whose digits "happen to" come out right can
 * flip with a locale-data change and no visible diff in a passing test.
 *
 * These tests pin the decision where it now lives (`NUMBER_LOCALE`), pin every
 * shared formatter's rendered output, pin the duration split/fill that the
 * countdown surfaces share, and finally fail the build when a component formats
 * a number itself.
 */

/** Arabic-Indic digits (١٢٣…) — the DATE family only. */
const ARABIC_INDIC = /[\u0660-\u0669]/;
/** Latin digits (123…). */
const LATIN_DIGITS = /[0-9]/;

describe("the digit convention is decided in one place", () => {
  it("pins both halves of the rule side by side", () => {
    expect(intlLocale("ar"), "dates read the served country's Arabic tag").toBe("ar-LB");
    expect(NUMBER_LOCALE, "numbers read one fixed ASCII tag").toBe("en-US");
  });

  it("documents a real divergence: the same value renders in two digit systems", () => {
    // If a future change collapses these two, every assertion below starts
    // passing for the wrong reason — so assert the divergence itself.
    expect(formatDate(new Date(2026, 2, 5, 12), "ar")).toMatch(ARABIC_INDIC);
    expect(formatNumber(1500)).toMatch(LATIN_DIGITS);
    expect(formatNumber(1500)).not.toMatch(ARABIC_INDIC);
  });
});

describe("non-date numbers are ASCII in both languages", () => {
  it("formatNumber groups with ASCII digits and takes no locale", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(1500)).toBe("1,500");
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("formatCompact keeps ASCII digits", () => {
    expect(formatCompact(12400)).toBe("12.4K");
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(12400)).not.toMatch(ARABIC_INDIC);
  });

  it("money stays ASCII — the same value in both UI locales", () => {
    expect(formatPrice(1234, "USD", "ar")).toBe(formatPrice(1234, "USD", "en"));
    expect(formatPrice(1234, "USD", "ar")).not.toMatch(ARABIC_INDIC);
  });

  it("relative times are durations, so Arabic keeps ASCII digits", () => {
    const ar = timeAgo(new Date(Date.now() - 15 * 60_000), "ar");
    expect(ar).toBe("منذ 15 دقيقة");
    expect(ar).toMatch(LATIN_DIGITS);
    expect(ar).not.toMatch(ARABIC_INDIC);
    expect(timeAgo(new Date(Date.now() - 2 * 24 * 3_600_000), "en")).toBe("2 days ago");
  });
});

describe("countdowns and durations share one split and one filler", () => {
  it("durationParts splits hours/minutes and rounds UP to the next minute", () => {
    expect(durationParts(47 * 3_600_000 + 42 * 60_000)).toEqual({ hours: 47, minutes: 42 });
    expect(durationParts(48 * 3_600_000)).toEqual({ hours: 48, minutes: 0 });
    expect(durationParts(0)).toEqual({ hours: 0, minutes: 0 });
    // A deadline 30s away reads "1" (about to expire), not "0" (already gone).
    expect(durationParts(30_000)).toEqual({ hours: 0, minutes: 1 });
    // A deadline that has passed clamps to zero rather than going negative.
    expect(durationParts(-5_000)).toEqual({ hours: 0, minutes: 0 });
  });

  it("fillDuration renders ASCII digits and consumes the placeholders", () => {
    const filled = fillDuration("يُلغى تلقائياً خلال {hours} س {minutes} د", { hours: 47, minutes: 42 });
    expect(filled).toBe("يُلغى تلقائياً خلال 47 س 42 د");
    expect(filled).toMatch(LATIN_DIGITS);
    expect(filled).not.toMatch(ARABIC_INDIC);
    expect(filled).not.toMatch(/\{(hours|minutes)\}/);
  });

  it("replaces EVERY occurrence (the policy copy names the window twice)", () => {
    const filled = fillDuration("{hours} before, {hours} after", { hours: 48, minutes: 0 });
    expect(filled).toBe("48 before, 48 after");
  });

  it("leaves a placeholder the copy does not use alone", () => {
    // The "under N minutes" variants only use {minutes}; filling {hours} must
    // not leave a stray replacement or an empty gap.
    expect(fillDuration("بقي أقل من {minutes} د", { hours: 0, minutes: 9 })).toBe("بقي أقل من 9 د");
    expect(fillDuration("المحادثة {hours}", { hours: 0, minutes: 0 })).toBe("المحادثة 0");
  });

  /** Every copy that spells out BOTH parts of a duration. */
  const COUNTDOWN_KEYS = [
    "booking.slaCustomerNote",
    "booking.slaWorkerNote",
    "booking.slaWorkerNudged",
    "booking.slaAdminCountdown",
    "booking.slaDialogCountdown",
    "booking.slaWorkerDialogCountdown",
    "booking.quotesExpires",
  ];

  /** The "under N minutes" variants — minutes only, by design. */
  const MINUTES_ONLY_KEYS = ["booking.slaDialogSoon", "booking.slaWorkerDialogSoon"];

  it("every countdown surface in the Arabic dictionary agrees on the digits", () => {
    const parts = { hours: 47, minutes: 42 };
    for (const key of COUNTDOWN_KEYS) {
      const filled = fillDuration(translate(dictionaries.ar, key), parts);
      const label = `booking.${key.split(".")[1]}`;
      expect(filled, label).not.toMatch(ARABIC_INDIC);
      expect(filled, label).not.toMatch(/\{(hours|minutes)\}/);
      // The SAME duration renders the SAME digits on every surface — the
      // property that broke when each site formatted its own numbers.
      expect(filled, label).toContain("47");
      expect(filled, label).toContain("42");
    }
  });

  it("the minutes-only variants render ASCII minutes and stay hours-free", () => {
    for (const key of MINUTES_ONLY_KEYS) {
      const filled = fillDuration(translate(dictionaries.ar, key), { hours: 0, minutes: 42 });
      expect(filled, key).toContain("42");
      expect(filled, key).not.toMatch(ARABIC_INDIC);
      expect(filled, key).not.toMatch(/\{minutes\}/);
      // Filling {hours} cannot introduce a number into copy that never asked
      // for one — that is why these are minutes-only.
      expect(filled, key).not.toContain("0 س");
    }
  });

  it("every countdown surface in the English dictionary fills its placeholders too", () => {
    const filled = fillDuration(translate(dictionaries.en, "booking.slaCustomerNote"), {
      hours: 47,
      minutes: 42,
    });
    expect(filled).toBe("Auto-cancels in 47h 42m if the worker doesn't respond");
    for (const key of [...COUNTDOWN_KEYS, ...MINUTES_ONLY_KEYS]) {
      const copy = translate(dictionaries.en, key);
      expect(fillDuration(copy, { hours: 47, minutes: 42 }), key).not.toMatch(/\{(hours|minutes)\}/);
    }
  });

  it("the refund-policy lines take the window as a duration too", () => {
    for (const key of ["booking.cancelPolicyBody", "booking.cancelPolicyRow"]) {
      const filled = fillDuration(translate(dictionaries.ar, key), durationParts(48 * 3_600_000));
      expect(filled, key).toContain("48");
      expect(filled, key).not.toMatch(ARABIC_INDIC);
      expect(filled, key).not.toMatch(/\{hours\}/);
    }
  });

  it("renders the shipped copy, not just the pattern (spot-check both languages)", () => {
    // The string a Levantine customer actually reads on /bookings, with the
    // digits the rest of the row uses.
    expect(
      fillDuration(translate(dictionaries.ar, "booking.slaCustomerNote"), durationParts(47 * 3_600_000 + 42 * 60_000))
    ).toBe(translate(dictionaries.ar, "booking.slaCustomerNote").replace("{hours}", "47").replace("{minutes}", "42"));
    expect(fillDuration(translate(dictionaries.ar, "booking.quotesExpires"), { hours: 3, minutes: 5 })).toBe(
      "يُغلق خلال 3 س 5 د"
    );
  });
});

/**
 * ── The guard ────────────────────────────────────────────────────────────────
 * Three shapes let the digits drift, each one observed in the code before this
 * convention existed:
 *
 *   R1  a bare `.toLocaleString()` — no locale argument, so it uses the RUNTIME
 *       locale: Arabic-Indic on an Arabic machine, and a server/client mismatch
 *       when the two differ. (~40 counter/money labels did this.)
 *   R2  a locale-derived tag handed to a NUMBER formatter —
 *       `.toLocaleString(locale)` on a deposit, and
 *       `new Intl.NumberFormat(intlLocale(locale))` for the admin document's
 *       booking count.
 *   R3  a component filling a duration placeholder itself rather than going
 *       through `fillDuration` — the four hand-rolled countdown substitutions.
 *
 * Module boundaries, not trust: the two OWNER modules below are the only places
 * allowed to build a number formatter (they are the single source of truth),
 * and `fillDuration` in `@/lib/utils` is the only place allowed to expand a
 * duration placeholder.
 */
const OWNER_MODULES = [path.join("src", "lib", "utils.ts"), path.join("src", "lib", "currency.ts")];

/**
 * Files allowed to break a rule, each with the reason it is not a numeral leak.
 *
 * Empty, and it should stay that way — every number in src now goes through the
 * shared helpers, and the date receivers that legitimately call
 * `.toLocaleString()` are handled by DATE_RECEIVER below (they are the date
 * sweep's problem, not the numeral convention's). The mechanism stays so a real
 * exception can be recorded with its reason instead of loosening the rule.
 */
const ALLOWLIST: { file: string; why: string }[] = [];

/** A receiver that is a Date, whose formatting is the tracked date gap. */
const DATE_RECEIVER = /(?:new Date\([^)]*\)|Date\.parse\([^)]*\)|\.getTime\(\)|[\w.$]*(?:At|Date|Time|timestamp))\s*$/;

/** A locale tag or locale variable handed to a number formatter (R2). */
const LOCALE_DERIVED_ARG = /(?:toLocaleString|Intl\.NumberFormat)\(\s*(?:locale\b|intlLocale\(|["'`](?:ar|en)[-_])/;
/** A duration placeholder expanded by hand (R3). */
const HAND_FILLED_DURATION = /\.replace\(\s*(?:\/\\?\{hours\\?\}\/g?|["'`]\{hours\}["'`]|["'`]\{minutes\}["'`])/;

/** Classify one source line. Returns a reason when the line breaks a rule. */
function digitOffence(line: string): string | null {
  const bare = line.indexOf(".toLocaleString()");
  if (bare !== -1) {
    // The receiver is whatever precedes the call; a Date receiver is the
    // separately-tracked date gap, everything else is a number we must format.
    const receiver = line.slice(Math.max(0, bare - 60), bare);
    if (!DATE_RECEIVER.test(receiver)) return "bare .toLocaleString() uses the RUNTIME locale";
  }
  const isDate = line.includes("new Date(") || DATE_RECEIVER.test(line.slice(0, line.indexOf(".toLocaleString(") + 1));
  if (!isDate && LOCALE_DERIVED_ARG.test(line)) return "a locale-derived tag on a number formatter";
  if (HAND_FILLED_DURATION.test(line)) return "a duration placeholder expanded by hand, not via fillDuration";
  return null;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

/** Every (file:line) that formats a number with digits it does not control. */
function findDigitOffenders(): string[] {
  const offenders: string[] = [];
  for (const file of walk(path.join(ROOT, "src"))) {
    const rel = path.relative(ROOT, file);
    if (OWNER_MODULES.includes(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const reason = digitOffence(line);
        if (reason) offenders.push(`${rel}:${i + 1} — ${reason}`);
      });
  }
  return offenders;
}

describe("numbers read their digits from ONE place", () => {
  it("scans the whole source tree (the guard cannot pass vacuously)", () => {
    const files = walk(path.join(ROOT, "src"));
    expect(files.length, "src should hold hundreds of modules").toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(path.join("components", "bookings", "booking-row.tsx")))).toBe(true);
  });

  it("no component formats a number with the runtime or a locale-derived tag", () => {
    const offenders = findDigitOffenders();
    const allowed = new Set(ALLOWLIST.map((a) => a.file));
    const unexpected = offenders.filter((o) => !allowed.has(o.split(":")[0]!));
    expect(
      unexpected,
      `Non-date numbers must go through formatNumber/formatPrice/fillDuration (NUMBER_LOCALE):\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("keeps the allowlist honest (no stale entries)", () => {
    const offenders = findDigitOffenders();
    for (const entry of ALLOWLIST) {
      expect(
        offenders.some((o) => o.startsWith(`${entry.file}:`)),
        `${entry.file} is allowlisted but no longer offends (${entry.why})`
      ).toBe(true);
    }
  });

  it("recognizes the exact shapes it replaced (the guard is live)", () => {
    // Without this the guard could pass vacuously after a regex edit. These are
    // the real lines that shipped disagreement, plus the correct call shapes the
    // guard must NOT flag.
    const offenders = [
      `\`\${(booking.deposit! / 100).toLocaleString(locale)} \${booking.currency}\``,
      `{stats.reward.toLocaleString()} {stats.currency}`,
      `const num = new Intl.NumberFormat(intlLocale(locale));`,
      `{config.symbol}{amount.toLocaleString("en-US")}`,
      `  .replace("{hours}", String(hours))`,
      `{t("booking.cancelPolicyRow").replace(/\\{hours\\}/g, String(48))}`,
    ];
    for (const line of offenders) expect(digitOffence(line), line).not.toBeNull();

    const clean = [
      `{formatNumber(stats.totalXP)}`,
      `{formatPrice(booking.deposit! / 100, booking.currency, locale)}`,
      `const remaining = durationParts(expiryMs - now);`,
      `{fillDuration(copy, remaining)}`,
      `  return new Intl.NumberFormat(NUMBER_LOCALE).format(n);`,
      // Dates keep their own (separately pinned) localization.
      `{new Date(msg.createdAt).toLocaleString()}`,
      `<p>Date: \${report.timestamp.toLocaleString()}</p>`,
      `new Date(time).toLocaleString(intlLocale(locale), { dateStyle: "medium" });`,
      `expect(timeAgo(twoDaysAgo, "ar")).toBe("منذ 2 يوم");`,
    ];
    for (const line of clean) expect(digitOffence(line), line).toBeNull();
  });
});
