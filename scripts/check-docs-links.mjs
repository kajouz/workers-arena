#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────────────
 * CHECK DOCS LINKS — verify every markdown link + image in docs/ resolves
 * ────────────────────────────────────────────────────────────────────────────
 * Usage:  npm run check:docs-links             (all markdown under docs/ + the root README)
 *         node scripts/check-docs-links.mjs <file-or-dir>...   (custom set; dirs are walked)
 *
 * For every .md file under the target (plus the repo-root README.md, whose
 * docs/ links are the navigation entry point) it extracts:
 *   • markdown links          [text](target)
 *   • markdown images         ![alt](target)
 *   • HTML <img src="...">    (the pre-rendered SVG embeds in docs/README.md)
 * and resolves each target:
 *   • relative paths — must exist on disk, relative to the linking doc's dir
 *   • same-file anchors (#…) — must match a heading slug in the same file
 *   • file.md#anchor — must exist AND the anchor must match a heading slug
 *   • http(s):// and mailto: — skipped (external; can't verify offline)
 *
 * Exit code is non-zero if any link is broken — the same fail-fast contract as
 * scripts/validate-diagrams.mjs, so docs edits can't silently rot.
 *
 * Anchor slugs follow GitHub's algorithm (what github-slugger produces):
 * lowercase, drop punctuation, spaces → hyphens (one per space, no collapsing,
 * so "A & B" is a--b). A heading "## 7. Keep fresh" gets slug 7-keep-fresh —
 * so a link to #-keep-fresh is genuinely broken.
 *
 * Fenced code blocks (```…```) are skipped: sample markup inside them is not a
 * clickable link. Inline code spans (`…`) are blanked for the same reason — a
 * doc that explains this checker quotes the placeholder it excludes, e.g. the
 * tracking pixel `<img src="/api/ads/{id}/impression">`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "docs");
const ROOT_README = path.join(ROOT, "README.md");

/** Recursively collect every .md file under a directory (top-level + nested). */
function markdownFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFilesUnder(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/**
 * GitHub-style slug for a heading line ("## 7. Keep fresh" → "7-keep-fresh").
 *
 * The two steps below are ORDER-SENSITIVE and the space step must map EACH
 * space to its own hyphen — GitHub does not collapse runs. Punctuation is
 * deleted first, so a separator surrounded by spaces leaves two spaces behind
 * and the slug keeps a DOUBLE hyphen:
 *
 *   "## 2. Authentication & Authorization Testing" → 2-authentication--authorization-testing
 *   "## 7. Dashboard Testing — Worker"            → 7-dashboard-testing--worker
 *
 * Collapsing `\s+` to a single hyphen made every `&` / " — " heading in docs/
 * look broken, even though GitHub resolves the `--` anchors the tables of
 * contents actually use (18 false failures on this repo).
 */
function headingSlug(line) {
  const text = line.replace(/^#+\s*/, "").trim().toLowerCase();
  return (
    text
      // Drop everything that isn't a letter, digit, space, or hyphen.
      .replace(/[^\p{L}\p{N} -]/gu, "")
      // Each space → one hyphen (see the note above: no run collapsing). The
      // trim() above keeps leading/trailing spaces from adding hyphens.
      .replace(/ /g, "-")
  );
}

/** The set of heading slugs in a markdown file (for anchor checks). */
function headingSlugs(md) {
  const slugs = new Set();
  for (const line of md.split("\n")) {
    if (/^#{1,6}\s/.test(line)) slugs.add(headingSlug(line));
  }
  return slugs;
}

/**
 * Blank out inline code spans (`…`, ``…``) so markup quoted inside them is not
 * read as a link. Inline code is not clickable on GitHub either, and a doc that
 * explains this checker naturally quotes the placeholder it excludes.
 *
 * A run of N backticks is closed by the next run of exactly N (CommonMark). The
 * span is replaced character-for-character with spaces so column arithmetic and
 * line numbers stay intact. An unterminated run — like "```html" written
 * mid-sentence — is not a code span and is kept verbatim.
 */
function stripInlineCode(line) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line[i] !== "`") {
      out += line[i];
      i += 1;
      continue;
    }
    let run = 0;
    while (line[i + run] === "`") run += 1;
    const close = line.indexOf("`".repeat(run), i + run);
    if (close === -1) {
      out += line.slice(i);
      break;
    }
    out += " ".repeat(close + run - i);
    i = close + run;
  }
  return out;
}

