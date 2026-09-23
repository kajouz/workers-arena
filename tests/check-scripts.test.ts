import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  GRAPH_LIMIT,
  checkScript,
  checkSyntax,
  classifySpecifier,
  collectGraph,
  declaredDependencies,
  discoverScripts,
  hasBinary,
  importProbeDirective,
  isImportSafe,
  loadAliases,
  packageName,
  resolveAlias,
  runGate,
  scriptKind,
  shellKind,
  staticSpecifiers,
  tsconfigAliases,
} from "../scripts/check-scripts.mjs";

/**
 * `check:scripts` is the gate that would have caught
 * `strip-tsconfig-dist-entries.mjs` — a script that threw `SyntaxError` on every
 * invocation for its entire life while CI ran it as `node scripts/… || true`.
 *
 * The tests below pin the teeth, not the implementation: a syntax error must be
 * reported, an import that no longer exists must be reported (including one that
 * is only reachable through another module), and a package that resolves only
 * because npm hoisted it must be visible without blocking the build.
 */

/** Every fixture lives in its own temp tree so a failure cannot touch the repo. */
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(label: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `check-scripts-${label}-`));
  roots.push(root);
  return root;
}

function write(root: string, rel: string, content: string): string {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
  return file;
}

describe("staticSpecifiers", () => {
  it("finds from/import()/require specifiers", () => {
    const source = [
      'import { a } from "./a";',
      'export { b } from "./b.js";',
      'const c = await import("./c");',
      'const d = require("./d");',
    ].join("\n");
    expect(staticSpecifiers(source).sort()).toEqual(["./a", "./b.js", "./c", "./d"]);
  });

  it("ignores a specifier quoted in a comment but not one on a live line", () => {
    const source = ['// import { x } from "./gone";', ' * import { y } from "./gone-too";', 'import { z } from "./real";'].join("\n");
    expect(staticSpecifiers(source)).toEqual(["./real"]);
  });

  it("does not guess at a template-literal specifier", () => {
    // ``import(`./x/${y}`)`` cannot be resolved statically, so claiming it is
    // broken would be a false failure.
    expect(staticSpecifiers("const m = await import(`./mods/${name}`);")).toEqual([]);
  });
});

describe("packageName", () => {
  it("reduces a specifier to the package that must be declared", () => {
    expect(packageName("next/dist/server")).toBe("next");
    expect(packageName("@scope/pkg/sub/path")).toBe("@scope/pkg");
    expect(packageName("typescript")).toBe("typescript");
  });
});

