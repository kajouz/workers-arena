/**
 * ─────────────────────────────────────────────────────────────────────────────
 * IGNORE-FILE GUARD — no ignore file may hide source the app needs
 * ─────────────────────────────────────────────────────────────────────────────
 * An ignore pattern is invisible until it costs you a deployment. This has
 * already happened twice, from one unanchored name:
 *
 *   • `.gitignore` line `backups/` matched src/app/[locale]/(app)/admin/
 *     backups/ — the admin route was never committed, so CI's fresh checkout
 *     served Next's default 404 for /en/admin/backups. Locally it worked, which
 *     is what made it expensive.
 *   • `.vercelignore`'s unanchored `backups` matched the same directory, so the
 *     Vercel CLI never uploaded it: the deploy succeeded while production
 *     answered 404. A local `next build` never consults `.vercelignore`, so the
 *     pre-deploy build passing proved nothing.
 *
 * Both are fixed by root-anchoring, but "remember to anchor" is not a control.
 * So this test EVALUATES each ignore file against the paths the app needs
 * (gitignore semantics: order matters, `!` re-includes, a pattern without a
 * slash matches at any depth — which is the exact trap) and fails listing what
 * would be ignored. It is deliberately path-based rather than a pattern-shape
 * heuristic: `backups/` and `/backups/` are both "just a name", and only the
 * evaluator knows which paths each one actually claims.
 *
 * Guards against the guard being vacuous: `evaluator semantics` below pins the
 * matcher itself on the historical cases before it is trusted to judge the real
 * files.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Directories whose contents must survive every build, commit and upload. */
const CRITICAL_DIRS = ["src", "public", "prisma", "scripts"];

/**
 * Paths under a critical directory that are NOT app source, and are therefore
 * supposed to be ignored. Everything else that exists on disk counts as source:
 * the historic bug hid an UNCOMMITTED route, so "is it tracked by git?" is the
 * wrong question (an ignored file is precisely the one that never got tracked).
 *
 * This list is the guard's whole judgment call, so it stays small, explicit and
 * limited to files no build artifact or checkout needs.
 */
const JUNK = [
  /\.DS_Store$/, // macOS Finder metadata
  /^\._/, // macOS resource forks
  /Thumbs\.db$/,
  /\.swp$/, // vim swap
  /~$/, // editor backups
  /\.orig$/,
  /\.rej$/,
  /\.log$/,
  /\.tmp$/,
  /\.tsbuildinfo$/,
  /(^|\/)\.env(\..*)?$/, // secrets belong in .env files anywhere, never in a build
];

function isJunk(relPath: string): boolean {
  return JUNK.some((re) => re.test(relPath));
}

/** Root-level files a build/deploy reads. */
const CRITICAL_ROOT_FILES = [
  "package.json",
  "next.config.ts",
  "next.config.mjs",
  "next.config.js",
  "tsconfig.json",
  "vercel.json",
  "proxy.ts",
  "middleware.ts",
];

/** Extra paths each ignore file must not hide, on top of the shared set. */
const EXTRA_CRITICAL: Record<string, string[]> = {
  // CI runs from the committed tree — a broad `.github`/`workflows` pattern
  // silently disables every workflow.
  ".gitignore": [".github/workflows"],
  // Deliberately empty for `.vercelignore`: it excludes /.github on purpose
  // (workflows are not needed in an upload) — an assertion here would fight the
  // file's intended behavior rather than protect anything.
  ".vercelignore": [],
};

/** Ignore files that can affect a commit, a container build or a deploy. */
const IGNORE_FILES = [".gitignore", ".vercelignore", ".dockerignore", ".npmignore"];

// ── gitignore semantics (the subset that matters here) ──────────────────────

interface Rule {
  /** The pattern as written, for error messages. */
  raw: string;
  /** 1-based line number in the ignore file. */
  line: number;
  /** `!pattern` re-includes, overriding earlier matches. */
  negated: boolean;
  /** `pattern/` matches directories only. */
  dirOnly: boolean;
  /** No slash in the body → matches at ANY depth (the trap). */
  unanchored: boolean;
  /** Body compiled to a regex matched against a single path or dir prefix. */
  test: (candidate: string) => boolean;
}

function globBody(glob: string): string {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else if (ch === "?") {
      out += "[^/]";
    } else {
      // Escape everything else — `.`, `+`, parens and the `[`/`]` in a route
      // segment like `[locale]` must be literal.
      out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return out;
}

function parseRule(rawLine: string, line: number): Rule | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  const negated = trimmed.startsWith("!");
  let body = negated ? trimmed.slice(1) : trimmed;
  const dirOnly = body.endsWith("/");
  body = body.replace(/\/+$/, "");
  // A leading slash anchors to the ignore file's directory; so does any slash
  // before the end (`app/admin/backups`), per gitignore.
  const anchored = body.startsWith("/") || body.includes("/");
  body = body.replace(/^\/+/, "");
  if (!body) return null;

  const compiled = globBody(body);
  // Anchored: the pattern starts at the tree root we were given. Unanchored:
  // it may start at any path boundary.
  const re = new RegExp(anchored ? `^${compiled}$` : `(?:^|/)${compiled}$`);
  return { raw: trimmed, line, negated, dirOnly, unanchored: !anchored, test: (c) => re.test(c) };
}