/**
 * Extract { target, line, kind } for every link/image in a file: markdown
 * links, markdown images, and HTML <img src>. Returns [] for unreadable files.
 *
 * Fenced code blocks and inline code spans are skipped: an example in ```html /
 * ```js, or quoted as `code`, is sample markup, not a link. Docs routinely show
 * placeholder URLs that way (e.g. the digest tracking pixel
 * `<img src="/api/ads/{id}/impression">`, whose real route is
 * `/api/ads/[id]/impression`) — resolving those reports broken links that no
 * reader can click.
 */
function extractLinks(md) {
  const links = [];
  const lines = md.split("\n");
  const push = (rawTarget, line, kind) => {
    // Strip surrounding quotes/whitespace and trailing title in (target "title").
    let t = rawTarget.trim();
    t = t.replace(/^["']/, "").replace(/["']\s*$/, "");
    t = t.split(/\s+(?=["'])/)[0]; // drop "title" suffix if present
    t = t.trim();
    if (t.length > 0) links.push({ target: t, line, kind });
  };

  // The open fence's marker character (` or ~), or null outside a fence.
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(l);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      // Only the SAME marker closes the block; a different one is content.
      if (fence === null) fence = marker;
      else if (marker === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const text = stripInlineCode(l);
    // Markdown links + images: ![alt](target) or [text](target) — handle the
    // ! separately so image links are labeled, then the plain [..](..).
    for (const m of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) push(m[1], i + 1, "image");
    for (const m of text.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) push(m[1], i + 1, "link");
    // HTML <img src="..."> — the pre-rendered SVG embeds.
    for (const m of text.matchAll(/<img[^>]*\bsrc="([^"]+)"/g)) push(m[1], i + 1, "image");
  }
  return links;
}

/** Is the target external and therefore skipped? */
function isExternal(target) {
  return /^(https?:|mailto:|tel:|data:)/.test(target);
}

/** Split "file.md#anchor" into [file, anchor]; "#anchor" alone → ["", anchor]. */
function splitAnchor(target) {
  const hash = target.indexOf("#");
  if (hash === -1) return [target, null];
  return [target.slice(0, hash), target.slice(hash + 1)];
}

function main() {
  const args = process.argv.slice(2);
  let targets = args;
  if (targets.length === 0) {
    // docs/ recursive + the root README (its docs/ links close the loop).
    targets = [...markdownFilesUnder(DOCS_DIR), ROOT_README];
  } else {
    const expanded = [];
    for (const t of args) {
      const abs = path.isAbsolute(t) ? t : path.join(process.cwd(), t);
      if (existsSync(abs) && statSync(abs).isDirectory()) expanded.push(...markdownFilesUnder(abs));
      else expanded.push(abs);
    }
    targets = expanded;
  }
  const mdFiles = targets.filter((f) => f.endsWith(".md") && existsSync(f));
  if (mdFiles.length === 0) {
    console.error(`check:docs-links — no markdown files matched: ${targets.join(", ")}`);
    process.exit(2);
  }

  let checked = 0;
  let skipped = 0;
  const failures = [];
  for (const file of mdFiles) {
    const dir = path.dirname(file);
    const md = readFileSync(file, "utf8");
    const slugs = headingSlugs(md);
    for (const { target, line, kind } of extractLinks(md)) {
      if (isExternal(target)) {
        skipped += 1;
        continue;
      }
      checked += 1;
      const [filePart, anchor] = splitAnchor(target);
      if (filePart === "") {
        // Same-file anchor.
        if (anchor && !slugs.has(anchor)) {
          failures.push(`${path.relative(ROOT, file)}:${line} — #${anchor} (no such heading)`);
        }
        continue;
      }
      const resolved = path.resolve(dir, filePart);
      if (!existsSync(resolved) || statSync(resolved).isDirectory()) {
        failures.push(`${path.relative(ROOT, file)}:${line} — ${target} (no such file)`);
        continue;
      }
      if (anchor && resolved.endsWith(".md")) {
        const targetSlugs = headingSlugs(readFileSync(resolved, "utf8"));
        if (!targetSlugs.has(anchor)) {
          failures.push(`${path.relative(ROOT, file)}:${line} — ${target} (file exists, but no #${anchor} heading)`);
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`check:docs-links — ${failures.length} broken link(s) (${checked} checked, ${skipped} external skipped):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`check:docs-links — all ${checked} link(s) resolve (${skipped} external skipped).`);
}

export { extractLinks, headingSlug, headingSlugs, isExternal, splitAnchor, stripInlineCode };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
