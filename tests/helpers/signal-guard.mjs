/**
 * finally-like process guard — shared by the E2E teardown (tests/e2e-smoke.test.ts,
 * which restores the shared tsconfig.json) and its unit test
 * (tests/signal-guard.test.ts, which spawns a real child process and SIGTERMs
 * it to prove the restore runs before exit).
 *
 * A vitest `afterAll` only runs on a clean teardown; a hard-killed run
 * (Ctrl-C / CI timeout) never reaches it. This guard closes that gap: the
 * `restore` callback runs on normal process exit AND on the given signals,
 * then the signal is re-raised so its default disposition (termination) still
 * applies. Restores are idempotent by contract — the callback should compare
 * before writing, since the afterAll restore and this guard can both fire.
 *
 * Returns a cleanup that removes every listener (also invoked internally
 * before re-raising, so the exit leg can't double-restore).
 */
export function installSignalGuard(restore, signals = ["SIGINT", "SIGTERM"]) {
  const onExit = () => restore();
  const cleanup = () => {
    process.removeListener("exit", onExit);
    for (const sig of signals) process.removeListener(sig, onSignal);
  };
  const onSignal = (sig) => {
    restore();
    cleanup();
    process.kill(process.pid, sig);
  };
  process.once("exit", onExit);
  for (const sig of signals) process.on(sig, onSignal);
  return cleanup;
}
