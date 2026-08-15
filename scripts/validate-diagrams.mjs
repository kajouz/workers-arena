#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────────────
 * VALIDATE DIAGRAMS — render every mermaid block in docs/ with mermaid-cli
 * ────────────────────────────────────────────────────────────────────────────
 * Usage:  npm run validate:diagrams            (all markdown under docs/ + the root README)
 *         node scripts/validate-diagrams.mjs <file-or-dir>...   (custom set; dirs are walked)
 *         node scripts/validate-diagrams.mjs --emit            (also write SVGs into docs/diagrams/)
 *
 * Extracts every ```mermaid code block from the target markdown files (the
 * default scan covers docs/ recursively plus the repo-root README.md) and
 * renders each one to a throwaway SVG with @mermaid-js/mermaid-cli (mmdc).
 * Exit code is non-zero if any render fails — a diagram that parses in one
 * renderer but breaks another (or a syntax regression from a docs edit) is
 * caught here instead of shipping silently.
 *
 * With --emit, each successful render is ALSO copied to docs/diagrams/ under
 * the deterministic name docs/README.md embeds (see EMIT_NAMES below), so one
 * command both validates the diagrams and regenerates the pre-rendered images.
 *
 * Chrome resolution mirrors src/lib/data/booking-pdf.ts (resolveChromeExecutable):
 * PUPPETEER_EXECUTABLE_PATH wins, then the usual macOS/Linux/Windows paths. The
 * env var is exported for the mmdc child only if not already set, so a local
 * PUPPETEER_EXECUTABLE_PATH override still wins. mmdc uses puppeteer; without a
 * reachable Chrome it fails loudly with its own error, which we surface.
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "docs");
const DIAGRAMS_DIR = path.join(DOCS_DIR, "diagrams");
const ROOT_README = path.join(ROOT, "README.md");
const MMDC = path.join(ROOT, "node_modules", ".bin", "mmdc");

/** Deterministic SVG names for the diagrams docs/README.md embeds, keyed by
 * (doc filename, block index). Unknown files fall back to <basename>-<n>.svg
 * so the emitter never silently overwrites an embedded image with a name it
 * didn't expect. */
const EMIT_NAMES = {
  "INTERACTION-WORKFLOWS.md": [
    "1-1-user-to-worker",
    "1-2-worker-to-user",
    "2-1-admin-to-user",
    "2-2-user-to-admin",
    "3-1-admin-to-worker",
    "3-2-worker-to-admin",
    "4-1-admin-to-company",
    "4-2-company-to-admin",
  ],
  "selection-workflow.md": ["selection-workflow"],
  "multi-candidate-quotes.md": ["multi-candidate-quotes"],
};

function emitNameFor(file, index) {
  const base = path.basename(file);
  const stem = EMIT_NAMES[base]?.[index] ?? `${base.replace(/\.md$/, "")}-${index + 1}`;
  return `${stem}.svg`;
}

/** First existing Chrome/Chromium executable, or null (same candidates as
 * src/lib/data/booking-pdf.ts). */
function resolveChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p)) ?? null;
}

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

/** Pull the ```mermaid blocks (with content) out of a markdown file. */
function mermaidBlocks(md) {
  const blocks = [];
  const re = /```mermaid\s*\n([\s\S]*?)\n?```/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    const content = m[1].trimEnd();
    if (content.trim().length > 0) blocks.push(content);
  }
  return blocks;
}

/** Render one diagram; returns { ok, emitted, error }. When emitPath is set,
 * a successful render is copied there (docs/diagrams/ regeneration). */