describe("classifySpecifier", () => {
  const aliases = tsconfigAliases({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, "/repo");

  it("recognises node builtins with and without the node: prefix", () => {
    expect(classifySpecifier("/repo/scripts/a.mjs", "node:fs").kind).toBe("builtin");
    expect(classifySpecifier("/repo/scripts/a.mjs", "fs").kind).toBe("builtin");
  });

  it("resolves a relative path through extension and index candidates", () => {
    const root = fixtureRoot("relative");
    write(root, "lib/util.ts", "export const x = 1;\n");
    write(root, "lib/index.mjs", "export const y = 1;\n");
    const from = write(root, "entry.mjs", "export const z = 1;\n");
    expect(classifySpecifier(from, "./lib/util").resolved).toBe(path.join(root, "lib/util.ts"));
    expect(classifySpecifier(from, "./lib").resolved).toBe(path.join(root, "lib/index.mjs"));
  });

  it("reports a relative path that no longer exists as local-and-unresolved", () => {
    const root = fixtureRoot("missing");
    const from = write(root, "entry.mjs", "export const z = 1;\n");
    const classified = classifySpecifier(from, "./deleted");
    expect(classified.kind).toBe("local");
    expect(classified.resolved).toBeNull();
  });

  it("treats a bare specifier as a package, not a path", () => {
    expect(classifySpecifier("/repo/scripts/a.mjs", "vitest", { aliases }).kind).toBe("bare");
  });

  it("resolves the repo's @/ alias against the filesystem", () => {
    const root = fixtureRoot("alias");
    write(root, "src/lib/data/repo.ts", "export const data = 1;\n");
    const localAliases = tsconfigAliases({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, root);
    const from = write(root, "scripts/seed.mjs", "export const z = 1;\n");
    const classified = classifySpecifier(from, "@/lib/data/repo", { aliases: localAliases });
    expect(classified.kind).toBe("local");
    expect(classified.resolved).toBe(path.join(root, "src/lib/data/repo.ts"));
  });

  it("calls an alias whose target is gone a broken LOCAL import, not a package", () => {
    // Without this, `@/lib/removed` would be read as the npm package `@lib` and
    // reported as "not declared in package.json" — a failure that names the wrong
    // thing and sends the reader the wrong way.
    const root = fixtureRoot("alias-missing");
    const localAliases = tsconfigAliases({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, root);
    const from = write(root, "scripts/seed.mjs", "export const z = 1;\n");
    const classified = classifySpecifier(from, "@/lib/data/removed", { aliases: localAliases });
    expect(classified.kind).toBe("local");
    expect(classified.resolved).toBeNull();
  });
});

describe("resolveAlias", () => {
  it("handles both wildcard and exact patterns", () => {
    const root = fixtureRoot("alias-exact");
    write(root, "src/thing.ts", "export const x = 1;\n");
    write(root, "src/entry.ts", "export const y = 1;\n");
    const aliases = tsconfigAliases(
      { compilerOptions: { paths: { "@/*": ["./src/*"], "@entry": ["./src/entry.ts"] } } },
      root
    );
    expect(resolveAlias("@/thing", aliases)).toBe(path.join(root, "src/thing.ts"));
    expect(resolveAlias("@entry", aliases)).toBe(path.join(root, "src/entry.ts"));
    expect(resolveAlias("@/missing", aliases)).toBeNull();
  });

  it("returns null for a specifier no alias matches", () => {
    const aliases = tsconfigAliases({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, "/repo");
    expect(resolveAlias("react", aliases)).toBeNull();
  });
});

describe("collectGraph", () => {
  it("finds a deleted module that is only reachable through another module", () => {
    // The real defect class: nothing broken in the entry file itself.
    const root = fixtureRoot("chain");
    const entry = write(root, "entry.mjs", 'import "./mid.mjs";\n');
    const mid = write(root, "mid.mjs", 'import "./leaf.mjs";\n');
    write(root, "leaf.mjs", "export const x = 1;\n");

    expect(collectGraph(entry, {}).broken).toEqual([]);
    rmSync(path.join(root, "leaf.mjs"));
    expect(collectGraph(entry, {}).broken).toEqual([{ from: mid, specifier: "./leaf.mjs" }]);
  });

  it("walks alias imports into source trees and never enters node_modules", () => {
    const root = fixtureRoot("alias-graph");
    write(root, "src/lib/data/repo.ts", 'import "./member";\n');
    write(root, "src/lib/data/member.ts", "export const x = 1;\n");
    const aliases = tsconfigAliases({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }, root);
    const entry = write(root, "scripts/seed.mjs", 'import { repo } from "@/lib/data/repo";\n');

    const walked = collectGraph(entry, { aliases });
    expect(walked.broken).toEqual([]);
    expect([...walked.visited].some((file) => file.includes("node_modules"))).toBe(false);
    // Three modules: the script, repo, and the module repo imports.
    expect(walked.visited.size).toBe(3);
  });

  it("terminates on a cycle instead of looping forever", () => {
    const root = fixtureRoot("cycle");
    const a = write(root, "a.mjs", 'import "./b.mjs";\n');
    write(root, "b.mjs", 'import "./a.mjs";\n');
    expect(collectGraph(a, {}).visited.size).toBe(2);
  });

  it("stops at the module cap and says so rather than pretending it finished", () => {
    const root = fixtureRoot("cap");
    for (let i = 0; i < 6; i += 1) write(root, `m${i}.mjs`, `import "./m${i + 1}.mjs";\n`);
    write(root, "m6.mjs", "export const x = 1;\n");
    const walked = collectGraph(path.join(root, "m0.mjs"), { limit: 3 });
    expect(walked.truncated).toBe(true);
    expect(walked.visited.size).toBe(3);
  });
});

describe("syntax checking", () => {
  it("reports a JavaScript syntax error", async () => {
    const root = fixtureRoot("syntax-js");
    const file = write(root, "broken.mjs", "export function f( {\n");
    const problems = await checkSyntax(file, "js");
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain("syntax error");
  });

  it("accepts a valid JavaScript file", async () => {
    const root = fixtureRoot("syntax-ok");
    const file = write(root, "fine.mjs", "export const x = 1;\n");
    expect(await checkSyntax(file, "js")).toEqual([]);
  });

  it("reports a shell syntax error, naming the interpreter that judged it", async () => {
    const root = fixtureRoot("syntax-sh");
    const file = write(root, "broken.sh", 'if [ -z "$x" then\n  echo hi\nfi\n');
    const problems = await checkSyntax(file, "sh");
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/shell syntax error \((dash|sh) -n\)/);
  });

  it("parses a bash script as bash, not as POSIX sh", async () => {
    // The gate's first CI run reported two healthy scripts as broken because it
    // fed every .sh to `sh -n`: backup-db.sh and setup-sentry.sh declare bash and
    // use arrays. Getting this wrong in either direction is a false verdict.
    const root = fixtureRoot("bash-vs-sh");
    const file = write(root, "arr.sh", '#!/usr/bin/env bash\nX=(a b)\necho "${X[0]}"\n');
    expect(await checkSyntax(file, "bash")).toEqual([]);
    if (hasBinary("dash")) {
      // …and the same file really is invalid POSIX, which is why the shebang
      // decides the interpreter rather than the extension.
      expect((await checkSyntax(file, "sh")).length).toBe(1);
    }
  });

  it("reads the interpreter from the shebang", () => {
    const root = fixtureRoot("shell-kind");
    expect(shellKind(write(root, "a.sh", "#!/usr/bin/env bash\n"))).toBe("bash");
    expect(shellKind(write(root, "b.sh", "#!/bin/bash\n"))).toBe("bash");
    expect(shellKind(write(root, "c.sh", "#!/bin/sh\n"))).toBe("sh");
    expect(shellKind(write(root, "d.sh", ""))).toBe("sh");
  });

  it("reports a TypeScript syntax error without executing the file", async () => {
    const root = fixtureRoot("syntax-ts");
    const file = write(root, "broken.ts", "const x: = 1;\n");
    const problems = await checkSyntax(file, "ts");
    expect(problems.length).toBeGreaterThan(0);
    expect(problems[0]).toContain("syntax error");
  });
});

describe("scriptKind and discovery", () => {
  it("classifies by extension and, for extensionless files, by shebang", () => {
    const root = fixtureRoot("kind");
    expect(scriptKind(write(root, "a.mjs", ""))).toBe("js");
    expect(scriptKind(write(root, "a.cjs", ""))).toBe("js");
    expect(scriptKind(write(root, "a.ts", ""))).toBe("ts");
    expect(scriptKind(write(root, "a.sh", ""))).toBe("sh");
    expect(scriptKind(write(root, "bash.sh", "#!/bin/bash\n"))).toBe("bash");
    expect(scriptKind(write(root, "run", "#!/bin/sh\necho hi\n"))).toBe("sh");
    expect(scriptKind(write(root, "run-bash", "#!/usr/bin/env bash\n"))).toBe("bash");
    expect(scriptKind(write(root, "run-node", "#!/usr/bin/env node\n"))).toBe("js");
    // Data is not a script: a README must not be parsed as one.
    expect(scriptKind(write(root, "notes.txt", "hello"))).toBeNull();
    expect(scriptKind(write(root, "no-shebang", "hello"))).toBeNull();
  });

  it("discovery skips dotfiles and node_modules but descends directories", () => {
    const root = fixtureRoot("discover");
    write(root, "a.mjs", "");
    write(root, "nested/b.mjs", "");
    write(root, ".hidden.mjs", "");
    write(root, "node_modules/pkg/c.mjs", "");
    const found = discoverScripts(root).map((file) => path.relative(root, file)).sort();
    expect(found).toEqual(["a.mjs", path.join("nested", "b.mjs")]);
  });
});

describe("checkScript", () => {
  const deps = declaredDependencies({ dependencies: { declared: "1.0.0" } });

  it("warns — but does not fail — for a hoisted, undeclared package", () => {
    // It resolves today through npm hoisting and breaks on any dependency change.
    const root = fixtureRoot("hoisted");
    mkdirSync(path.join(root, "node_modules", "hoisted-pkg"), { recursive: true });
    const file = write(root, "a.mjs", 'import "hoisted-pkg";\n');
    return checkScript(file, { deps, aliases: [], root, probe: false }).then((result) => {
      expect(result.errors).toEqual([]);
      expect(result.warnings.length).toBe(1);
      expect(result.warnings[0]).toContain("hoisted");
    });
  });

  it("fails for an undeclared package that is not installed either", async () => {
    const root = fixtureRoot("absent");
    const file = write(root, "a.mjs", 'import "nowhere-pkg";\n');
    const result = await checkScript(file, { deps, aliases: [], root, probe: false });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("not installed");
  });

  it("accepts a declared package and a builtin", async () => {
    const root = fixtureRoot("declared");
    mkdirSync(path.join(root, "node_modules", "declared"), { recursive: true });
    const file = write(root, "a.mjs", 'import "declared";\nimport "node:fs";\nimport "fs";\n');
    const result = await checkScript(file, { deps, aliases: [], root, probe: false });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("reports the graph size it actually walked", async () => {
    const root = fixtureRoot("graph-size");
    write(root, "leaf.mjs", "export const x = 1;\n");
    const file = write(root, "a.mjs", 'import "./leaf.mjs";\n');
    const result = await checkScript(file, { deps, aliases: [], root, probe: false });
    expect(result.graph).toBe(2);
  });

  it("returns a no-op result for a non-script file", async () => {
    const root = fixtureRoot("non-script");
    const file = write(root, "notes.txt", "hello");
    const result = await checkScript(file, { deps, aliases: [], root, probe: false });
    expect(result.kind).toBeNull();
    expect(result.errors).toEqual([]);
  });
});

describe("import probing", () => {
  it("recognises the main-guard patterns that make importing safe", () => {
    expect(isImportSafe('if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {')).toBe(true);
    expect(isImportSafe("const x = 1; // no guard")).toBe(false);
  });

  it("honours the explicit opt-out and opt-in directives", () => {
    expect(importProbeDirective("// @import-unsafe — seeds a database")).toBe("unsafe");
    expect(importProbeDirective("// @import-safe — no side effects")).toBe("safe");
    expect(importProbeDirective("const x = 1;")).toBeNull();
  });

  it("does not execute an unguarded script (that would be a side effect, not a check)", async () => {
    const root = fixtureRoot("unguarded");
    const marker = path.join(root, "ran.txt");
    write(root, "side-effect.mjs", `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\n`);
    const result = await checkScript(path.join(root, "side-effect.mjs"), { deps: new Set(), aliases: [], root, probe: true });
    expect(result.probed).toBe(false);
    await expect(import("node:fs").then((fs) => fs.existsSync(marker))).resolves.toBe(false);
  });
});

describe("the repository's own scripts/ (the gate's reason to exist)", () => {
  it("loads the repo tsconfig aliases instead of reading @/ as an npm scope", () => {
    const aliases = loadAliases();
    expect(aliases.length).toBeGreaterThan(0);
    expect(resolveAlias("@/lib/data/repo", aliases)).toContain(path.join("src", "lib", "data", "repo.ts"));
  });

  it("passes on every file under scripts/, reaching far beyond the entry files", async () => {
    const { results, checked, aliases } = await runGate();
    const failures = results.filter((result) => result.errors.length > 0);
    expect(failures.map((result) => path.relative(process.cwd(), result.file))).toEqual([]);
    expect(checked).toBeGreaterThanOrEqual(30);
    expect(aliases).toBeGreaterThan(0);
    const modules = results.reduce((sum, result) => sum + result.graph, 0);
    expect(modules).toBeGreaterThan(100);
  });

  it("never reports a warning that would be a false positive in this repo", async () => {
    const { results } = await runGate();
    expect(results.flatMap((result) => result.warnings)).toEqual([]);
  });

  it("parses every shell script with the interpreter it declares", async () => {
    // The repo-wide assertion above is the one that caught setup-sentry.sh
    // claiming `#!/bin/sh` while using bash arrays — on macOS `sh -n` accepted it
    // and on Ubuntu's dash it did not, so pushing was the first place it showed.
    const shellScripts = discoverScripts().filter((file) => {
      const kind = scriptKind(file);
      return kind === "sh" || kind === "bash";
    });
    expect(shellScripts.length).toBeGreaterThan(0);
    for (const file of shellScripts) {
      const declared = scriptKind(file);
      const problems = await checkSyntax(file, declared);
      expect(problems, `${file} (${declared})`).toEqual([]);
      if (declared === "sh") {
        expect(
          /^#!.*\b(sh|dash|ksh|ash)\b/.test(readFileSync(file, "utf8")),
          `${file} is parsed as POSIX sh but declares no plain-sh shebang`
        ).toBe(true);
      }
    }
  });

  it("pins the graph cap so a runaway walk cannot hang CI silently", () => {
    expect(GRAPH_LIMIT).toBeGreaterThanOrEqual(500);
    expect(GRAPH_LIMIT).toBeLessThanOrEqual(10_000);
  });
});
