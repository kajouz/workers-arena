#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────────────
 * ONE-OFF JSX NESTING SCANNER (hydration-error guard)
 * ────────────────────────────────────────────────────────────────────────────
 * Scans every .tsx file under a directory (default: src) for invalid element
 * nesting that produces "In HTML, <X> cannot be a descendant of <Y>" hydration
 * errors / React validateDOMNesting warnings:
 *
 *   • block elements inside <p>            (div/section/ul/table/h1-h6…)
 *   • <p> inside <p>                       (browser auto-closes → mismatch)
 *   • <button> inside <button>             (browser auto-closes → mismatch)
 *   • <a> inside <a>                       (browser auto-closes → mismatch)
 *   • <form> inside <form>                 (inner form is dropped → mismatch)
 *   • interactive elements inside <button>/<a>
 *     (a/button/input/select/textarea/label/iframe/…)
 *
 * Deliberately out of scope (browsers preserve these in the DOM — warning,
 * not a hydration mismatch): block elements inside <button>/<a>, and table /
 * list structure (<li> outside <ul>, <td> outside <tr>, …). Treat this tool
 * as a hydration-guard, not a complete HTML validator.
 *
 * Usage:
 *   node scripts/check-nesting.mjs [dir]      # default: src
 *   exit 0 = clean, 1 = findings found
 *
 * It is a lightweight JSX tokenizer, not a full parser: strings, template
 * literals and comments are skipped; JSX elements inside `{...}` expressions
 * are still followed; `<name>` is only treated as a tag when the previous
 * character is not identifier-like (so generics like `useState<number>` and
 * comparisons like `x < y` don't false-positive). Custom components
 * (`<Button>`, `<Link>`) are tracked only for balance — their rendered root
 * can't be known statically, so they're excluded from the nesting checks.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TARGET_DIR = process.argv[2] ?? "src";

/**
 * Known HTML + SVG intrinsic element names. Used to disambiguate real JSX
 * tags from TypeScript generics / comparisons: `Workers<span>` is a tag (span
 * is intrinsic), `useState<number>` and `const f = <K extends …>` are not
 * (number/K are type names).
 */
const INTRINSIC_TAGS = new Set([
  // HTML
  "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
  "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
  "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
  "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
  "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
  "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map",
  "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol",
  "optgroup", "option", "output", "p", "picture", "pre", "progress", "q",
  "rp", "rt", "ruby", "s", "samp", "script", "search", "section", "select",
  "slot", "small", "source", "span", "strong", "style", "sub", "summary",
  "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th",
  "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr",
  // SVG (used inline in this codebase)
  "svg", "path", "circle", "rect", "line", "polyline", "polygon", "g", "text",
  "defs", "use", "symbol", "mask", "linearGradient", "radialGradient", "stop",
  "clipPath", "filter", "feGaussianBlur", "pattern", "ellipse", "tspan",
  "marker", "foreignObject",
]);

/** Flow content that is NOT phrasing content — illegal as a descendant of <p>. */
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "audio", "blockquote", "canvas", "caption",
  "col", "colgroup", "dd", "details", "dialog", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hr", "iframe", "li", "main", "menu", "nav", "ol", "pre",
  "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
  "ul", "video",
]);

/** Interactive content — banned as a descendant of <button> and <a>. */
const INTERACTIVE = new Set([
  "a", "button", "input", "select", "textarea", "label", "iframe", "details",
  "embed", "object",
]);

/* ───────────────────────────── text skippers ───────────────────────────── */

function skipString(src, i, quote) {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") { j += 2; continue; }
    if (c === quote) return j + 1;
    j += 1;
  }
  return src.length;
}

function skipTemplate(src, i) {
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") { j += 2; continue; }
    if (c === "`") return j + 1;
    if (c === "$" && src[j + 1] === "{") { j = skipBraces(src, j + 1); continue; }
    j += 1;
  }
  return src.length;
}

function skipLineComment(src, i) {
  const nl = src.indexOf("\n", i);
  return nl === -1 ? src.length : nl + 1;
}

