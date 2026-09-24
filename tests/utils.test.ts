import { describe, expect, it } from "vitest";
import { formatPrice, hueFromSeed, initials, pluralize, timeAgo } from "@/lib/utils";
import { sanitizeText } from "@/lib/security";

describe("formatPrice", () => {
  it("formats Arabic prices with the currency suffix", () => {
    expect(formatPrice(150, "USD", "ar")).toBe("$150");
    expect(formatPrice(250, "USD", "ar")).toBe("$250");
  });

  it("formats English prices with the currency prefix", () => {
    expect(formatPrice(150, "USD", "en")).toBe("$150");
    expect(formatPrice(40, "USD", "en")).toBe("$40");
  });
});

describe("initials", () => {
  it("builds initials from names", () => {
    expect(initials("Khaled Al-Harbi")).toBe("KA");
    expect(initials("عمر المطيري")).toBe("عا");
  });
});

describe("hueFromSeed", () => {
  it("is deterministic and bounded", () => {
    const a = hueFromSeed("omar");
    const b = hueFromSeed("omar");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
    expect(hueFromSeed("different")).not.toBe(a);
  });
});

describe("timeAgo", () => {
  it("produces relative time in both locales", () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000);
    expect(timeAgo(twoDaysAgo, "en")).toBe("2 days ago");
    expect(timeAgo(twoDaysAgo, "ar")).toBe("منذ 2 يوم");
  });
});

describe("sanitizeText", () => {
  it("strips HTML and script tags", () => {
    const dirty = '<script>alert("x")</script>Hello <b>world</b>';
    expect(sanitizeText(dirty)).toBe('alert("x")Hello world');
  });
});

describe("pluralize", () => {
  it("picks the English singular/plural via Intl.PluralRules", () => {
    const forms = { one: "worker", other: "workers" };
    expect(pluralize("en", 1, forms)).toBe("worker");
    expect(pluralize("en", 0, forms)).toBe("workers");
    expect(pluralize("en", 22, forms)).toBe("workers");
  });

  it("handles Arabic's six plural forms", () => {
    const forms = { zero: "لا عمال", one: "عامل", two: "عاملان", few: "عمال", many: "عاملًا", other: "عامل" };
    expect(pluralize("ar", 0, forms)).toBe("لا عمال");
    expect(pluralize("ar", 1, forms)).toBe("عامل");
    expect(pluralize("ar", 2, forms)).toBe("عاملان");
    expect(pluralize("ar", 5, forms)).toBe("عمال");
    expect(pluralize("ar", 11, forms)).toBe("عاملًا");
    expect(pluralize("ar", 100, forms)).toBe("عامل");
  });

  it("falls back to `other` for an uncovered rule", () => {
    expect(pluralize("en", 5, { one: "x", other: "y" })).toBe("y");
  });
});
