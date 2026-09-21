/**
 * ────────────────────────────────────────────────────────────────────────────
 * THE COLOUR RAMPS MUST STAY MONOTONIC
 * ────────────────────────────────────────────────────────────────────────────
 * A numbered scale carries one promise: a higher number is darker. Everything
 * built on it assumes that — `text-ink-600` to add emphasis over `text-ink-500`,
 * a `hover:bg-ink-200` that deepens a `bg-ink-100`, a border one step down from
 * its fill.
 *
 * The ink ramp had quietly broken that promise. 400 and 500 were darkened for
 * contrast and 500 overshot 600: ink-500 measured 6.84:1 on the light
 * background while ink-600 measured 6.33:1. Every `500 → 600` in the codebase
 * was making text LIGHTER while reading as if it made it darker, and no
 * reviewer would catch it by eye — the two are 0.5:1 apart.
 *
 * These tests read the real token values out of globals.css, so they check
 * what ships rather than a copy.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** Every component/page source file, for the stacking-order sweep. */
function componentFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx")) out.push(full);
    }
  };
  walk(join(process.cwd(), "src/components"));
  walk(join(process.cwd(), "src/app"));
  return out;
}

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * The @theme block alone — where the ramps are DEFINED.
 *
 * Scoped deliberately: dark mode re-declares --color-ink-400/500 further down
 * with lighter values (light text on a dark surface). Reading the whole file
 * collects both definitions of the same step and compares a light-mode token
 * against a dark-mode one, which is meaningless — and reported the ramp as
 * broken when it was not.
 */
const THEME = CSS.slice(CSS.indexOf("@theme {"), CSS.indexOf("/* ---------- Base ---------- */"));

/** WCAG relative luminance. Higher = lighter. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(parseInt(h.slice(4, 6), 16))
  );
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every `--color-<name>-<step>: #hex` declared in the @theme block. */
function ramp(name: string): { step: number; hex: string }[] {
  const found: { step: number; hex: string }[] = [];
  const re = new RegExp(`--color-${name}-(\\d+):\\s*(#[0-9a-fA-F]{6})`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(THEME))) found.push({ step: Number(m[1]), hex: m[2] });
  return found.sort((a, b) => a.step - b.step);
}

describe.each(["ink", "brand"])("the %s ramp", (name) => {
  const steps = ramp(name);

  it("is complete enough to be worth checking", () => {
    expect(steps.length).toBeGreaterThanOrEqual(9);
  });

  it("gets darker as the number rises, with no inversions", () => {
    const inversions: string[] = [];
    for (let i = 1; i < steps.length; i++) {
      const prev = steps[i - 1];
      const cur = steps[i];
      if (luminance(cur.hex) > luminance(prev.hex)) {
        inversions.push(
          `${name}-${cur.step} (${cur.hex}) is LIGHTER than ${name}-${prev.step} (${prev.hex})`
        );
      }
    }
    expect(
      inversions,
      `A higher step must be darker — anything reaching for it to add emphasis ` +
        `is getting the opposite:\n  ${inversions.join("\n  ")}`
    ).toEqual([]);
  });
});

