// @vitest-environment node
/**
 * Process-level guard unit test (the "finally" for hard-killed E2E runs):
 * spawns a REAL child process that installs the shared signal guard
 * (tests/helpers/signal-guard.mjs) over a fake tsconfig.json, simulates Next's
 * TS-plugin rewrite (polluting the file), then either receives SIGTERM or
 * exits normally — asserting the file was restored BEFORE the process died.
 *
 * Skipped on Windows: Node does not deliver POSIX signals to JS handlers
 * there (child.kill("SIGTERM") terminates without running listeners), so the
 * guard — and thus this test — is a POSIX behavior.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardModulePath = fileURLToPath(new URL("./helpers/signal-guard.mjs", import.meta.url));

/** A plausible pre-pollution tsconfig include array. */
const BACKUP = JSON.stringify({ include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"] });
/** What Next's TS plugin leaves in the include array on a killed run. */
const POLLUTION = "POLLUTED-BY-NEXT-TS-PLUGIN";

function spawnGuardChild(tsconfigPath: string, afterReady = "") {
  // The child: write the pollution, install the guard, signal readiness, then
  // do whatever `afterReady` says (default: just wait for the parent's signal).
  const script = `
import { writeFileSync } from "node:fs";
import { installSignalGuard } from ${JSON.stringify(guardModulePath)};
const [tsconfigPath, backup] = process.argv.slice(1);
writeFileSync(tsconfigPath, ${JSON.stringify(POLLUTION)});
installSignalGuard(() => writeFileSync(tsconfigPath, backup));
// Keep the event loop alive — without pending work the child would exit
// normally right after READY, firing the exit-leg restore before the parent
// can act (exactly what this test guards against).
setInterval(() => {}, 1000);
console.log("READY");
${afterReady}
`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, tsconfigPath, BACKUP], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout?.on("data", (d: Buffer) => (out += d.toString()));
  child.stderr?.on("data", (d: Buffer) => (out += d.toString()));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on("exit", (code, signal) => resolve({ code, signal }))
  );
  const ready = () =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`child never became ready: ${out}`)), 10_000);
      const poll = setInterval(() => {
        if (out.includes("READY")) {
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }
      }, 20);
    });
  return { child, exited, ready };
}

describe.skipIf(process.platform === "win32")("E2E signal guard", () => {
  it("restores the shared file before exit when SIGTERM arrives (the Ctrl-C / CI-timeout path)", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "guard-sigterm-"));
    const tsconfigPath = path.join(root, "tsconfig.json");
    writeFileSync(tsconfigPath, BACKUP);
    const { child, exited, ready } = spawnGuardChild(tsconfigPath);
    try {
      await ready();
      // The simulated Next rewrite really polluted the file…
      expect(readFileSync(tsconfigPath, "utf8")).toBe(POLLUTION);
      // …so a SIGTERM now must restore it before the process dies.
      child.kill("SIGTERM");
      const { code, signal } = await exited;
      // The guard re-raises the signal after restoring, so the child dies by
      // it — the restore demonstrably happened BEFORE exit.
      expect(signal).toBe("SIGTERM");
      expect(code).toBeNull();
      expect(readFileSync(tsconfigPath, "utf8")).toBe(BACKUP);
    } finally {
      child.kill("SIGKILL");
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("restores the shared file on normal exit (the process.once('exit') leg)", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "guard-exit-"));
    const tsconfigPath = path.join(root, "tsconfig.json");
    writeFileSync(tsconfigPath, BACKUP);
    const { child, exited, ready } = spawnGuardChild(tsconfigPath, 'setTimeout(() => process.exit(0), 300);');
    try {
      await ready();
      expect(readFileSync(tsconfigPath, "utf8")).toBe(POLLUTION);
      const { code, signal } = await exited;
      expect(code).toBe(0);
      expect(signal).toBeNull();
      expect(readFileSync(tsconfigPath, "utf8")).toBe(BACKUP);
    } finally {
      child.kill("SIGKILL");
      rmSync(root, { recursive: true, force: true });
    }
  });
});
