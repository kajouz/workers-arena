import { describe, expect, it } from "vitest";
import { formatPrice, hueFromSeed, initials, timeAgo } from "@/lib/utils";
import { sanitizeText } from "@/lib/security";

describe("formatPrice", () => {
  it("formats Arabic prices with the currency suffix", () => {
    expect(formatPrice(150, "SAR", "ar")).toBe("150 ر.س");
    expect(formatPrice(250, "EGP", "ar")).toBe("250 ج.م");
  });

  it("formats English prices with the currency prefix", () => {
    expect(formatPrice(150, "SAR", "en")).toBe("SAR 150");
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
