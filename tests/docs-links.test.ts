import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  extractLinks,
  headingSlug,
  headingSlugs,
  isExternal,
  splitAnchor,
  stripInlineCode,
} from "../scripts/check-docs-links.mjs";

/**
 * Pins the CONTRACT of `scripts/check-docs-links.mjs`, which CI runs
 * (`npm run check:docs-links`) — a false failure here blocks every push.
 *
 * Two ways it produced false failures on this repo, both fixed and pinned:
 *
 *  1. A doc that *explains* the checker quotes the very placeholder it excludes
 *     — the tracking pixel `<img src="/api/ads/{id}/impression">`. The checker
 *     scans for `<img src="…">`, so the quoted sample was resolved as a real
 *     route and reported broken. Inline code is not clickable on GitHub, so it
 *     must be blanked before matching.
 *  2. GitHub's heading slugs delete punctuation *before* mapping each space to
 *     its own hyphen, so "## 2. Authentication & Authorization Testing" slugs to
 *     `2-authentication--authorization-testing` (two hyphens). Collapsing
 *     whitespace runs made all 18 `&` / " — " headings in docs/ look broken.
 */

const ROOT = fileURLToPath(new URL("..", import.meta.url));

describe("stripInlineCode", () => {
  it("blanks a single-backtick span", () => {
    expect(stripInlineCode("see `a.md` here")).toBe("see        here");
  });

  it("blanks a double-backtick span that itself contains a backtick", () => {
    expect(stripInlineCode("x ``a`b`` y")).toBe("x         y");
  });

  it("preserves length and line offsets so reported columns stay valid", () => {
    const line = 'quoted `<img src="/api/ads/{id}/impression">` tail';
    expect(stripInlineCode(line)).toHaveLength(line.length);
  });

  it("keeps an unterminated backtick run verbatim", () => {
    // "```html" written mid-sentence is prose, not a code span.
    expect(stripInlineCode("inside a ```html fence")).toBe("inside a ```html fence");
  });

  it("leaves a line with no code span untouched", () => {
    const line = "[a](b.md) and <img src=\"c.svg\">";
    expect(stripInlineCode(line)).toBe(line);
  });
});

describe("extractLinks", () => {
  it("finds markdown links, markdown images and HTML <img src>", () => {
    const links = extractLinks('[text](a.md) ![alt](b.svg) <img src="c.svg">');
    expect(links.map((l) => [l.target, l.kind])).toEqual([
      ["b.svg", "image"],
      ["a.md", "link"],
      ["c.svg", "image"],
    ]);
  });

  it("skips a fenced code block", () => {
    const md = ["before", "```html", '<img src="/api/ads/{id}/impression">', "```", "after"].join(
      "\n"
    );
    expect(extractLinks(md)).toEqual([]);
  });

  it("skips markup quoted inside an inline code span", () => {
    const md = 'the example `<img src="/api/ads/{id}/impression">` inside a fence';
    expect(extractLinks(md)).toEqual([]);
  });

  it("skips a markdown link quoted inside an inline code span", () => {
    expect(extractLinks("write `[text](missing.md)` to link")).toEqual([]);
  });

  it("still reports links on a line that also carries a quoted sample", () => {
    const md = 'quoted `<img src="/nope.svg">` then ![logo](real.svg)';
    expect(extractLinks(md).map((l) => l.target)).toEqual(["real.svg"]);
  });

  it("reports the 1-based line number of each link", () => {
    const md = ["# Title", "", "[a](a.md)", "[b](b.md)"].join("\n");
    expect(extractLinks(md).map((l) => l.line)).toEqual([3, 4]);
  });
});

describe("headingSlug (GitHub algorithm)", () => {
  it("deletes punctuation before mapping each space to a hyphen", () => {
    expect(headingSlug("## 2. Authentication & Authorization Testing")).toBe(
      "2-authentication--authorization-testing"
    );
  });

  it("keeps the double hyphen for an em-dash separator", () => {
    expect(headingSlug("## 7. Dashboard Testing — Worker")).toBe("7-dashboard-testing--worker");
  });

  it("trims leading/trailing space so no stray hyphen appears", () => {
    expect(headingSlug("#  Keep fresh  ")).toBe("keep-fresh");
  });

  it("collects every heading of a document", () => {
    const slugs = headingSlugs("## A & B\n\ntext\n\n### A & B\n");
    expect([...slugs]).toEqual(["a--b"]);
  });
});

describe("splitAnchor / isExternal", () => {
  it("splits a file#anchor target and a bare anchor", () => {
    expect(splitAnchor("TESTING.md#4-setup")).toEqual(["TESTING.md", "4-setup"]);
    expect(splitAnchor("#overview")).toEqual(["", "overview"]);
    expect(splitAnchor("PLAIN.md")).toEqual(["PLAIN.md", null]);
  });

  it("treats web schemes as external", () => {
    for (const t of ["https://x.dev", "http://x.dev", "mailto:a@b.c", "tel:+961", "data:text/x"]) {
      expect(isExternal(t)).toBe(true);
    }
    expect(isExternal("docs/x.md")).toBe(false);
  });
});

describe("the real plan doc (regression: the CI false failure)", () => {
  it("yields no /api/ads placeholder as a link", () => {
    const md = readFileSync(
      path.join(ROOT, "docs/MULTI-COUNTRY-AND-QUALITY-PLAN.md"),
      "utf8"
    );
    const suspicious = extractLinks(md).filter((l) => l.target.includes("/api/ads"));
    expect(suspicious).toEqual([]);
  });
});