/** Every ancestor directory of a path, outermost first, excluding itself. */
function ancestorsOf(relPath: string): string[] {
  const parts = relPath.split("/");
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

/**
 * Is `relPath` ignored? Order matters: the LAST matching pattern wins, so a
 * `!` re-include after a broad pattern is honored (that pairing is how
 * `.vercelignore` keeps README.md while excluding *.md).
 */
function isIgnored(relPath: string, rules: Rule[]): Rule | null {
  let last: Rule | null = null;
  for (const rule of rules) {
    // A pattern matching a directory ignores everything inside it, so the path
    // itself and each ancestor are all candidates.
    const candidates = [...ancestorsOf(relPath), relPath];
    if (candidates.some((c) => rule.test(c))) last = rule;
  }
  return last && !last.negated ? last : null;
}

// ── The paths that must survive ─────────────────────────────────────────────

function walk(relDir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, relDir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(rel);
      walk(rel, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function criticalPaths(extra: string[]): string[] {
  const paths = new Set<string>();
  for (const dir of CRITICAL_DIRS) for (const p of walk(dir)) paths.add(p);
  for (const file of CRITICAL_ROOT_FILES) if (existsSync(path.join(ROOT, file))) paths.add(file);
  for (const extraPath of extra) for (const p of walk(extraPath)) paths.add(p);
  return [...paths].filter((p) => !isJunk(p));
}

function rulesIn(file: string): Rule[] {
  const text = readFileSync(path.join(ROOT, file), "utf8");
  return text
    .split("\n")
    .map((line, i) => parseRule(line, i + 1))
    .filter((r): r is Rule => r !== null);
}

// ── The matcher, pinned before it is trusted ────────────────────────────────

describe("evaluator semantics", () => {
  const rules = (text: string) =>
    text
      .split("\n")
      .map((line, i) => parseRule(line, i + 1))
      .filter((r): r is Rule => r !== null);

  it("an UNANCHORED name matches at any depth (the historic bug)", () => {
    const r = rules("backups/");
    expect(isIgnored("src/app/[locale]/(app)/admin/backups/page.tsx", r)).not.toBeNull();
  });

  it("a root-anchored name does not reach into the tree (the fix)", () => {
    const r = rules("/backups/");
    expect(isIgnored("src/app/[locale]/(app)/admin/backups/page.tsx", r)).toBeNull();
    expect(isIgnored("backups/dump.sql", r)).not.toBeNull();
  });

  it("treats [locale] as literal, not a character class", () => {
    const r = rules("/src/app/[locale]/page.tsx");
    expect(isIgnored("src/app/[locale]/page.tsx", r)).not.toBeNull();
    expect(isIgnored("src/app/l/page.tsx", r)).toBeNull();
  });

  it("honors a negation that follows a broad pattern", () => {
    const r = rules("*.md\n!README.md");
    expect(isIgnored("docs/a.md", r)).not.toBeNull();
    expect(isIgnored("README.md", r)).toBeNull();
  });

  it("ignores everything under a directory it matches", () => {
    const r = rules("/docs");
    expect(isIgnored("docs/nested/deep/file.md", r)).not.toBeNull();
  });
});

// ── The guard itself ────────────────────────────────────────────────────────

describe("ignore files cannot hide source", () => {
  const present = IGNORE_FILES.filter((f) => existsSync(path.join(ROOT, f)));

  it("has at least one build-relevant ignore file to check", () => {
    // A vacuous guard is worse than none: if the files move, fail loudly.
    expect(present.length, `none of ${IGNORE_FILES.join(", ")} exist — this guard would check nothing`).toBeGreaterThan(0);
  });

  for (const file of present) {
    it(`${file} keeps every path the app needs`, () => {
      const rules = rulesIn(file);
      const offenders = criticalPaths(EXTRA_CRITICAL[file] ?? [])
        .map((relPath) => ({ relPath, rule: isIgnored(relPath, rules) }))
        .filter((o): o is { relPath: string; rule: Rule } => o.rule !== null);

      const detail = offenders
        .slice(0, 12)
        .map((o) => {
          const head = `  ${o.relPath}\n    hidden by line ${o.rule.line}: "${o.rule.raw}"`;
          if (!o.rule.unanchored) return head;
          // The remedy differs by what got hidden: a nested path means the
          // pattern reached too far (anchor it); a root-level one means the
          // pattern should not exist at all — anchoring just makes the damage
          // explicit.
          return o.relPath.includes("/")
            ? `${head}\n    → an UNANCHORED pattern matches a directory of that name at any depth. If this names a project-root directory, anchor it: "/${o.rule.raw.replace(/^!/, "")}"`
            : `${head}\n    → this is a ROOT-level path the build reads; it must not be ignored at all.`;
        })
        .join("\n");

      expect(
        offenders.length,
        offenders.length === 0
          ? ""
          : `${file} ignores ${offenders.length} path(s) the app needs at build/deploy time:\n${detail}\n\n` +
            `This is the failure mode that 404'd /en/admin/backups in production twice (once via .gitignore, once via .vercelignore) while local builds stayed green.`
      ).toBe(0);
    });
  }
});
