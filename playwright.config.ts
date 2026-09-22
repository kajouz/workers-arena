import { defineConfig, devices } from "@playwright/test";

// ─────────────────────────────────────────────────────────────────────────────
// Playwright config — portable across macOS / Linux / CI.
//
// Browser: Playwright's own chromium build. Override with
// PW_CHROMIUM_CHANNEL=chrome (brand Chrome/Edge) or PW_EXECUTABLE_PATH (any
// binary) — a hardcoded macOS path broke Linux/CI outright.
//
// Server mode: default boots `next dev` (fast local iteration). PW_PROD=1
// builds + serves a PRODUCTION server instead — the mode CI's e2e job uses.
// PW_PORT (or PORT) picks the port for both the server and baseURL (default
// 3001).
// ─────────────────────────────────────────────────────────────────────────────

const isCI = Boolean(process.env.CI);
// Port precedence: PW_PORT (dedicated, collision-proof) → PORT (CI-friendly;
// guarded — some sandboxes export PORT=0, which must fall back) → 3001.
function parsePort(v: string | undefined): number | null {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null;
}
const PORT = parsePort(process.env.PW_PORT) ?? parsePort(process.env.PORT) ?? 3001;
const baseURL = `http://localhost:${PORT}`;
const PW_PROD = Boolean(process.env.PW_PROD);

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 60_000,
  // Every test is isolated (per-test browser context + fresh login cookie),
  // so the whole suite runs fully parallel — files AND tests inside files.
  // The accessibility spec (12 page-sweeps × ~11 checks, all independent
  // navigations) was the 6-minute serial bottleneck; parallelism cut the
  // total wall time ~4× on the same 8 workers.
  fullyParallel: true,
  workers: isCI ? 4 : 8,
  forbidOnly: isCI,
  // One browser crash mid-run ("Channel closed") used to fail the whole file —
  // retrying re-runs only the failed tests and reports flakes honestly.
  retries: isCI ? 2 : 1,
  // Fail fast on the first broken test in CI; full visibility locally.
  maxFailures: isCI ? 10 : 0,
  // The HTML report (playwright-report/) carries per-failure page snapshots
  // and is what CI uploads on failure; the list reporter keeps the console
  // readable. Without it, a CI-only failure is undebuggable — no artifacts.
  reporter: isCI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    baseURL,
    // Full interaction trace for every failed test — the discriminator
    // between "app rendered wrong" and "the request never completed".
    trace: "retain-on-failure",
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    ...(process.env.PW_EXECUTABLE_PATH
      ? { executablePath: process.env.PW_EXECUTABLE_PATH }
      : process.env.PW_CHROMIUM_CHANNEL
        ? { channel: process.env.PW_CHROMIUM_CHANNEL }
        : {}),
  },
  // PW_PROD: build once, then serve with `next start`. NEXT_DISABLE_STANDALONE
  // is required — `next start` refuses a standalone-output build (see
  // next.config.ts). reuseExistingServer=false so CI never tests against a
  // stale process.
  webServer: PW_PROD
    ? {
        command: "npm run build:prod && npx next start -p " + PORT,
        port: PORT,
        reuseExistingServer: false,
        timeout: 420_000,
        env: {
          NEXT_DISABLE_STANDALONE: "1",
          NEXT_TELEMETRY_DISABLED: "1",
          // The prod-build E2E demo contract (see demoSessionAllowed): the
          // production server must accept the wa_session login cookies the
          // specs set. CI appends it to .env; default it here so local
          // PW_PROD runs behave identically. Set DEMO_MODE=false explicitly
          // to test the guard's refuse path instead.
          DEMO_MODE: process.env.DEMO_MODE ?? "true",
          // 4 parallel workers exceed the per-IP API rate-limit budget on
          // their own — specs asserting /api bodies would 429 (rotating
          // victim per run). The limiter stays unit-tested; e2e verifies the
          // app, not the throttling window.
          RATE_LIMIT_DISABLED: "1",
          // The specs sign in by seeding `wa_session` directly — an UNSIGNED
          // demo cookie, which production refuses by default (a client-authored
          // payload must never grant a role). Test-only opt-in, mirroring
          // RATE_LIMIT_DISABLED.
          ALLOW_UNSIGNED_DEMO_COOKIE: "1",
        },
      }
    : {
        command: "npx next dev -p " + PORT,
        port: PORT,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        env: {
          // Same rationale as the prod branch above.
          RATE_LIMIT_DISABLED: "1",
          ALLOW_UNSIGNED_DEMO_COOKIE: "1",
        },
      },
});