function renderDiagram(block, workDir, chrome, emitPath = null) {
  const inFile = path.join(workDir, `diagram-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mmd`);
  const outFile = `${inFile}.svg`;
  writeFileSync(inFile, `${block}\n`, "utf8");
  try {
    const env = { ...process.env };
    if (chrome && !process.env.PUPPETEER_EXECUTABLE_PATH) env.PUPPETEER_EXECUTABLE_PATH = chrome;
    execFileSync(MMDC, ["-i", inFile, "-o", outFile], { env, stdio: ["ignore", "ignore", "pipe"] });
    if (!existsSync(outFile)) return { ok: false, error: "mmdc exited 0 but produced no output file" };
    if (emitPath) copyFileSync(outFile, emitPath);
    return { ok: true, emitted: emitPath };
  } catch (err) {
    // execFileSync throws with stderr on non-zero exit — mmdc's parser errors.
    const detail = (err.stderr ?? "").toString().trim().split("\n").slice(0, 8).join("\n");
    return { ok: false, error: detail || String(err.message) };
  } finally {
    rmSync(inFile, { force: true });
    rmSync(outFile, { force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const emit = args.includes("--emit");
  const fileArgs = args.filter((a) => a !== "--emit");
  let targets = fileArgs;
  if (targets.length === 0) {
    // docs/ recursive + the root README (mirrors check:docs-links so both
    // doc-integrity checks scan the same surface).
    targets = [...markdownFilesUnder(DOCS_DIR), ROOT_README];
  } else {
    // A directory arg is walked recursively; a file arg is taken as-is.
    const expanded = [];
    for (const t of fileArgs) {
      const abs = path.isAbsolute(t) ? t : path.join(process.cwd(), t);
      if (existsSync(abs) && statSync(abs).isDirectory()) expanded.push(...markdownFilesUnder(abs));
      else expanded.push(abs);
    }
    targets = expanded;
  }
  const mdFiles = targets.filter((f) => f.endsWith(".md") && existsSync(f));
  if (mdFiles.length === 0) {
    console.error(`validate:diagrams — no markdown files matched: ${targets.join(", ")}`);
    process.exit(2);
  }

  const chrome = resolveChromeExecutable();
  if (!chrome) {
    console.error(
      "validate:diagrams — no Chrome/Chromium executable found. Set PUPPETEER_EXECUTABLE_PATH " +
        "(see src/lib/data/booking-pdf.ts resolveChromeExecutable)."
    );
    process.exit(2);
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "wa-diagrams-"));
  let total = 0;
  let emitted = 0;
  const failures = [];
  try {
    for (const file of mdFiles) {
      const md = readFileSync(file, "utf8");
      const blocks = mermaidBlocks(md);
      if (blocks.length === 0) continue;
      // Emission target: docs files regenerate docs/diagrams/ (what the index
      // embeds); external files write next to themselves so --emit never leaks
      // into the repo's diagrams dir.
      const emitDir = path.resolve(file).startsWith(path.resolve(DOCS_DIR)) ? DIAGRAMS_DIR : path.dirname(file);
      if (emit) mkdirSync(emitDir, { recursive: true });
      for (let i = 0; i < blocks.length; i++) {
        total += 1;
        const label = `${path.relative(ROOT, file)} #${i + 1}`;
        const emitPath = emit ? path.join(emitDir, emitNameFor(file, i)) : null;
        const res = renderDiagram(blocks[i], workDir, chrome, emitPath);
        if (res.ok) {
          console.log(`✓  ${label}${res.emitted ? ` → ${path.relative(ROOT, res.emitted)}` : ""}`);
          if (res.emitted) emitted += 1;
        } else {
          console.error(`✗  ${label}`);
          console.error(res.error.split("\n").map((l) => `    ${l}`).join("\n"));
          failures.push(label);
        }
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  if (failures.length > 0) {
    console.error(`\nvalidate:diagrams — ${failures.length}/${total} diagram(s) failed to render:`);
    for (const f of failures) console.error(`  • ${f}`);
    process.exit(1);
  }
  const emittedNote = emit ? ` and emitted ${emitted} SVG(s)` : "";
  console.log(`\nvalidate:diagrams — all ${total} diagram(s) rendered successfully${emittedNote}.`);
}

main();
