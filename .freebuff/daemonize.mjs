// Detached launcher: spawns a command in its own session/process group so the
// tool-call shell's cleanup can't kill it. Also layers .env under real env
// vars (so a DEMO_MODE=false passed on the command line wins over the file).
// Usage: node .freebuff/daemonize.mjs <cmd...>
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const [, , ...cmd] = process.argv;
if (cmd.length === 0) {
  console.error("usage: node .freebuff/daemonize.mjs <cmd...>");
  process.exit(1);
}

const env = { ...process.env };
for (const line of readFileSync(".env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="?([^"#]*)"?\s*$/);
  if (m && !(m[1] in env)) env[m[1]] = m[2];
}

const child = spawn(cmd[0], cmd.slice(1), {
  env,
  detached: true, // new session + process group → survives the caller's death
  stdio: "ignore",
});

child.unref();
console.log(`detached pid=${child.pid}`);
