#!/usr/bin/env node
/**
 * check-scripts.mjs — make scripts/ fail loudly instead of silently
 *
 * Why this exists: `eslint.config` ignores `scripts/**`, nothing parsed them,
 * and CI invoked one of them as `node scripts/… || true`. So
 * `scripts/strip-tsconfig-dist-entries.mjs` shipped with a syntax error that made
 * it a no-op on every invocation — for its entire life — and no pipeline step
 * could tell. This gate closes that class:
 *
 *   1. Every executable under scripts/ must PARSE.
 *      - `.mjs` / `.js` / `.cjs` → `node --check`
 *      - `.ts`                  → the TypeScript parser (syntax only — the seed and
 *                                 smoke scripts talk to a real database, so they are
 *                                 never executed here)
 *      - `.sh`, and extensionless files with a shebang → `sh -n`
 *
 *   2. Every import the script can reach must RESOLVE — not just its own.
 *      - relative and tsconfig-aliased specifiers (`@/…`) are resolved against the
 *        filesystem, with extension and `index.*` candidates
 *      - the LOCAL import graph is walked transitively, so deleting or renaming a
 *        module deep in `src/` fails the script that imports it (the "it parses but
 *        cannot be loaded" class) at the moment of the change, not at 02:30 in a
 *        nightly job
 *      - bare specifiers must be a node builtin or a package DECLARED in
 *        package.json. A package that only resolves because npm hoisted it out of a
 *        transitive dependency is reported as a warning: it works today and breaks
 *        on any dependency change, which is a defect worth seeing. (Declared-ness is
 *        checked for scripts/ only — a helper import in `src/` is the app's business,
 *        not this gate's.)
 *
 *   3. Scripts that use the import-safe main-guard pattern
 *      (`if (import.meta.url === pathToFileURL(process.argv[1]).href)`) are
 *      actually IMPORTED in a child process, because that is the only way to catch
 *      a module that parses but throws when loaded. Scripts without the guard are
 *      parsed only — importing a script that acts on import (seeding a database,
 *      posting a webhook) is not a check, it is a side effect, and the report says
 *      which is which so nobody assumes otherwise.
 *
 * Usage:  node scripts/check-scripts.mjs        (exit 1 on any error)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SCRIPTS_DIR = path.join(ROOT, "scripts");

/** Bare names that are always available, with or without the `node:` prefix. */
export const NODE_BUILTINS = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  "node:test",
  "node:test/reporters",
]);

/**
 * Extensions a specifier without one may resolve to. Assets are included on
 * purpose: `import "./globals.css"` is a real import that must resolve, and
 * treating it as missing would make the transitive walk cry wolf.
 */
export const PROBE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".svg",
  ".png",
  ".jpg",
  ".webp",
  ".md",
  ".txt",
  ".sql",
  ".prisma",
];

/** Extensions the transitive walk will read and follow. */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);

/** How many modules one script's local graph may pull in before we stop walking. */
export const GRAPH_LIMIT = 2000;

/**
 * One tsconfig path alias: either a wildcard prefix or an exact name, each with
 * the absolute directories it may point into.
 *
 * @typedef {{ kind: "wildcard" | "exact", prefix?: string, name?: string, targets: string[] }} Alias
 */

/** How a file under scripts/ is supposed to be parsed. */
export function scriptKind(file) {
  const ext = path.extname(file).toLowerCase();
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "js";
  if (SOURCE_EXTENSIONS.has(ext)) return "ts";
  if (ext === ".sh" || ext === ".bash") return "sh";
  if (ext === "") {
    // Extensionless: the shebang decides. Anything else is data, not a script.
    try {
      const first = readFileSync(file, "utf8").split("\n", 1)[0] ?? "";
      if (/^#!.*\b(sh|bash)\b/.test(first)) return "sh";
      if (/^#!.*\bnode\b/.test(first)) return "js";
    } catch {
      return null;
    }
  }
  return null;
}

/** Every file under scripts/, recursively, that looks like an executable. */
export function discoverScripts(dir = SCRIPTS_DIR) {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current).sort()) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const full = path.join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}

/**
 * The static specifiers a source file depends on: `import … from "x"`,
 * `export … from "x"`, `import("x")` and `require("x")`.
 *
 * Line-based on purpose — a full parser is not needed to answer "does this path
 * still exist?", and lines that start a comment are skipped so a specifier quoted
 * in prose is not mistaken for a dependency. A template-literal specifier
 * (`` import(`./x/${y}`) ``) is deliberately not matched: it cannot be resolved
 * statically, and guessing would produce false failures.
 *
 * Side-effect imports (`import "./globals.css";`, no `from`) are included: they are
 * real dependencies, and missing them would understate every graph this walks.
 */
