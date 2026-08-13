import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge } from "../src/components/ui/badge";

/**
 * Regression guards for HTML validity / hydration.
 *
 * A <div> (or any flow-content element that isn't phrasing content) nested
 * inside a <p> is invalid HTML: the browser auto-closes the <p>, so server
 * HTML and client hydration diverge ("In HTML, <div> cannot be a descendant
 * of <p>"). This bites when a component that renders a block element (e.g.
 * Badge before it rendered a span) is placed inside a <p>.
 */

/** Flow-content elements that are NOT phrasing content — illegal inside <p>. */
const BLOCK_TAGS = [
  "address",
  "article",
  "aside",
  "audio",
  "blockquote",
  "canvas",
  "caption",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "iframe",
  "li",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
  "video",
] as const;

const BLOCK_TAG_RE = new RegExp(`</?(?:${BLOCK_TAGS.join("|")})\\b`);

async function listTsxFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const rel of await readdir(dir, { recursive: true })) {
    if (typeof rel === "string" && rel.endsWith(".tsx")) out.push(path.join(dir, rel));
  }
  return out;
}

/**
 * Find block-level elements nested inside a <p>. JSX comments are stripped
 * first so a commented-out element can't trip the scan; custom component
 * names (e.g. <Badge>) can't be resolved statically and are deliberately out
 * of scope — those are covered by the render test below.
 *
 * Heuristic, not a parser: line comments and string literals containing block
 * tags, and `>` inside a <p> attribute expression, are not fully handled.
 * None occur in the current codebase (the scan passes clean) — treat this as
 * a regression guard, not a complete HTML validator.
 */
function findBlockInsideP(source: string): { tag: string; snippet: string }[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const violations: { tag: string; snippet: string }[] = [];
  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(stripped))) {
    const inner = m[1];
    const hit = inner.match(BLOCK_TAG_RE);
    if (hit) {
      violations.push({ tag: hit[0], snippet: inner.replace(/\s+/g, " ").slice(0, 90) });
    }
  }
  return violations;
}

describe("HTML nesting validity", () => {
  it("no block-level element is nested inside a <p> in any src .tsx file", async () => {
    const files = await listTsxFiles(path.resolve(__dirname, "../src"));
    expect(files.length).toBeGreaterThan(20); // sanity: we actually scanned the app

    const violations: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const v of findBlockInsideP(source)) {
        const rel = path.relative(path.resolve(__dirname, ".."), file);
        violations.push(`${rel}: <p> contains <${v.tag}> — “${v.snippet}…”`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("Badge renders an inline <span>, so it is valid phrasing content inside <p>", () => {
    const variants = [
      "default",
      "solid",
      "secondary",
      "outline",
      "success",
      "danger",
      "premium",
      "glass",
    ] as const;

    for (const variant of variants) {
      // The exact regression scenario: a Badge nested inside a paragraph.
      const html = renderToStaticMarkup(
        React.createElement(
          "p",
          null,
          "Khaled submitted a request ",
          React.createElement(Badge, { variant }, "Request")
        )
      );
      expect(html).toMatch(/^<p>/);
      expect(html).toContain("<span");
      expect(html).not.toContain("<div");
    }
  });
});
