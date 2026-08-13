import { describe, expect, it } from "vitest";
import { ar } from "@/lib/i18n/translations/ar";
import { en, type Dictionary } from "@/lib/i18n/translations/en";
import { translate } from "@/lib/i18n/dictionaries";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      keys.push(...flatten(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

describe("i18n parity", () => {
  it("Arabic dictionary has the exact same key tree as English", () => {
    const enKeys = flatten(en as unknown as Record<string, unknown>).sort();
    const arKeys = flatten(ar as unknown as Record<string, unknown>).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("all Arabic values are non-empty strings", () => {
    for (const key of flatten(ar as unknown as Record<string, unknown>)) {
      const value = translate(ar, key);
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toBe(key); // no missing translations
    }
  });
});

describe("translate", () => {
  it("resolves dot paths", () => {
    expect(translate(en, "nav.home")).toBe("Home");
    expect(translate(ar, "nav.home")).toBe("الرئيسية");
  });

  it("substitutes template variables", () => {
    expect(translate(en, "auth.success", { name: "Sara" })).toBe("Welcome back, Sara!");
  });

  it("falls back to the key for unknown paths", () => {
    expect(translate(en, "does.not.exist")).toBe("does.not.exist");
  });
});

describe("dictionary types", () => {
  it("en and ar share the same type", () => {
    const a: Dictionary = ar;
    expect(a.app.name.length).toBeGreaterThan(0);
  });
});
