/**
 * D3 — the money-mode guard (docs/PAYMENTS.md §Money mode).
 *
 * The data layer serves the embedded demo dataset unless `DEMO_MODE` is the
 * literal "false" AND `DATABASE_URL` is set (src/lib/data/repo.ts). That
 * default is right for the public showcase (which runs `DEMO_MODE=true` on
 * purpose), but it is dangerous for a deployment meant to take real money: an
 * unset flag or a missing database URL silently routes every payment confirm
 * into in-memory stores that vanish on the next deploy.
 *
 * `moneyModeProblem()` names those misconfigurations. The money entry points
 * (checkout minting and confirmations in repo.ts, the admin confirm action)
 * refuse to run while it reports one, and the instructions page shows the
 * showcase banner whenever demo data is served, so nobody sends real money to
 * a demo reference.
 *
 * Declaring real money: set `PAYMENTS_LIVE=true`. It requires `DEMO_MODE=false`
 * and a `DATABASE_URL`.
 */

type Env = Record<string, string | undefined>;

/** The data layer's own rule: demo unless DEMO_MODE is exactly "false". */
export function servesDemoData(env: Env = process.env): boolean {
  return env.DEMO_MODE !== "false" || !env.DATABASE_URL;
}

/** A human-readable reason money must not move, or null when the config is coherent. */
export function moneyModeProblem(env: Env = process.env): string | null {
  const live = env.PAYMENTS_LIVE === "true";
  if (live && env.DEMO_MODE !== "false") {
    return "PAYMENTS_LIVE=true but DEMO_MODE is not \"false\": real payments would be stored in demo memory.";
  }
  if (live && !env.DATABASE_URL) {
    return "PAYMENTS_LIVE=true but DATABASE_URL is missing: real payments would be stored in demo memory.";
  }
  if (env.NODE_ENV !== "production") return null;
  if (env.DEMO_MODE === undefined || env.DEMO_MODE === "") {
    return "DEMO_MODE is unset in production: it silently serves demo data. Set it explicitly to \"false\" (real data) or \"true\" (showcase).";
  }
  if (env.DEMO_MODE === "false" && !env.DATABASE_URL) {
    return "DEMO_MODE=false but DATABASE_URL is missing: payments would be stored in demo memory.";
  }
  return null;
}

let warned = false;

/**
 * True when money may move. Logs the problem once per process when it may not,
 * so a misconfigured deployment is loud in its logs instead of silently lossy.
 */
export function moneyMayMove(env: Env = process.env): boolean {
  const problem = moneyModeProblem(env);
  if (!problem) return true;
  if (!warned) {
    warned = true;
    console.error(`[payments] money flows are DISABLED — ${problem}`);
  }
  return false;
}