describe("the ink ramp carries the contrast the UI relies on", () => {
  const LIGHT_SURFACE = "#f7f6f4"; // --color-ink-50, the light-mode page background
  const byStep = Object.fromEntries(ramp("ink").map((s) => [s.step, s.hex]));

  it("muted body text (ink-500) clears WCAG AA on the page background", () => {
    expect(contrast(byStep[500], LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it("the faintest text token (ink-400) still clears AA", () => {
    // This is why 400/500 were darkened in the first place; the test keeps that
    // intent from being undone by someone "restoring" the original scale.
    expect(contrast(byStep[400], LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
  });

  it("each emphasis step is actually visible, not a rounding difference", () => {
    // ink-500 → ink-600 used to be a 0.5:1 step in the WRONG direction. A step
    // worth having has to change the contrast ratio by a noticeable amount.
    for (const [from, to] of [
      [400, 500],
      [500, 600],
      [600, 700],
    ] as const) {
      const delta =
        contrast(byStep[to], LIGHT_SURFACE) - contrast(byStep[from], LIGHT_SURFACE);
      expect(delta, `ink-${from} → ink-${to} is not a real step (Δ${delta.toFixed(2)}:1)`).toBeGreaterThan(0.4);
    }
  });
});

describe("globals.css does not hardcode what it has tokens for", () => {
  /** The @theme block — token definitions are allowed to contain hexes. */
  const body = CSS.slice(CSS.indexOf("/* ---------- Base ---------- */"));

  it("the brand gradient is built from brand tokens", () => {
    const gradient = /\.text-gradient\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(gradient, "the gradient used to end on a literal #b45309").not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it("declares a layering scale instead of escalating z-index", () => {
    // Tailwind v4's z-index namespace is --z-index-*, which is what produces
    // the `z-header` / `z-dialog` utilities the components use.
    for (const token of ["--z-index-header", "--z-index-dialog", "--z-index-toast", "--z-index-skip-link"]) {
      expect(CSS).toContain(token);
    }
  });

  it("no component escalates past the scale to win a stacking fight", () => {
    // The scale replaced 35 uses of z-50 plus z-[9999], z-[9998], z-[201],
    // z-[200], z-[100], z-[99] and z-[90] — each one added to beat whatever it
    // collided with, which is how you end up with a skip link under a banner.
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const src = readFileSync(file, "utf8");
      for (const line of src.split("\n")) {
        const m = /\bz-(?:\[(\d+)\]|(\d+))\b/.exec(line);
        if (!m) continue;
        const value = Number(m[1] ?? m[2]);
        // `fixed` always stacks against the page, so any raw value there is a
        // global-layer decision made by hand.
        if (/\bfixed\b/.test(line)) {
          offenders.push(`${relative(process.cwd(), file)} — z-${value} (fixed)`);
          continue;
        }
        // `sticky` is usually LOCAL — a sub-header inside a scrolling panel,
        // stacking only against its siblings. Small values there are correct.
        // Anything reaching into the scale's range (>= 20) is competing with
        // the page and belongs on a named layer.
        if (/\bsticky\b/.test(line) && value >= 20) {
          offenders.push(`${relative(process.cwd(), file)} — z-${value} (sticky)`);
        }
      }
    }
    expect(
      offenders,
      "Use a named layer from the scale in globals.css:\n  " + offenders.join("\n  ")
    ).toEqual([]);
  });

  it("does not put a blanket touch-target floor on every anchor and label", () => {
    // The old rule set min-height on `a` and `label` unconditionally, which did
    // nothing for inline elements and inflated dense desktop UI, then exempted
    // `.text-xs` — the class on small buttons, i.e. the exact targets it was
    // meant to grow.
    expect(body).not.toMatch(/^a, button, \[role="button"\].*\{/m);
    expect(body, "`.text-xs` must not be a touch-target escape hatch").not.toMatch(
      /\.badge-icon,\s*\.text-xs\s*\{\s*min-height:\s*auto/
    );
  });

  it("only applies the touch-target floor to coarse pointers", () => {
    expect(body).toMatch(/@media \(pointer: coarse\)/);
  });

  it("gates smooth scrolling on prefers-reduced-motion", () => {
    // The reduced-motion block cancels animations and transitions, but
    // scroll-behavior is neither — it has to be opted into separately.
    expect(body).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]{0,120}scroll-behavior:\s*smooth/);
  });

  it("declares the focus ring exactly once", () => {
    const declarations = body.match(/^:focus-visible\s*\{/gm) ?? [];
    expect(declarations).toHaveLength(1);
  });
});

/**
 * ────────────────────────────────────────────────────────────────────────────
 * DARK MODE IS NOT OPTIONAL PER COMPONENT
 * ────────────────────────────────────────────────────────────────────────────
 * 73 components — the whole admin console and a third of the worker dashboard —
 * were written with raw Tailwind grays and no `dark:` variants, so the theme
 * toggle left them as near-black text on a near-black page. They shipped that
 * way for as long as dark mode existed, because the only thing checking colour
 * was an axe run over five public pages in light mode.
 *
 * These are the cheap source-level guards. tests/playwright/dark-mode.spec.ts
 * is the real check — it audits the admin surface, signed in, theme flipped.
 * ────────────────────────────────────────────────────────────────────────────
 */
describe("colour comes from the design system", () => {
  /** Quoted strings that are class lists. */
  const CLASS_STRING = /(["'`])((?:(?!\1)[^\\\n])*)\1/g;

  function classListsIn(src: string): string[][] {
    const out: string[][] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(CLASS_STRING.source, "g");
    while ((m = re.exec(src))) {
      const tokens = m[2].split(/\s+/).filter(Boolean);
      if (tokens.some((t) => /^(?:[a-z-]+:)*(?:bg|text|border|ring|divide)-/.test(t))) out.push(tokens);
    }
    return out;
  }

  it("uses the ink tokens, never raw Tailwind grays", () => {
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      const src = readFileSync(file, "utf8");
      const hits = src.match(/\b[a-z-]*gray-\d+\b/g);
      if (hits) offenders.push(`${relative(process.cwd(), file)} — ${[...new Set(hits)].join(", ")}`);
    }
    expect(
      offenders,
      "`gray-*` has no dark-mode partner and is not the app's neutral. Use " +
        "`ink-*`:\n  " + offenders.join("\n  ")
    ).toEqual([]);
  });

  it("never pairs a dark foreground with a light surface in the same class list", () => {
    // The shape that produced the actual bug: a chip whose text flipped for
    // dark mode sitting on a card whose background did not, so light-on-light.
    const LIGHT_SURFACE = /^bg-(?:white|(?:ink|red|orange|amber|yellow|green|emerald|blue|indigo|violet|purple|pink|rose|teal|cyan|sky)-(?:50|100|200))$/;
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      for (const tokens of classListsIn(readFileSync(file, "utf8"))) {
        const hasDarkText = tokens.some((t) => t.startsWith("dark:text-"));
        const hasDarkBg = tokens.some((t) => t.startsWith("dark:bg-"));
        if (hasDarkText && !hasDarkBg && tokens.some((t) => LIGHT_SURFACE.test(t))) {
          offenders.push(`${relative(process.cwd(), file)} — ${tokens.join(" ").slice(0, 90)}`);
        }
      }
    }
    expect(
      offenders,
      "These flip their text for dark mode but keep a light background:\n  " + offenders.join("\n  ")
    ).toEqual([]);
  });

  it("keeps status chips at a text step that clears AA on their tint", () => {
    // `text-orange-600` on `bg-orange-100` measures 3.13:1. The convention is
    // the -100/-800 pair, which is 6.14:1 at worst across the palettes in use.
    const COLORS = "red|orange|amber|yellow|green|emerald|blue|indigo|violet|purple|pink|rose|teal|cyan|sky";
    const offenders: string[] = [];
    for (const file of componentFiles()) {
      for (const tokens of classListsIn(readFileSync(file, "utf8"))) {
        for (const token of tokens) {
          const bg = new RegExp(`^bg-(${COLORS})-(?:50|100)$`).exec(token);
          if (!bg) continue;
          const text = tokens.find((t) => new RegExp(`^text-${bg[1]}-\\d+$`).test(t));
          if (!text) continue;
          const step = Number(text.split("-")[2]);
          if (step < 800) {
            offenders.push(`${relative(process.cwd(), file)} — ${token} + ${text}`);
          }
        }
      }
    }
    expect(
      offenders,
      "Tinted chips need the -800 foreground to clear AA:\n  " + offenders.join("\n  ")
    ).toEqual([]);
  });
});
