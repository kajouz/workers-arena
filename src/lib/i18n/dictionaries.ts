import { en, type Dictionary } from "./translations/en";
import { ar } from "./translations/ar";
import type { Locale } from "./config";

export const dictionaries: Record<Locale, Dictionary> = { en, ar };

export type { Dictionary };

/** Dot-path key resolver: t("nav.home") → string, falling back to English. */
export function translate(dict: Dictionary, key: string, vars?: Record<string, string | number>): string {
  let value: unknown = dict;
  for (const part of key.split(".")) {
    if (value && typeof value === "object" && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      value = undefined;
      break;
    }
  }
  let out = typeof value === "string" ? value : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}