export function staticSpecifiers(source) {
  const found = new Set();
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const line of source.split("\n")) {
    if (/^\s*(\*|\/\/)/.test(line)) continue;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        if (match[1]) found.add(match[1]);
      }
    }
  }
  return [...found];
}

/** The package a bare specifier belongs to (`@scope/pkg/sub` → `@scope/pkg`). */
export function packageName(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** True when the path is an existing FILE (a directory is not a module). */
export function isFile(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** True when the path is an existing directory (used for installed packages). */
export function isDir(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Resolve a relative specifier against the filesystem, the way Node/tsc would:
 * the literal path, then each known extension, then `index.<ext>`.
 *
 * `exists` is injectable so the resolution rules are testable without fixtures.
 */
export function resolveRelative(fromFile, specifier, exists = isFile) {
  return probePath(path.resolve(path.dirname(fromFile), specifier), exists);
}

/**
 * The first candidate that exists for a base path, or null.
 *
 * Directories never count: `./lib` must resolve to `lib/index.ts`, not to the
 * directory itself — an earlier version returned the directory, which silently
 * stopped every transitive walk one level in.
 */
export function probePath(base, exists = isFile) {
  const candidates = [base, ...PROBE_EXTENSIONS.map((ext) => base + ext)];
  for (const ext of PROBE_EXTENSIONS) candidates.push(path.join(base, `index${ext}`));
  return candidates.find((candidate) => exists(candidate)) ?? null;
}

/**
 * tsconfig `compilerOptions.paths` as resolvable aliases.
 *
 * The repo maps `@/*` → `./src/*`, and every script that wants to reuse app code
 * is expected to use it. Without this, `@/lib/…` looks like an undeclared npm
 * package (`@lib`), which would fail the gate for the wrong reason.
 *
 * @param {{ compilerOptions?: { baseUrl?: string, paths?: Record<string, string[]> } }} [tsconfig]
 * @param {string} [root]
 * @returns {Alias[]}
 */
export function tsconfigAliases(tsconfig = {}, root = ROOT) {
  const options = tsconfig?.compilerOptions ?? {};
  const baseUrl = path.resolve(root, options.baseUrl ?? ".");
  /** @type {Alias[]} */
  const aliases = [];
  for (const [pattern, targets] of Object.entries(options.paths ?? {})) {
    if (!Array.isArray(targets) || targets.length === 0) continue;
    const resolved = targets.filter((t) => typeof t === "string").map((t) => path.resolve(baseUrl, t));
    if (resolved.length === 0) continue;
    if (pattern.endsWith("/*")) aliases.push({ kind: "wildcard", prefix: pattern.slice(0, -2), targets: resolved });
    else aliases.push({ kind: "exact", name: pattern, targets: resolved });
  }
  return aliases;
}

/**
 * Resolve a specifier through the alias table, or null when no alias matches.
 *
 * @param {string} specifier
 * @param {Alias[]} aliases
 * @param {(file: string) => boolean} [exists]
 */
export function resolveAlias(specifier, aliases, exists = isFile) {
  for (const alias of aliases) {
    if (alias.kind === "exact") {
      if (specifier === alias.name) return probePathList(alias.targets, exists);
      continue;
    }
    if (!specifier.startsWith(`${alias.prefix}/`)) continue;
    const rest = specifier.slice(alias.prefix.length + 1);
    const targets = alias.targets.map((target) => path.join(target.endsWith("*") ? target.slice(0, -1) : `${target}/`, rest));
    return probePathList(targets, exists);
  }
  return null;
}

function probePathList(targets, exists) {
  for (const target of targets) {
    const hit = probePath(target, exists);
    if (hit) return hit;
  }
  return null;
}

/**
 * How a specifier resolves: `builtin`, `local` (resolved path or null), or `bare`
 * (a package name that belongs in package.json).
 *
 * @param {string} fromFile
 * @param {string} specifier
 * @param {{ aliases?: Alias[], exists?: (file: string) => boolean }} [options]
 */
export function classifySpecifier(fromFile, specifier, { aliases = [], exists = isFile } = {}) {
  if (NODE_BUILTINS.has(specifier)) return { kind: "builtin", resolved: null };
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return { kind: "local", resolved: resolveRelative(fromFile, specifier, exists) };
  }
  if (aliases.length > 0) {
    const aliased = resolveAlias(specifier, aliases, exists);
    // A matching alias whose target is missing is a broken local import, not a
    // package: report it as local so the failure names the file, not an npm scope.
    if (aliased || aliases.some((a) => (a.kind === "exact" ? a.name === specifier : specifier.startsWith(`${a.prefix}/`)))) {
      return { kind: "local", resolved: aliased };
    }
  }
  return { kind: "bare", resolved: null };
}

/**
 * Walk the LOCAL import graph from one entry file.
 *
 * Only local files are followed (never node_modules) and only unresolved local
 * specifiers are collected: the question this answers is "can this script still
 * be loaded?", and a missing module anywhere in its reachable chain answers no.
 *
 * @param {string} entry absolute path to the entry module
 * @param {object} [options]
 * @param {Alias[]} [options.aliases] tsconfig path aliases
 * @param {(file: string) => boolean} [options.exists] file-existence probe
 * @param {number} [options.limit] module cap
 */
export function collectGraph(entry, { aliases = [], exists = isFile, limit = GRAPH_LIMIT } = {}) {
  const visited = new Set();
  const broken = [];
  const queue = [entry];
  let truncated = false;
  while (queue.length > 0) {
    if (visited.size >= limit) {
      truncated = true;
      break;
    }
    const file = queue.shift();
    if (visited.has(file)) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
    visited.add(file);
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const specifier of staticSpecifiers(source)) {
      const classified = classifySpecifier(file, specifier, { aliases, exists });
      if (classified.kind !== "local") continue;
      if (!classified.resolved) {
        broken.push({ from: file, specifier });
        continue;
      }
      if (!visited.has(classified.resolved)) queue.push(classified.resolved);
    }
  }
  return { visited, broken, truncated };
}

/**
 * True when a module guards its side effects behind the "am I the entry point?"
 * check, which is what makes importing it safe.
 */
export function isImportSafe(source) {
  return (
    /import\.meta\.url\s*===\s*pathToFileURL\(\s*process\.argv\[1\]\s*\)\.href/.test(source) ||
    /process\.argv\[1\]\s*&&\s*import\.meta\.url\s*===/.test(source)
  );
}

/** `@import-safe` opts a guarded file in explicitly; `@import-unsafe` opts out. */
export function importProbeDirective(source) {
  if (/@import-unsafe\b/.test(source)) return "unsafe";
  if (/@import-safe\b/.test(source)) return "safe";
  return null;
}

/* ─────────────────────────── the file checks ─────────────────────────── */

/** Parse a single file. Returns an array of problem strings. */
export async function checkSyntax(file, kind) {
  if (kind === "sh") {
    const res = spawnSync("sh", ["-n", file], { encoding: "utf8" });
    if (res.status === 0) return [];
    return [`shell syntax error:\n${(res.stderr || "").trim().split("\n").slice(0, 4).join("\n")}`];
  }
  if (kind === "js") {
    const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (res.status === 0) return [];
    return [`syntax error:\n${(res.stderr || "").trim().split("\n").slice(0, 4).join("\n")}`];
  }
  // TypeScript: parse only. transpileModule reports SYNTACTIC diagnostics and
  // never executes the file (the seed/smoke scripts own a live database).
  const ts = await import("typescript");
  const source = readFileSync(file, "utf8");
  const { diagnostics = [] } = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  return diagnostics
    .filter((d) => d.category === ts.DiagnosticCategory.Error)
    .map((d) => `syntax error: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`);
}

/** Load a module in a child process — the only way to catch a throw at import. */
export function probeImport(file) {
  const res = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(file).href)})`],
    { cwd: ROOT, encoding: "utf8", timeout: 60_000 }
  );
  if (res.status === 0) return [];
  const detail = (res.stderr || res.error?.message || "").trim().split("\n").slice(0, 4).join("\n");
  return [`import failed:\n${detail}`];
}

/** True when npm has the package on disk (hoisted or declared alike). */
export function isInstalled(pkg, root = ROOT) {
  return isDir(path.join(root, "node_modules", pkg));
}

/** Dependencies a script is allowed to import: what package.json declares. */
export function declaredDependencies(pkg) {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
  ]);
}

/** Where a file is, relative to the repo root, for reporting. */
const rel = (file) => path.relative(ROOT, file);

/**
 * Check one script end to end.
 * Returns `{ file, kind, errors, warnings, probed, graph }`.
 *
 * @param {string} file absolute path to the file under test
 * @param {object} [options]
 * @param {Set<string>} options.deps names declared in package.json
 * @param {Alias[]} [options.aliases] tsconfig path aliases
 * @param {string} [options.root] repo root the node_modules probe reads from
 * @param {(file: string) => boolean} [options.exists] file-existence probe
 * @param {(pkg: string) => boolean} [options.installed] package-on-disk probe
 * @param {boolean} [options.probe] whether a main-guarded script may be imported
 */
export async function checkScript(file, { deps, aliases = [], root = ROOT, exists = isFile, installed = (pkg) => isInstalled(pkg, root), probe = true } = {}) {
  const kind = scriptKind(file);
  const errors = [];
  const warnings = [];
  if (!kind) return { file, kind: null, errors, warnings, probed: false, graph: 0 };

  errors.push(...(await checkSyntax(file, kind)));

  const source = readFileSync(file, "utf8");
  if (kind === "js" || kind === "ts") {
    for (const specifier of staticSpecifiers(source)) {
      const classified = classifySpecifier(file, specifier, { aliases, exists });
      if (classified.kind === "builtin") continue;
      if (classified.kind === "local") {
        if (!classified.resolved) errors.push(`unresolved import: "${specifier}"`);
        continue;
      }
      const pkg = packageName(specifier);
      if (!deps.has(pkg)) {
        // Declared-ness is the rule; resolvable-but-undeclared is a warning so a
        // hoisted transitive dependency is visible without blocking the build.
        const message = `package not declared in package.json: "${pkg}"`;
        if (installed(pkg)) warnings.push(`${message} (resolves today only because npm hoisted it)`);
        else errors.push(`${message} (and it is not installed either)`);
      }
    }
  }

  // The reachable local graph: a script that imports src/ which imports a deleted
  // module parses fine and dies at runtime, so the walk is what catches it.
  const graph = kind === "js" || kind === "ts" ? collectGraph(file, { aliases, exists }) : { visited: new Set(), broken: [], truncated: false };
  for (const { from, specifier } of graph.broken) {
    errors.push(`unresolved import: "${specifier}" (reached from ${rel(from)})`);
  }
  if (graph.truncated) {
    warnings.push(`local import graph exceeded ${GRAPH_LIMIT} modules — not fully walked`);
  }

  // Only guarded/opted-in modules are executed: importing a script that acts on
  // import (seeding a database, posting a webhook) is not a check, it is a side
  // effect. The report prints how many were actually loaded.
  const directive = importProbeDirective(source);
  const guarded = isImportSafe(source);
  const probed = probe && kind === "js" && directive !== "unsafe" && (directive === "safe" || guarded);
  if (probed) errors.push(...probeImport(file));

  return { file, kind, errors, warnings, probed, graph: graph.visited.size };
}

/**
 * The tsconfig aliases, or none when tsconfig.json cannot be read.
 *
 * @param {string} [root]
 * @returns {Alias[]}
 */
export function loadAliases(root = ROOT) {
  try {
    return tsconfigAliases(JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8")), root);
  } catch {
    return [];
  }
}

/** Run every check and return the full report. */
export async function runGate({
  dir = SCRIPTS_DIR,
  root = ROOT,
  aliases = loadAliases(root),
  pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")),
} = {}) {
  const deps = declaredDependencies(pkg);
  const files = discoverScripts(dir).filter((file) => scriptKind(file) !== null);
  const results = [];
  for (const file of files) results.push(await checkScript(file, { deps, aliases, root }));
  return { results, checked: files.length, aliases: aliases.length };
}

/* ───────────────────────────────── main ───────────────────────────────── */

async function main() {
  const { results, checked, aliases } = await runGate();

  let errors = 0;
  let warnings = 0;
  let probed = 0;
  let modules = 0;
  for (const result of results) {
    const tag = result.errors.length > 0 ? "✗" : "✓";
    const note = result.probed ? " [import-probed]" : "";
    console.log(`${tag} ${rel(result.file)}${note}`);
    for (const warning of result.warnings) console.log(`    ! ${warning}`);
    for (const error of result.errors) console.log(`    ✗ ${error}`);
    errors += result.errors.length;
    warnings += result.warnings.length;
    if (result.probed) probed += 1;
    modules += result.graph;
  }

  const kinds = results.reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] ?? 0) + 1 }), {});
  console.log(
    `\ncheck:scripts — ${checked} file(s): ${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")}` +
      ` · ${aliases} alias(es) · ${modules} module(s) reached · ${probed} import-probed` +
      ` · ${warnings} warning(s) · ${errors} error(s)`
  );
  if (errors > 0) {
    console.error("\n✗ check:scripts failed — fix the errors above before committing.");
    process.exit(1);
  }
  console.log("✓ every script parses, and everything it imports resolves.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