function skipBlockComment(src, i) {
  const end = src.indexOf("*/", i + 2);
  return end === -1 ? src.length : end + 2;
}

/** Skip a balanced {…} expression, honoring nested strings/comments/braces. */
function skipBraces(src, i) {
  let depth = 0;
  let j = i;
  while (j < src.length) {
    const c = src[j];
    if (c === '"' || c === "'") { j = skipString(src, j, c); continue; }
    if (c === "`") { j = skipTemplate(src, j); continue; }
    if (c === "/" && src[j + 1] === "/") { j = skipLineComment(src, j); continue; }
    if (c === "/" && src[j + 1] === "*") { j = skipBlockComment(src, j); continue; }
    if (c === "{") depth += 1;
    else if (c === "}") { depth -= 1; if (depth === 0) return j + 1; }
    j += 1;
  }
  return src.length;
}

/* ────────────────────────────── tag scanner ────────────────────────────── */

/**
 * Try to read an open tag at src[i] ("<"). Returns { name, end, selfClosing }
 * or null when this is not a tag (JS generics / comparisons). A real JSX tag
 * is preceded by a non-identifier character — `useState<number>` and `x < y`
 * fail this check; `{cond && <div/>}` passes.
 */
function parseOpenTag(src, i) {
  const m = /^<([A-Za-z][\w:.-]*)/.exec(src.slice(i));
  if (!m) return null;
  const name = m[1];
  const start = i;
  const after = src[i + m[0].length];
  if (after === undefined || !/[>/\s={]/.test(after)) return null;
  // An identifier-like char right before `<` means this is likely a generic /
  // comparison (`useState<number>`, `x < y`) — UNLESS the name is a known
  // intrinsic element (`Workers<span>` is a real tag).
  const prev = i === 0 ? "" : src[i - 1];
  if (/[A-Za-z0-9_)\]"']/.test(prev) && !INTRINSIC_TAGS.has(name)) return null;
  // `<T extends …>` is the generic-arrow form (a bare <T> would be parsed as
  // JSX, so TS requires a constraint or comma here) — never a real tag.
  if (/^\s+extends\b/.test(src.slice(i + m[0].length))) return null;
  let j = i + m[0].length;
  while (j < src.length) {
    const c = src[j];
    if (c === '"' || c === "'") { j = skipString(src, j, c); continue; }
    if (c === "{") { j = skipBraces(src, j); continue; }
    if (c === ">" ) return { name: m[1], start, end: j + 1, selfClosing: false };
    if (c === "/" && src[j + 1] === ">") return { name: m[1], start, end: j + 2, selfClosing: true };
    j += 1;
  }
  return null; // unterminated tag — ignore
}

/* ────────────────────────────── checks ─────────────────────────────────── */

function checkPush(name, tagIndex, report, stack, selfClosing = false) {
  const has = (tag) => stack.some((el) => el.name === tag);
  const hasP = has("p");

  if (name === "p" && hasP) report(tagIndex, "p-in-p", "<p> cannot be a descendant of <p>");
  else if (BLOCK_TAGS.has(name) && hasP)
    report(tagIndex, "block-in-p", `<${name}> cannot be a descendant of <p>`);

  if (name === "button" && has("button"))
    report(tagIndex, "button-in-button", "<button> cannot be a descendant of <button>");
  else if (name === "a" && has("a"))
    report(tagIndex, "a-in-a", "<a> cannot be a descendant of <a>");
  else if (name === "form" && has("form"))
    report(tagIndex, "form-in-form", "<form> cannot be a descendant of <form>");
  // Any interactive element inside <button>/<a> — except when the nearest
  // such ancestor is the SAME tag, which the specific rules above already
  // report (<a> in <a>, <button> in <button>). This catches the cross-tag
  // cases: <a> in <button> and <button> in <a>.
  else if (INTERACTIVE.has(name)) {
    const anc = [...stack].reverse().find((el) => el.name === "button" || el.name === "a");
    if (anc && anc.name !== name)
      report(tagIndex, "interactive-in-container", `<${name}> cannot be a descendant of <${anc.name}>`);
  }

  if (!selfClosing) stack.push({ name, index: tagIndex });
}

function scanSource(source) {
  const findings = [];
  const stack = [];
  let i = 0;

  const report = (index, rule, message) => {
    const before = source.slice(0, index);
    const line = before.split("\n").length;
    const col = index - before.lastIndexOf("\n"); // 1-based
    // one line of context for the report
    const nl = source.indexOf("\n", index);
    const lineText = source.slice(source.lastIndexOf("\n", index) + 1, nl === -1 ? index + 80 : nl).trim();
    findings.push({ line, col, rule, message, lineText });
  };

  while (i < source.length) {
    const c = source[i];
    if (c === '"' || c === "'") { i = skipString(source, i, c); continue; }
    if (c === "`") { i = skipTemplate(source, i); continue; }
    if (c === "/" && source[i + 1] === "/") { i = skipLineComment(source, i); continue; }
    if (c === "/" && source[i + 1] === "*") { i = skipBlockComment(source, i); continue; }

    if (c === "<") {
      const next = source[i + 1];
      if (next === "/") {
        if (source[i + 2] === ">") {
          // fragment close </>
          const top = stack.pop();
          if (top && top.name !== "")
            report(i, "mismatched-close", `fragment </> closes <${top.name}> — unbalanced JSX`);
          i += 3;
          continue;
        }
        const m = /^<\/\s*([A-Za-z][\w:.-]*)\s*>/.exec(source.slice(i));
        if (m) {
          // Pop for BOTH intrinsic and component close tags (components are
          // tracked on the stack for balance) — only report intrinsic ones.
          const name = m[1];
          const top = stack.pop();
          if (!top) {
            if (/^[a-z]/.test(name)) report(i, "stray-close", `</${name}> with no open element`);
          } else if (top.name !== name) {
            report(i, "mismatched-close", `</${name}> does not close <${top.name}> — unbalanced JSX`);
          }
          i += m[0].length;
          continue;
        }
      } else if (next === ">") {
        stack.push({ name: "", index: i }); // fragment <></>
        i += 2;
        continue;
      } else if (/[A-Za-z]/.test(next ?? "")) {
        const open = parseOpenTag(source, i);
        if (open) {
          i = open.end;
          // Self-closing intrinsic tags still get the ancestor checks (an
          // <input/> inside a <button> is just as invalid) but aren't pushed.
          if (open.selfClosing) {
            if (/^[a-z]/.test(open.name)) checkPush(open.name, open.start, report, stack, true);
            continue;
          }
          if (/^[a-z]/.test(open.name)) checkPush(open.name, open.start, report, stack);
          else stack.push({ name: open.name, index: open.start }); // component: balance only
          continue;
        }
      }
    }
    i += 1;
  }

  for (const el of stack) {
    report(el.index, "unclosed", el.name ? `<${el.name}> is never closed` : "fragment <> is never closed");
  }
  return findings;
}

/* ──────────────────────────────── main ─────────────────────────────────── */

async function listTsxFiles(dir) {
  const out = [];
  for (const rel of await readdir(dir, { recursive: true })) {
    if (typeof rel === "string" && rel.endsWith(".tsx")) out.push(path.join(dir, rel));
  }
  return out.sort();
}

const target = path.join(ROOT, TARGET_DIR);
const files = await listTsxFiles(target);
let total = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const findings = scanSource(source);
  if (findings.length === 0) continue;
  total += findings.length;
  const rel = path.relative(ROOT, file);
  console.log(`\n❌ ${rel}`);
  for (const f of findings) {
    console.log(`   ${String(f.line).padStart(4)}:${String(f.col).padEnd(3)} [${f.rule}] ${f.message}`);
    if (f.lineText) console.log(`        ${f.lineText.slice(0, 90)}`);
  }
}

if (total === 0) {
  console.log(`✅ clean — no invalid nesting found in ${files.length} .tsx files under ${TARGET_DIR}/`);
} else {
  console.log(`\n${total} potential invalid-nesting finding(s) in ${files.length} .tsx files. Review each before shipping.`);
}
process.exit(total > 0 ? 1 : 0);
