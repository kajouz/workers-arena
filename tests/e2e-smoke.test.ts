import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { installSignalGuard } from "./helpers/signal-guard.mjs";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * E2E HYDRATION SMOKE TEST
 * ────────────────────────────────────────────────────────────────────────────
 * Boots its own `next dev` server (demo mode, isolated .next via NEXT_DIST_DIR
 * so it can't clash with a concurrently running preview), then drives the real
 * system Chrome through the protected pages — the four dashboards PLUS the
 * booking dispute deep link (admin/bookings/BK-1001, whose live SLA countdown
 * used to hydration-mismatch on every load) and the five highest-traffic
 * public routes (home + push onboarding, search, customer /bookings, worker
 * profile, login) — in both English and Arabic. It FAILS on any React
 * hydration error / validateDOMNesting warning / page error captured from the
 * browser console — the automated guard for the "In HTML, <X> cannot be a
 * descendant of <Y>" class of bugs.
 *
 * Beyond the console guard, the compact request-SLA countdown (the shared
 * BookingSlaCountdown + SlaUrgencyBar, §2.2) is CONTENT-checked on /bookings
 * (customer rows) and /dashboard (worker cards): the localized "Request
 * auto-expiry" progressbar must render with a numeric aria-valuenow and the
 * ticking countdown copy — so a silent regression that stops the countdown
 * from rendering fails the matrix even with a clean console. The /admin
 * refund-email preview dialog (the bilingual campaign-payments preview, 6420952)
 * gets the same content-level treatment: the matrix seeds a refunded campaign
 * payment through the demo-only /api/dev/seed-refunded-campaign route (the
 * real create→confirm→refund seams), then opens the dialog on the refunded
 * row in EN + AR and asserts the sandboxed iframe's srcdoc carries the page
 * locale's <html lang dir> + refund card + CTA — so the always-EN preview
 * regression fails the matrix even with a clean console.
 *
 * The SAME matrix also runs against a production build: `next build` into an
 * isolated NEXT_DIST_DIR, then `next start` on a free port — catching the
 * regressions dev masks (minified React errors, missing CSS/JS bundles, silent
 * hydration bail-outs). Prod is on by default; set E2E_SKIP_PROD=1 to skip the
 * ~1-2 min build.
 *
 * A final pass INTERACTS with the UI: renews the worker's subscription (in
 * both languages — asserting the toast, plan badge, new invoice and fired
 * notification), toggles light→dark on the homepage (asserting the dark class
 * lands on <html> and is restored on reload via the wa_theme cookie), switches
 * language EN→AR via the header menu, resubmits the worker's verification,
 * approves from the admin queue, and runs the full booking request→accept
 * loop in EN+AR (guest books a slot on /workers/:slug, worker accepts via the
 * dashboard RespondDialog, both sides show Confirmed) — asserting
 * toasts/state changes and zero hydration errors after each step. It runs against BOTH servers: dev catches
 * post-interaction hydration warnings (dev-only); prod verifies server-action
 * round-trips and RSC re-renders under strict runtime-error collection. E2E
 * servers isolate their demo stores (activity feed, push subscriptions) inside
 * their own dist dir so the live preview is untouched.
 *
 * Skips itself (with a warning) when no Chrome/Chromium executable is found,
 * so machines without a browser don't hard-fail `npm test`. Override the path
 * with PUPPETEER_EXECUTABLE_PATH.
 *
 * Auth/locale are set via the app's real cookies: `wa_session` (JSON demo
 * user) and `wa_locale` (read server-side, so SSR language must match the
 * client — exactly what hydration parity depends on).
 * ────────────────────────────────────────────────────────────────────────────
 */

const HOST = "127.0.0.1";

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
].filter((p): p is string => Boolean(p));

const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));

if (!CHROME) {
  console.warn(
    "⚠ e2e-smoke: no Chrome/Chromium executable found — E2E hydration smoke test SKIPPED. " +
      "Set PUPPETEER_EXECUTABLE_PATH to enable it."
  );
}

/** Prod matrix is on by default; set E2E_SKIP_PROD=1 to skip the ~1-2 min build. */
const E2E_SKIP_PROD = process.env.E2E_SKIP_PROD === "1";
if (E2E_SKIP_PROD) {
  console.warn("⚠ e2e-smoke: E2E_SKIP_PROD=1 — production-build matrix SKIPPED (dev matrix still runs).");
}

/**
 * Wait after a page load before clicking SSR-rendered controls. The buttons
 * exist in the SSR HTML before React hydrates, and a pre-hydration click
 * silently no-ops (the onClick isn't attached yet) — see runInteractions.
 */
const HYDRATION_SETTLE_MS = 400;

/** Demo session values (mirror src/lib/auth-demo.ts → DEMO_USERS). */
const SESSIONS: Record<string, { id: string; name: string; email: string; role: string; hue: number }> = {
  admin: { id: "u-admin", name: "Platform Admin", email: "admin@workersarena.com", role: "admin", hue: 280 },
  worker: { id: "u-worker", name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa", role: "worker", hue: 25 },
  company: { id: "u-company", name: "BuildCo Ltd", email: "ads@buildco.sa", role: "company", hue: 150 },
  // The customer whose demo bookings the /bookings page renders (BK-1001).
  customer: { id: "u-customer", name: "Sara Customer", email: "sara@example.com", role: "customer", hue: 200 },
};

type RouteSpec = {
  path: string;
  role?: "admin" | "worker" | "company" | "customer";
  /** Assert the homepage push-onboarding banner renders on this route. */
  pushPrompt?: boolean;
  /** [en, ar] substring that must appear in the rendered page — anchors a
   * route so a silent notFound()/redirect can't pass the generic checks. */
  expectText?: readonly [string, string];
  /** Content-level guard for the compact request-SLA countdown (§2.2): a
   * progressbar labeled with the localized "Request auto-expiry" (the
   * shared BookingSlaCountdown) must render with a numeric aria-valuenow,
   * plus the ticking countdown copy — zero console errors alone can't catch
   * the countdown silently vanishing. */
  expectSlaBar?: boolean;
  /** Content-level guard for the /admin refund-email preview dialog (the
   * bilingual campaign-payments preview, 6420952): the route must be seeded
   * with a refunded campaign payment first (the demo store seeds none), then
   * the dialog must open on the refunded row and its sandboxed iframe must
   * render the email in the PAGE locale (EN or AR), not always EN — the bug
   * the bilingual wave fixed. */
  expectRefundEmailPreview?: boolean;
};

/** Auth-protected pages — each needs a demo session cookie. Includes the
 * booking dispute deep link (admin/bookings/BK-1001), the only route whose
 * live SLA countdown (BookingSlaCountdown via useSsrSafeNow) used to
 * hydration-mismatch on every load — the exact bug this matrix guards. */
const ROUTES: RouteSpec[] = [
  // /admin carries the refund-email preview dialog check: the matrix seeds a
  // refunded campaign payment (demo-only /api/dev/seed-refunded-campaign)
  // then asserts the dialog's iframe copy follows the page locale in EN + AR.
  { path: "admin", role: "admin", expectRefundEmailPreview: true },
  {
    path: "admin/bookings/BK-1001",
    role: "admin",
    // Anchored so a silent notFound() can't pass the generic checks.
    expectText: ["Full audit trail", "سجل تدقيق كامل"],
  },
  // The worker dashboard renders the compact SLA countdown on its requested
  // booking cards — content-asserted via expectSlaBar (not just clean console).
  { path: "dashboard", role: "worker", expectSlaBar: true },
  { path: "company", role: "company" },
  { path: "notifications", role: "admin" },
];

/**
 * High-traffic public routes — the most complex components in the app (hero +
 * push onboarding, search filters, full worker profile, auth form). Visitors
 * by default; the homepage opts into a session so the onboarding prompt (which
 * requires a signed-in user) actually renders and gets asserted. /bookings
 * carries the customer session so the booking rows — with their useSsrSafeNow
 * live SLA countdowns — actually render instead of the guest lookup form
 * (and the countdown bar gets the expectSlaBar content check).
 */
const PUBLIC_ROUTES: RouteSpec[] = [
  { path: "", role: "worker", pushPrompt: true }, // home + push onboarding prompt
  { path: "search" },
  {
    path: "bookings",
    role: "customer",
    // Anchored so a silent redirect to the guest lookup can't pass.
    expectText: ["My bookings", "حجوزاتي"],
    // The customer rows render the compact SLA countdown on requested
    // bookings (BK-1001) — content-asserted, not just zero console errors.
    expectSlaBar: true,
  },
  // demo seed worker (src/lib/data/workers.ts) — anchored so a silent 404
  // can't pass the generic assertions.
  { path: "workers/khaled-al-harbi-plumbing", expectText: ["Khaled Al-Harbi", "خالد الحربي"] },
  { path: "auth/login" },
];

const LOCALES = ["en", "ar"] as const;

/**
 * React 19 dev-mode signatures for hydration mismatches and invalid DOM
 * nesting. Anything matching is a hard failure for the smoke test.
 */
const HYDRATION_RE =
  /hydration error|hydration failed|did not match|didn't match|validateDOMNesting|cannot be a descendant of|cannot appear as a descendant of|server rendered html|expected server html|to contain a matching|while hydrating|minified react error/i;

function classify(message: string): "hydration" | "note" {
  return HYDRATION_RE.test(message) ? "hydration" : "note";
}

/** Prod-only runtime-error signatures (React minified errors, uncaught JS). */
const PROD_RUNTIME_RE =
  /minified react error|uncaught (?:typeerror|referenceerror|syntaxerror|error)|is not defined|cannot read propert(?:y|ies) of|cannot destructure|invariant violation/i;

/** Strict (production) classification — hydration OR runtime errors fail. */
function classifyStrict(message: string): "hydration" | "runtime" | "note" {
  if (HYDRATION_RE.test(message)) return "hydration";
  if (PROD_RUNTIME_RE.test(message)) return "runtime";
  return "note";
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, HOST, () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number, label = "dev server"): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeoutMs) throw new Error(`${label} not ready at ${url}`);
    try {
      const res = await fetch(url);
      if (res.status === 200 || res.status === 307 || res.status === 308) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** GiB of usable free space on the filesystem holding `root` (bavail, i.e.
 * available to unprivileged users — excludes reserved blocks). Unknown
 * filesystem → Infinity so the floor never blocks on a stats failure. */
function diskFreeGb(root: string): number {
  try {
    const st = statfsSync(root);
    return (st.bavail * st.bsize) / 1024 ** 3;
  } catch {
    return Infinity;
  }
}

/** The free-disk floor for the pre-run check: E2E_MIN_FREE_GB (default 5 GiB,
 * 0 disables, garbage falls back to the default). */
function minFreeGbFromEnv(): number {
  const raw = process.env.E2E_MIN_FREE_GB;
  if (raw === undefined) return 5;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/**
 * Pre-run workspace check — hardens the E2E against the disk-full incident:
 * an absolute NEXT_DIST_DIR was path-joined onto the cwd, silently building a
 * 43G doubled-path tree, and hard-killed runs left stale machine-specific
 * entries in tsconfig.json's include array (dozens accumulated over runs).
 * Failing fast with actionable messages beats proceeding and re-accumulating
 * the artifact. Throws when any artifact is found; otherwise no-op.
 *
 * `minFreeGb` (default 0 = disabled) rejects when the build volume has less
 * free space than the floor — a near-full disk is what turned the doubled
 * path into a crash, so the failure should happen before the build, not
 * mid-write. The production call passes `minFreeGbFromEnv()` (default 5 GiB,
 * override with E2E_MIN_FREE_GB).
 */
/** A detected pre-run problem. The `dir` and `tsconfig` kinds are removable
 * (autoclean); `disk` is a runtime condition with nothing to delete — though
 * removing leftover dirs may free enough space for the post-fix re-check. */
type WorkspaceProblem =
  | { kind: "dir"; path: string; message: string }
  | { kind: "tsconfig"; path: string; message: string; staleCount: number }
  | { kind: "disk"; message: string };

/** Detect crash artifacts + the free-disk condition. Pure — no side effects,
 * so the unit tests can probe detection without touching real paths. */
function detectWorkspaceProblems(
  root: string,
  tsconfigPath = path.join(root, "tsconfig.json"),
  minFreeGb = 0
): WorkspaceProblem[] {
  const problems: WorkspaceProblem[] = [];

  // 1) The doubled-path tree: an absolute dist dir joined onto the cwd
  //    reproduces the root's home prefix inside itself — <root>/Users on
  //    macOS, <root>/home on Linux, a drive-letter segment on Windows.
  const doubledMac = path.join(root, "Users");
  const doubledLinux = path.join(root, "home");
  if (existsSync(doubledMac)) {
    problems.push({
      kind: "dir",
      path: doubledMac,
      message: `doubled-path tree at ${doubledMac} (an absolute NEXT_DIST_DIR was joined onto the cwd) — remove it (e.g. \`rm -rf "${doubledMac}"\`)`,
    });
  } else if (existsSync(doubledLinux)) {
    problems.push({
      kind: "dir",
      path: doubledLinux,
      message: `doubled-path tree at ${doubledLinux} (an absolute NEXT_DIST_DIR was joined onto the cwd) — remove it (e.g. \`rm -rf "${doubledLinux}"\`)`,
    });
  }
  try {
    const driveEntry = readdirSync(root).find((e) => /^[A-Za-z]:/.test(e));
    if (driveEntry) {
      // A `dir` problem like the macOS/Linux cases — autoclean removes it too.
      problems.push({
        kind: "dir",
        path: path.join(root, driveEntry),
        message: `doubled-path tree at ${path.join(root, driveEntry)} (a drive-letter segment at the root — an absolute NEXT_DIST_DIR joined onto the cwd) — remove it (e.g. \`rm -rf "${path.join(root, driveEntry)}"\`)`,
      });
    }
  } catch {
    // unreadable root — not our concern here
  }

  // 2) Leftover isolated dist dirs (plus the doubled dev/dev · prod/prod
  //    nesting signature) inside .data — crash artifacts that refill the disk.
  const dataDir = path.join(root, ".data");
  if (existsSync(dataDir)) {
    let entries: string[] = [];
    try {
      entries = readdirSync(dataDir);
    } catch {
      // unreadable — skip
    }
    for (const entry of entries) {
      if (!/^\.next-e2e(-prod)?-\d+$/.test(entry)) continue;
      const dir = path.join(dataDir, entry);
      const doubledNesting =
        existsSync(path.join(dir, "dev", "dev")) || existsSync(path.join(dir, "prod", "prod"));
      problems.push({
        kind: "dir",
        path: dir,
        message: doubledNesting
          ? `doubled-path dist tree at ${dir} (contains dev/dev or prod/prod — the join artifact) — remove it (\`rm -rf "${dir}"\`)`
          : `leftover isolated dist dir from a crashed run at ${dir} — remove it (\`rm -rf "${dir}"\`)`,
      });
    }
  }

  // 3) Stale tsconfig include entries — Next's TS plugin appends absolute,
  //    machine-specific .data/.next-e2e-* type paths to the include array; a
  //    hard-killed run leaves them behind.
  try {
    const tsconfig = readFileSync(tsconfigPath, "utf8");
    const stale = tsconfig.split("\n").filter((l) => /\.data[\\/]\.next-e2e/.test(l));
    if (stale.length > 0) {
      problems.push({
        kind: "tsconfig",
        path: tsconfigPath,
        staleCount: stale.length,
        message: `${stale.length} stale .next-e2e include entr${stale.length === 1 ? "y" : "ies"} in tsconfig.json (e.g. "${stale[0]!.trim()}") — restore the include array to its clean state`,
      });
    }
  } catch {
    // Missing/unreadable tsconfig is surfaced by beforeAll's own read.
  }

  // 4) Free-disk floor: the E2E build writes hundreds of MB into the isolated
  //    dist dirs, and a near-full disk is what turned the doubled-path
  //    incident into a crash. Reject before the build starts, not mid-write.
  if (minFreeGb > 0) {
    const free = diskFreeGb(root);
    if (free < minFreeGb) {
      problems.push({
        kind: "disk",
        message: `only ${free.toFixed(1)} GiB free on the build volume — below the ${minFreeGb} GiB floor (set E2E_MIN_FREE_GB, 0 disables)`,
      });
    }
  }

  return problems;
}

/** Remove a `dir` problem or fix a `tsconfig` problem, reporting what was
 * removed (dirs / tsconfig lines) so the autoclean summary can tie the freed
 * space to the artifacts. The tsconfig fix only drops lines that are clearly
 * quoted include entries (starting with a quote, matching the stale path
 * inside) — a minified one-line file or a comment mentioning the path is left
 * alone, which the post-fix re-check then rejects (fail-safe). `disk` problems
 * have nothing to remove — the caller skips them. */
function fixWorkspaceProblem(p: WorkspaceProblem): { dirs: number; tsconfigLines: number } {
  if (p.kind === "dir") {
    rmSync(p.path, { recursive: true, force: true });
    return { dirs: 1, tsconfigLines: 0 };
  }
  if (p.kind === "tsconfig") {
    const raw = readFileSync(p.path, "utf8");
    const staleRe = /^\s*"[^"]*\.data[\\/]\.next-e2e[^"]*",?\s*$/;
    const lines = raw.split("\n");
    const removed = lines.filter((l) => staleRe.test(l)).length;
    const withoutStale = lines.filter((l) => !staleRe.test(l)).join("\n");
    // The stale entry was usually the include array's LAST — drop the now-
    // dangling trailing comma so the fixed file is strict JSON again (the
    // JSONC tolerance would otherwise carry it forward forever via the backup).
    const clean = withoutStale.replace(/,\n(\s*[\]}])/g, "\n$1");
    writeFileSync(p.path, clean);
    return { dirs: 0, tsconfigLines: removed };
  }
  return { dirs: 0, tsconfigLines: 0 };
}

/**
 * Pre-run workspace check — hardens the E2E against the disk-full incident:
 * an absolute NEXT_DIST_DIR was path-joined onto the cwd, silently building a
 * 43G doubled-path tree, and hard-killed runs left stale machine-specific
 * entries in tsconfig.json's include array (dozens accumulated over runs).
 *
 * Rejects (throws) when artifacts are found, unless `autofix` is set — then
 * the removable ones (dirs + stale include lines) are removed after being
 * printed, and the workspace is re-checked; anything that survives (or a disk
 * floor with nothing to clean) still rejects. The production call passes
 * `E2E_AUTOCLEAN === "1"` and `minFreeGbFromEnv()` (default 5 GiB floor,
 * E2E_MIN_FREE_GB override, 0 disables) — a near-full disk fails before the
 * build starts, not mid-write.
 */
function assertCleanWorkspace(
  root: string,
  tsconfigPath = path.join(root, "tsconfig.json"),
  minFreeGb = 0,
  autofix = false
): void {
  let problems = detectWorkspaceProblems(root, tsconfigPath, minFreeGb);
  if (problems.length === 0) return;
  const lines = problems.map((p) => `  • ${p.message}`);
  const cleanable = problems.filter((p) => p.kind !== "disk");

  if (autofix && cleanable.length > 0) {
    const before = diskFreeGb(root);
    console.warn(
      "E2E pre-run check: E2E_AUTOCLEAN=1 — removing crash artifacts:\n" + lines.join("\n")
    );
    let dirsRemoved = 0;
    let tsconfigLinesRemoved = 0;
    for (const p of cleanable) {
      const r = fixWorkspaceProblem(p);
      dirsRemoved += r.dirs;
      tsconfigLinesRemoved += r.tsconfigLines;
    }
    const after = diskFreeGb(root);
    // Freed-space summary so CI output shows exactly what the autoclean
    // recovered: the counts tie the space to the artifacts, the freed label
    // keeps 3 decimals for sub-0.1 GiB leftovers, and before→after reads at 2.
    // The gate is the 3-decimal GiB granularity (≥ 0.5 MiB), NOT a strict
    // after > before: shared CI runners see free-space drift from concurrent
    // jobs, so a strict comparison fires the line for noise even when nothing
    // was recovered. The structured E2E_AUTOCLEAN_RESULT line below is the
    // always-emitted record; the human line only claims real recoveries.
    const freed = after - before;
    if (freed >= 0.0005) {
      const freedLabel = freed < 0.1 ? `${freed.toFixed(3)} GiB` : `${freed.toFixed(2)} GiB`;
      const dirLabel = `${dirsRemoved} ${dirsRemoved === 1 ? "dir" : "dirs"}`;
      const lineLabel = `${tsconfigLinesRemoved} stale tsconfig ${tsconfigLinesRemoved === 1 ? "line" : "lines"}`;
      const removedLabel =
        dirsRemoved > 0 && tsconfigLinesRemoved > 0
          ? `${dirLabel} + ${lineLabel}`
          : dirsRemoved > 0
            ? dirLabel
            : lineLabel;
      console.warn(
        `E2E pre-run check: autoclean removed ${removedLabel}, freed ${freedLabel} (${before.toFixed(2)} → ${after.toFixed(2)} GiB free)`
      );
    }
    // Machine-readable twin — a single pipe-separated line so CI can parse
    // `E2E_AUTOCLEAN_RESULT=<freed GiB>|<before GiB>|<after GiB>|<dirs>|<tsconfig lines>`
    // (the freed field is authoritative at 3 decimals; before/after at 2).
    // Emitted for EVERY autoclean run — even when freed is 0.000 (e.g. a
    // tiny leftover below the 3-decimal GiB granularity, or a tsconfig-only
    // fix) — so CI dashboards always see a record per run and can tell
    // "cleaned nothing" from "no autoclean ran".
    console.warn(
      `E2E_AUTOCLEAN_RESULT=${(after - before).toFixed(3)}|${before.toFixed(2)}|${after.toFixed(2)}|${dirsRemoved}|${tsconfigLinesRemoved}`
    );
    // Re-check: the removals ARE the fix (clearing leftover dist dirs may even
    // lift the disk floor); anything that survives → reject.
    problems = detectWorkspaceProblems(root, tsconfigPath, minFreeGb);
    if (problems.length === 0) return;
  }

  const hint = autofix
    ? "\nE2E_AUTOCLEAN=1 was set but the remaining problems could not be auto-removed (disk conditions can't be; check the paths above)."
    : "\nThese are build artifacts (isolated .next dirs + a config rewrite), not source — safe to delete before re-running (or set E2E_AUTOCLEAN=1 to have the check remove them).";
  throw new Error(
    "E2E pre-run check failed — a crashed run left artifacts behind:\n" +
      problems.map((p) => `  • ${p.message}`).join("\n") +
    hint
  );
}

/** The classifier itself is unit-tested (runs even without Chrome). */
describe("hydration message classifier", () => {
  it("flags real hydration/DOM-nesting messages", () => {
    expect(classify("In HTML, <div> cannot be a descendant of <p>.\n    This will cause a hydration error.")).toBe("hydration");
    expect(classify("Hydration failed because the server rendered HTML didn't match the client.")).toBe("hydration");
    expect(classify("Warning: validateDOMNesting(...): <span> cannot appear as a descendant of <button>.")).toBe("hydration");
    expect(classify("Text content did not match. Server: \"x\" Client: \"y\"")).toBe("hydration");
    expect(classify("A tree hydrated but some attributes of the server rendered HTML didn't match the client.")).toBe("hydration");
    // Additional React 19 signatures (see review): these must be caught too.
    expect(classify("Expected server HTML to contain a matching <div> in <p>.")).toBe("hydration");
    expect(classify("There was an error while hydrating. Because the error happened outside of a Suspense boundary…")).toBe("hydration");
    expect(classify("Error: Minified React error #423; visit https://reactjs.org/docs/error-decoder.html?invariant=423")).toBe("hydration");
    expect(classifyStrict("Uncaught TypeError: Cannot read properties of undefined (reading 'map')")).toBe("runtime");
    expect(classifyStrict("ReferenceError: foo is not defined")).toBe("runtime");
    expect(classifyStrict("Hydration failed because the server rendered HTML didn't match the client.")).toBe("hydration");
    expect(classifyStrict("[HMR] connected")).toBe("note");
  });

  it("ignores benign dev noise", () => {
    expect(classify("Download the React DevTools for a better development experience")).toBe("note");
    expect(classify("Warning: Each child in a list should have a unique key.")).toBe("note");
    expect(classify("Failed to load resource: the server responded with a status of 404 (Not Found)")).toBe("note");
    expect(classify("[HMR] connected")).toBe("note");
  });
});

/** The pre-run workspace check is unit-tested against temp dirs (runs even
 * without Chrome) — the disk-full hardening must not regress silently. */
describe("assertCleanWorkspace", () => {
  const cleanTsconfig = JSON.stringify({ include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"] });

  function tempWorkspace(): string {
    const root = mkdtempSync(path.join(tmpdir(), "e2e-check-"));
    mkdirSync(path.join(root, ".data"), { recursive: true });
    writeFileSync(path.join(root, "tsconfig.json"), cleanTsconfig);
    return root;
  }

  it("accepts a clean workspace", () => {
    const root = tempWorkspace();
    try {
      expect(() => assertCleanWorkspace(root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects the doubled-path tree at the root (Users/ — the 43G artifact)", () => {
    const root = tempWorkspace();
    try {
      mkdirSync(path.join(root, "Users"), { recursive: true });
      expect(() => assertCleanWorkspace(root)).toThrow(/doubled-path tree/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects leftover isolated dist dirs and the doubled dev/dev nesting", () => {
    const root = tempWorkspace();
    try {
      // Plain leftover from a crashed run.
      mkdirSync(path.join(root, ".data", ".next-e2e-9999"), { recursive: true });
      expect(() => assertCleanWorkspace(root)).toThrow(/leftover isolated dist dir/);

      // The doubled join signature (<dist>/prod/prod).
      rmSync(path.join(root, ".data", ".next-e2e-9999"), { recursive: true, force: true });
      mkdirSync(path.join(root, ".data", ".next-e2e-prod-8888", "prod", "prod"), { recursive: true });
      expect(() => assertCleanWorkspace(root)).toThrow(/doubled-path dist tree/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects stale .next-e2e include entries in tsconfig.json", () => {
    const root = tempWorkspace();
    try {
      writeFileSync(
        path.join(root, "tsconfig.json"),
        JSON.stringify({
          include: [
            "next-env.d.ts",
            "**/*.ts",
            "**/*.tsx",
            "/Users/ka/Documents/WorkersArena-freebuff/.data/.next-e2e-4858/dev/dev/types/**/*.ts",
          ],
        })
      );
      expect(() => assertCleanWorkspace(root)).toThrow(/stale .next-e2e include entr(?:y|ies)/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects when free space is below the floor (before the build starts)", () => {
    const root = tempWorkspace();
    try {
      // A floor far above any real volume's free space must reject — and the
      // check is hermetic (default 0 disables it for the other artifact tests).
      expect(() => assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 1_000_000)).toThrow(
        /below the 1000000 GiB floor/
      );
      expect(() => assertCleanWorkspace(root)).not.toThrow(); // floor 0 = disabled
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads the E2E_MIN_FREE_GB env override (default 5, 0 disables, garbage falls back)", () => {
    expect(minFreeGbFromEnv()).toBe(5); // unset → default
    vi.stubEnv("E2E_MIN_FREE_GB", "10");
    expect(minFreeGbFromEnv()).toBe(10);
    vi.stubEnv("E2E_MIN_FREE_GB", "0");
    expect(minFreeGbFromEnv()).toBe(0); // explicit disable
    vi.stubEnv("E2E_MIN_FREE_GB", "garbage");
    expect(minFreeGbFromEnv()).toBe(5); // falls back to the default
    vi.unstubAllEnvs();
  });

  it("E2E_AUTOCLEAN removes leftover dirs + stale tsconfig entries instead of rejecting", () => {
    const root = tempWorkspace();
    // A leftover isolated dist dir + a real Next-rewrite-style stale include
    // entry (own line, quoted — the removable shape).
    mkdirSync(path.join(root, ".data", ".next-e2e-9999"), { recursive: true });
    writeFileSync(
      path.join(root, "tsconfig.json"),
      '{\n  "include": [\n    "next-env.d.ts",\n    "**/*.ts",\n    "**/*.tsx",\n    "/Users/ka/Documents/WorkersArena-freebuff/.data/.next-e2e-4858/dev/dev/types/**/*.ts"\n  ]\n}\n'
    );
    try {
      expect(() =>
        assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 0, true)
      ).not.toThrow();
      // The dir is gone and the tsconfig no longer references .data — the
      // rest of the include array survives, and the dangling trailing comma
      // from the removed last entry is gone too (strict JSON again).
      expect(existsSync(path.join(root, ".data", ".next-e2e-9999"))).toBe(false);
      const fixed = readFileSync(path.join(root, "tsconfig.json"), "utf8");
      expect(fixed).not.toContain(".data");
      expect(fixed).toContain('"**/*.tsx"');
      expect(() => JSON.parse(fixed)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("E2E_AUTOCLEAN also removes the doubled-path tree", () => {
    const root = tempWorkspace();
    mkdirSync(path.join(root, "Users"), { recursive: true });
    try {
      expect(() =>
        assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 0, true)
      ).not.toThrow();
      expect(existsSync(path.join(root, "Users"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects the doubled-path tree under a drive-letter segment (the Windows join artifact)", () => {
    const root = tempWorkspace();
    // On Windows, an absolute NEXT_DIST_DIR joined onto the cwd reproduces the
    // drive prefix as a literal segment — <root>\C:\… — a directory named
    // like "C:" at the root. (The name is legal in a temp dir on any OS, so
    // the case runs cross-platform.)
    mkdirSync(path.join(root, "C:"), { recursive: true });
    try {
      expect(() =>
        assertCleanWorkspace(root, path.join(root, "tsconfig.json"))
      ).toThrow(/doubled-path tree/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("E2E_AUTOCLEAN removes the drive-letter doubled-path tree (win32-cleanable)", () => {
    const root = tempWorkspace();
    mkdirSync(path.join(root, "C:"), { recursive: true });
    try {
      expect(() =>
        assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 0, true)
      ).not.toThrow();
      expect(existsSync(path.join(root, "C:"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("E2E_AUTOCLEAN still rejects a disk floor (nothing to remove)", () => {
    const root = tempWorkspace();
    try {
      expect(() =>
        assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 1_000_000, true)
      ).toThrow(/below the 1000000 GiB floor/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("E2E_AUTOCLEAN logs the freed-space summary tied to the artifact counts", () => {
    const root = tempWorkspace();
    // A leftover dist dir with real content so the delta is measurable, plus
    // a stale tsconfig include line — the summary must tie the freed space to
    // both artifacts.
    const dir = path.join(root, ".data", ".next-e2e-7777");
    mkdirSync(path.join(dir, "dev"), { recursive: true });
    writeFileSync(path.join(dir, "dev", "payload.bin"), Buffer.alloc(5 * 1024 * 1024)); // 5 MiB
    writeFileSync(
      path.join(root, "tsconfig.json"),
      '{\n  "include": [\n    "next-env.d.ts",\n    "**/*.ts",\n    "**/*.tsx",\n    "/Users/ka/Documents/WorkersArena-freebuff/.data/.next-e2e-4858/dev/dev/types/**/*.ts"\n  ]\n}\n'
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 0, true);
      // The human line names what was removed (1 dir + 1 stale line) and the
      // freed delta.
      const summary = warn.mock.calls.find((c) => /autoclean removed/.test(String(c[0])));
      expect(summary).toBeDefined();
      expect(String(summary![0])).toMatch(
        /autoclean removed 1 dir \+ 1 stale tsconfig line, freed [\d.]+ GiB \(\d+\.\d+ → \d+\.\d+ GiB free\)/
      );
      // The machine-readable twin accompanies the human line: one
      // pipe-separated line — freed at 3 decimals, before/after at 2, then the
      // artifact counts (dirs | tsconfig lines).
      const structured = warn.mock.calls.find((c) => /^E2E_AUTOCLEAN_RESULT=/.test(String(c[0])));
      expect(structured).toBeDefined();
      expect(String(structured![0])).toMatch(
        /^E2E_AUTOCLEAN_RESULT=\d+\.\d+\|\d+\.\d+\|\d+\.\d+\|1\|1$/
      );
      expect(existsSync(dir)).toBe(false);
    } finally {
      warn.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("E2E_AUTOCLEAN_RESULT is emitted even when freed is 0.000 (a record per autoclean run)", () => {
    const root = tempWorkspace();
    // An EMPTY leftover dist dir: removing it frees nothing at the 3-decimal
    // GiB granularity (1 MiB), so freed reads 0.000 — but the structured line
    // must still fire so CI sees a record. Only the human freed-summary is
    // skipped (nothing recovered to report).
    const dir = path.join(root, ".data", ".next-e2e-8888");
    mkdirSync(path.join(dir, "dev"), { recursive: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 0, true);
      // Structured line present with 0.000 freed and the dir count.
      const structured = warn.mock.calls.find((c) => /^E2E_AUTOCLEAN_RESULT=/.test(String(c[0])));
      expect(structured).toBeDefined();
      expect(String(structured![0])).toMatch(/^E2E_AUTOCLEAN_RESULT=0\.000\|\d+\.\d+\|\d+\.\d+\|1\|0$/);
      // Human freed-summary skipped — nothing was recovered.
      const summary = warn.mock.calls.find((c) => /autoclean removed/.test(String(c[0])));
      expect(summary).toBeUndefined();
      expect(existsSync(dir)).toBe(false);
    } finally {
      warn.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("autoclean that cannot fully clean still rejects (fail-safe)", () => {
    const root = tempWorkspace();
    // A stale match that is NOT a removable quoted include entry (a comment
    // line) — the tsconfig fix skips it, so the post-fix re-check throws.
    writeFileSync(
      path.join(root, "tsconfig.json"),
      '{\n  // stale: .data/.next-e2e-4858 leftover\n  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]\n}\n'
    );
    try {
      expect(() =>
        assertCleanWorkspace(root, path.join(root, "tsconfig.json"), 0, true)
      ).toThrow(/E2E pre-run check failed/);
      // The comment is still there (untouched by the conservative fix).
      expect(readFileSync(path.join(root, "tsconfig.json"), "utf8")).toContain("// stale:");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

const describeE2E = CHROME ? describe : describe.skip;

describeE2E("E2E hydration smoke", () => {
  let server: ChildProcess | undefined; // dev server (next dev)
  let prodServer: ChildProcess | undefined; // production server (next start)
  let prodBuild: ChildProcess | undefined; // `next build` subprocess (leak guard)
  let browser: Browser | undefined;
  let baseUrl = "";
  let pushConfigured = false; // server exposes a VAPID key → the prompt can render
  // RELATIVE dist dirs on purpose: Next resolves the NEXT_DIST_DIR against
  // the server process's cwd, and an absolute value gets path-joined onto the
  // project root again — producing a doubled `<root>/<root>/.data/.next-e2e-*`
  // tree that filled the disk (43G) before this was discovered. A relative
  // value joins to exactly `<cwd>/.data/.next-e2e-<pid>`.
  const distDir = path.join(".data", `.next-e2e-${process.pid}`);
  const prodDistDir = path.join(".data", `.next-e2e-prod-${process.pid}`);

  // `next dev` / `next build` with NEXT_DIST_DIR rewrite tsconfig.json's
  // include array (Next's TS plugin appends the isolated dist-dir type paths
  // as absolute, machine-specific entries). Back up the original in beforeAll
  // and restore it in afterAll so a test run can't leave the shared config
  // polluted — every run used to accumulate dozens of `.data/.next-e2e-*`
  // include entries.
  const tsconfigPath = path.join(process.cwd(), "tsconfig.json");
  let tsconfigBackup: string | undefined;

  const nextBin = ["node_modules/next/dist/bin/next", "node_modules/.bin/next"]
    .map((p) => path.join(process.cwd(), p))
    .find((p) => existsSync(p));

  const notes: string[] = [];
  const pushNote = (line: string) => {
    notes.push(line);
    if (notes.length > 300) notes.splice(0, notes.length - 300);
  };

  /** Restore the shared tsconfig.json (sync, best-effort, idempotent). Shared
   * by afterAll AND the process-exit/signal guard installed in beforeAll — a
   * hard-killed run (Ctrl-C / CI timeout) never reaches afterAll, so the guard
   * is the finally that keeps the include array from staying polluted. */
  const restoreTsconfig = () => {
    if (tsconfigBackup === undefined) return;
    try {
      if (readFileSync(tsconfigPath, "utf8") !== tsconfigBackup) {
        writeFileSync(tsconfigPath, tsconfigBackup);
        pushNote("[tsconfig] restored original tsconfig.json include entries");
      }
    } catch (err) {
      pushNote(`[tsconfig] restore skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  /** Spawn a server (dev or start) in its own process group, teeing output. */
  function spawnServer(args: string[], env: Record<string, string>): ChildProcess {
    if (!nextBin) throw new Error("next binary not found");
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      // DEMO_MODE=true wins over any .env value (existing env > .env), and
      // NEXT_DIST_DIR keeps this server's cache out of the shared .next.
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", DEMO_MODE: "true", ...env },
      // Own process group so teardown can kill the whole tree (next's CLI
      // spawns a child server process that SIGTERM-on-the-parent misses).
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d: Buffer) => pushNote(`[server] ${d.toString().trimEnd()}`));
    child.stderr?.on("data", (d: Buffer) => pushNote(`[server] ${d.toString().trimEnd()}`));
    child.on("exit", (code) => pushNote(`[server-exit] code=${code}`));
    return child;
  }

  /** SIGTERM then SIGKILL the whole process group, waiting between. */
  async function stopServer(child: ChildProcess | undefined): Promise<void> {
    if (!child || child.exitCode !== null || !child.pid) return;
    try {
      process.kill(-child.pid, "SIGTERM"); // whole process group
    } catch {
      child.kill("SIGTERM");
    }
    await new Promise((r) => setTimeout(r, 3000));
    if (child.exitCode === null && child.pid) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }
  }

  beforeAll(
    async () => {
      // Pre-run hardening: reject fast if a crashed run left the doubled-path
      // tree, leftover isolated dist dirs, or stale tsconfig include entries
      // (see assertCleanWorkspace) — silently proceeding is how the disk
      // filled to 127MiB free. Also enforce the free-disk floor (default 5
      // GiB, E2E_MIN_FREE_GB override, 0 disables) before the build starts.
      // E2E_AUTOCLEAN=1 makes the check remove the crash artifacts itself
      // (after printing them) instead of rejecting — for CI convenience.
      assertCleanWorkspace(
        process.cwd(),
        tsconfigPath,
        minFreeGbFromEnv(),
        process.env.E2E_AUTOCLEAN === "1"
      );
      tsconfigBackup = readFileSync(tsconfigPath, "utf8");

      // Finally-like guard for hard kills: afterAll only runs on a clean
      // teardown, so restore the shared tsconfig on normal process exit AND
      // on SIGINT/SIGTERM (Ctrl-C / CI timeout) before re-raising the signal
      // (shared with the unit test in tests/signal-guard.test.ts, which
      // proves the restore runs before exit). restoreTsconfig is idempotent,
      // so the afterAll restore + this guard can never double-write or fight
      // each other.
      installSignalGuard(restoreTsconfig);

      const port = await freePort();
      baseUrl = `http://${HOST}:${port}`;

      server = spawnServer([nextBin!, "dev", "-p", String(port), "--hostname", HOST], {
        NEXT_DIST_DIR: distDir,
        // Hermetic demo stores: the interaction pass writes activity entries and
        // may touch push subscriptions — keep them in the isolated dist dir so
        // the live preview's .data/ feeds are never polluted.
        ADMIN_ACTIVITY_FILE: path.join(distDir, "activity.json"),
        PUSH_STORE_FILE: path.join(distDir, "push-subscriptions.json"),
        // Pin the SIMULATED payment provider (an empty string beats a shell
        // STRIPE_SECRET_KEY, and Next only loads .env for keys not already
        // set): the deposit path in runBookingFlow completes via the local
        // /api/payments/simulate checkout — it must never mint a real Stripe
        // URL. The prod matrix skips the deposit path instead (the simulated
        // provider is refused under NODE_ENV=production).
        STRIPE_SECRET_KEY: "",
      });

      await waitForServer(`${baseUrl}/`, 120_000);

      browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: true,
        // --no-sandbox is required in root/container CI contexts (harmless on
        // macOS); --disable-gpu stabilizes headless rendering.
        args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
      });

      // Is Web Push configured here? If so, grant notification permission
      // (headless Chrome defaults to "denied", which would hide the onboarding
      // prompt) so the homepage banner can reach the "idle" state and render.
      try {
        const res = await fetch(`${baseUrl}/api/push/vapid-public-key`);
        if (res.ok) {
          const { publicKey } = (await res.json()) as { publicKey?: string };
          pushConfigured = Boolean(publicKey);
        }
      } catch {
        pushConfigured = false;
      }
      if (pushConfigured) {
        await browser.defaultBrowserContext().overridePermissions(new URL(baseUrl).origin, [
          "notifications",
        ]);
      }
    },
    180_000
  );

  afterAll(
    async () => {
      // finally-like teardown: every step runs even if an earlier one throws
      // (allSettled), the dist-dir cleanup is failure-isolated, and the
      // tsconfig restore is guaranteed to run last — nothing a test failure
      // can do here leaves servers, dist dirs, or the shared config behind.
      await Promise.allSettled([
        browser?.close(),
        stopServer(server),
        stopServer(prodServer),
        stopServer(prodBuild), // belt-and-suspenders if the build hung
      ]);
      try {
        rmSync(distDir, { recursive: true, force: true });
        rmSync(prodDistDir, { recursive: true, force: true });
      } catch (err) {
        pushNote(`[dist-cleanup] skipped: ${err instanceof Error ? err.message : String(err)}`);
      }
      restoreTsconfig();
    },
    60_000
  );

  /**
   * Wire the page's console + page errors into the shared issue collector.
   * In production (strict), console messages matching prod runtime-error
   * signatures (minified React errors, uncaught JS) also fail — dev keeps
   * those as notes because the dev build emits them verbosely.
   */
  function attachCollectors(page: Page, issues: string[], strict = false) {
    page.on("console", (msg) => {
      const text = msg.text();
      const kind = strict ? classifyStrict(text) : classify(text);
      (kind === "note" ? notes : issues).push(`[console.${msg.type()}] ${text}`);
    });
    page.on("pageerror", (err: unknown) =>
      issues.push(`[pageerror] ${err instanceof Error ? err.message : String(err)}`)
    );
  }

  /**
   * Visit every spec × locale: set the SSR locale cookie (and the session
   * cookie only when the route needs one — public routes must render as true
   * visitors, so any stale session from a previous route is dropped), then
   * assert SSR language/direction, non-trivial content, no error overlay, and
   * (for the homepage when push is configured) the onboarding banner.
   */
  async function visitRoutes(
    page: Page,
    specs: RouteSpec[],
    issues: string[],
    opts: { pushConfigured?: boolean; baseUrl?: string; mode?: "dev" | "prod" } = {}
  ) {
    for (const spec of specs) {
      for (const locale of LOCALES) {
        await page.setCookie(
          { name: "wa_locale", value: locale, domain: HOST, path: "/" },
          // Theme cookie is HOST-scoped (not port-scoped) — pin light so a
          // dark theme left by an earlier same-host pass (or the interaction
          // flow) can't boot a later server's matrix in dark and make its
          // render unrepresentative. The matrix itself is theme-agnostic.
          { name: "wa_theme", value: "light", domain: HOST, path: "/" }
        );
        if (spec.role) {
          await page.setCookie({
            name: "wa_session",
            value: encodeURIComponent(JSON.stringify(SESSIONS[spec.role])),
            domain: HOST,
            path: "/",
          });
        } else {
          // Drop any session left over from a previous route.
          await page.deleteCookie({ name: "wa_session", domain: HOST, path: "/" });
        }

        // The refund-email preview check needs a REFUNDED campaign payment in
        // the store BEFORE the page loads (the demo store seeds none) — seed
        // once per server before navigating to /admin, so the SSR render the
        // browser receives already carries the refunded row + Preview button.
        if (spec.expectRefundEmailPreview) {
          await seedRefundedCampaign(opts.baseUrl ?? baseUrl);
        }

        const url = `${opts.baseUrl ?? baseUrl}/${spec.path}`;
        await page.goto(url, { waitUntil: "load", timeout: 120_000 });
        // Give React time to hydrate and (if broken) emit warnings.
        await new Promise((r) => setTimeout(r, 2000));

        const expectedTitle = locale === "ar" ? "لا تفوّت أي تحديث" : "Never miss an update";

        const state = await page.evaluate(
          (title) => ({
            pathname: location.pathname,
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            text: document.body.innerText,
            // Next's dev error overlay / prod error page markers — a server
            // crash would otherwise pass the other assertions silently.
            errorOverlay: /Unhandled Runtime Error|Internal Server Error|Application error/i.test(
              document.body.innerText
            ),
            // The onboarding banner carries aria-live and the localized title.
            bannerVisible: [...document.querySelectorAll<HTMLElement>("[aria-live]")].some((el) =>
              Boolean(el.textContent?.includes(title))
            ),
            // Prod-only: CSS/JS bundles must actually be present — a missing
            // stylesheet or chunk renders unstyled/static HTML silently.
            styleSheets: document.styleSheets.length,
            scriptBundles: document.querySelectorAll('script[src^="/_next/static/"]').length,
          }),
          expectedTitle
        );

        // The route rendered under the right SSR language (no redirect away,
        // no auth failure), so the console result is meaningful.
        expect(state.pathname).toBe(`/${spec.path}`);
        expect(state.lang).toBe(locale);
        expect(state.dir).toBe(locale === "ar" ? "rtl" : "ltr");
        expect(state.text.length).toBeGreaterThan(100);
        expect(state.errorOverlay, `error overlay on /${spec.path} (${locale})`).toBe(false);

        if (opts.mode === "prod") {
          // Prod emits real <link>/<style> CSS and /_next/static JS chunks —
          // if either is missing the page silently renders wrong.
          expect(state.styleSheets, `stylesheet on /${spec.path} (${locale})`).toBeGreaterThan(0);
          expect(state.scriptBundles, `JS bundle on /${spec.path} (${locale})`).toBeGreaterThan(0);
        }

        if (spec.expectText) {
          const anchor = spec.expectText[locale === "ar" ? 1 : 0];
          expect(state.text, `content anchor on /${spec.path} (${locale})`).toContain(anchor);
        }

        if (spec.expectSlaBar) {
          // The countdown's progressbar is SSR-rendered (the rows render from
          // the server's nowSeed), so it's in the DOM right after load — find
          // it by its localized "Request auto-expiry" aria-label, assert a
          // numeric aria-valuenow (the bar drained/filled), and require the
          // ticking countdown copy on the page.
          const slaTitle = locale === "ar" ? "انتهاء صلاحية الطلب تلقائياً" : "Request auto-expiry";
          const slaCopySrc = locale === "ar" ? "س \\d+ د" : "Auto-cancels in \\d+h \\d+m";
          const sla = await page.evaluate(
            (title, copySrc) => {
              const bars = [...document.querySelectorAll<HTMLElement>('[role="progressbar"]')];
              const bar = bars.find((b) => (b.getAttribute("aria-label") ?? "").includes(title));
              const raw = bar ? bar.getAttribute("aria-valuenow") : null;
              const num = raw === null ? null : Number(raw);
              return {
                bar: Boolean(bar),
                now: num !== null && Number.isFinite(num) ? num : null,
                copy: new RegExp(copySrc).test(document.body.innerText),
              };
            },
            slaTitle,
            slaCopySrc
          );
          expect(sla.bar, `compact SLA countdown bar on /${spec.path} (${locale})`).toBe(true);
          expect(sla.now, `SLA bar aria-valuenow on /${spec.path} (${locale})`).not.toBeNull();
          expect(sla.copy, `SLA countdown copy on /${spec.path} (${locale})`).toBe(true);
        }

        if (spec.pushPrompt && opts.pushConfigured) {
          // The banner mounts only after client effects (SW registration +
          // VAPID fetch + framer-motion entry). Poll up to ~10s so a slow CI
          // machine can't turn a late mount into a spurious failure.
          let visible = state.bannerVisible;
          for (let i = 0; !visible && i < 10; i++) {
            await new Promise((r) => setTimeout(r, 1000));
            visible = await page.evaluate(
              (title) =>
                [...document.querySelectorAll<HTMLElement>("[aria-live]")].some((el) =>
                  Boolean(el.textContent?.includes(title))
                ),
              expectedTitle
            );
          }
          expect(
            visible,
            `push onboarding banner on /${spec.path} (${locale})`
          ).toBe(true);
        }

        if (spec.expectRefundEmailPreview) {
          // The /admin campaign-payments card only renders the refund-email
          // Preview button on a REFUNDED purchase — the seed ran before the
          // navigation above; now open the dialog and assert the sandboxed
          // iframe renders the email in the PAGE locale — the exact
          // bilingual-preview bug 6420952 fixed.
          await assertRefundEmailPreviewDialog(page, locale);
        }

        pushNote(`[ok] /${spec.path} (${locale}) ${state.dir} · ${state.text.length} chars`);
      }
    }
  }

  /** Seeded-server cache — the refunded campaign is created once per server
   * (the demo store is in-memory per process; the prod matrix boots its own
   * server with a fresh store, so it seeds itself too). */
  const seededRefundServers = new Set<string>();

  /** POST the demo-only seed route (create → confirm → refund via the real
   * seams) so the /admin payments card has a refunded row to preview. */
  async function seedRefundedCampaign(seedBaseUrl: string): Promise<void> {
    if (seededRefundServers.has(seedBaseUrl)) return;
    const res = await fetch(`${seedBaseUrl}/api/dev/seed-refunded-campaign`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`seed-refunded-campaign failed: ${res.status} ${await res.text()}`);
    }
    seededRefundServers.add(seedBaseUrl);
    pushNote(`[seed-refunded] ${seedBaseUrl} → refunded campaign ready`);
  }

  /**
   * Open the refund-email preview dialog on the /admin campaign-payments card
   * and assert its sandboxed iframe renders the email in `locale` (EN shows
   * the English copy, AR the Arabic copy — never always-EN). The dialog is a
   * Radix portal; the email HTML is a sandboxed iframe (sandbox="" — no
   * scripts), so the copy is read via the iframe's srcdoc attribute.
   */
  async function assertRefundEmailPreviewDialog(page: Page, locale: "en" | "ar"): Promise<void> {
    const en = locale === "en";
    // The campaign-payments table renders the campaign name per locale (EN
    // keeps the English name; AR shows the Arabic name), so scope the row
    // match to BOTH — the seeded campaign's name is the same in either.
    const campaignName = en ? "E2E Refunded Campaign" : "حملة مستردة تجريبية";
    const previewLabel = en ? "Preview email" : "معاينة البريد";
    // The email always embeds BOTH languages (primary block + the other
    // language's secondary block), so the RELIABLE primary-locale marker is
    // the root <html lang dir> attribute the renderer stamps per locale —
    // the same attribute the dialog picks the srcdoc from. The refund card +
    // CTA markers then confirm the copy actually rendered in that locale.
    const htmlLang = en ? 'lang="en" dir="ltr"' : 'lang="ar" dir="rtl"';
    const cardMarker = en ? "Refund details" : "تفاصيل الاسترداد";
    const ctaMarker = en ? "View your campaigns" : "عرض حملاتك";

    // The Preview button renders only on the REFUNDED row — wait for the
    // seeded campaign to appear (SSR'd after the seed, which ran before the
    // navigation). NOTE: the trigger's textContent includes the Mail icon SVG's
    // path data, so match by INCLUDES + the refunded row's campaign name —
    // never exact.
    await waitFor(
      page,
      `[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').includes('${previewLabel}') && (b.closest('tr')?.textContent ?? '').includes('${campaignName}'))`,
      `refunded-row preview button (${locale})`
    );
    // Settle for hydration before the click (the button exists in SSR HTML;
    // a pre-hydration click would silently no-op).
    await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
    await page.evaluate(
      (label, name) => {
        const btn = [...document.querySelectorAll("button")].find(
          (b) =>
            (b.textContent ?? "").includes(label) &&
            (b.closest("tr")?.textContent ?? "").includes(name)
        );
        if (!(btn instanceof HTMLButtonElement)) throw new Error(`preview button not found: ${label}`);
        btn.click();
      },
      previewLabel,
      campaignName
    );
    // The dialog + its iframe mount in a portal after the click.
    await waitFor(
      page,
      "document.querySelector('[role=dialog] iframe') !== null",
      `email preview dialog iframe (${locale})`
    );

    const iframe = await page.evaluate(() => {
      const el = document.querySelector('[role="dialog"] iframe');
      return el ? (el as HTMLIFrameElement).srcdoc : null;
    });
    expect(iframe, `preview iframe srcdoc on /admin (${locale})`).not.toBeNull();
    // The html lang/dir attribute IS the locale the dialog rendered — the
    // always-EN bug renders lang="en" even when the page locale is ar.
    expect(iframe!, `preview html locale on /admin (${locale})`).toContain(htmlLang);
    expect(iframe!, `preview copy primary-locale marker on /admin (${locale})`).toContain(cardMarker);
    expect(iframe!, `preview CTA in the page locale on /admin (${locale})`).toContain(ctaMarker);
    pushNote(`[preview-dialog] /admin (${locale}) → ${en ? "EN" : "AR"} email copy asserted in the sandboxed iframe`);
  }

  /**
   * Poll `page.evaluate(fn)` until truthy. `fn` is a raw expression string
   * (predicates can't be closures — they run in the page). Tolerant of the
   * execution-context destruction that a `location.reload()` causes.
   */
  async function waitFor(page: Page, fn: string, label: string, timeoutMs = 20_000): Promise<void> {
    const start = Date.now();
    for (;;) {
      const ok = await page.evaluate(fn).catch(() => false);
      if (ok) return;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /**
   * Run the route matrix on a fresh page with strict context capture. Any
   * assertion failure inside the loop rethrows WITH the collected console
   * errors + notes appended, and the page is always closed (finally), so a
   * mid-matrix failure is diagnosable and never leaks a page handle.
   */
  async function runMatrix(
    specs: RouteSpec[],
    opts: { pushConfigured?: boolean; baseUrl?: string; mode?: "dev" | "prod" } = {},
    strict = false
  ): Promise<void> {
    const issues: string[] = [];
    const page: Page = await browser!.newPage();
    try {
      attachCollectors(page, issues, strict);
      await visitRoutes(page, specs, issues, opts);
    } catch (err) {
      throw new Error(
        [
          err instanceof Error ? err.message : String(err),
          "",
          "--- collected console/page errors ---",
          ...issues,
          "--- context ---",
          ...notes,
        ].join("\n")
      );
    } finally {
      await page.close();
    }
    expect(
      issues,
      `E2E failures:\n${issues.join("\n")}\n\n--- context ---\n${notes.join("\n")}`
    ).toEqual([]);
  }

  it(
    "visits /admin /admin/bookings/BK-1001 /dashboard /company /notifications in EN + AR with zero hydration errors (compact SLA countdown bar content-checked on /dashboard; refund-email preview dialog iframe content-checked in the page locale on /admin)",
    async () => {
      await runMatrix(ROUTES, { pushConfigured });
    },
    300_000
  );

  it(
    "visits / /search /bookings /workers/:slug /auth/login in EN + AR with zero hydration errors (push prompt + /bookings SLA countdown bar content-checked)",
    async () => {
      await runMatrix(PUBLIC_ROUTES, { pushConfigured });
    },
    300_000
  );

  /**
   * Worker subscription renewal (any locale): open the dialog from the
   * dashboard, pick a plan, submit, and assert — in order — the renewal toast,
   * the subscription card's plan badge, the new invoice in the invoices card,
   * and the fired inbox notification. The page must already carry the worker
   * session for the target locale.
   */
  async function runRenewal(
    page: Page,
    opts: { baseUrl: string; plan: "basic" | "professional" | "premium" | "enterprise"; locale: "en" | "ar" }
  ): Promise<void> {
    const { baseUrl: b, plan, locale } = opts;
    // Tightly keyed so a typo'd plan fails at compile time, not at runtime.
    const planEn: Record<typeof plan, string> = { basic: "Basic", professional: "Professional", premium: "Premium", enterprise: "Enterprise" };
    const planAr: Record<typeof plan, string> = { basic: "أساسية", professional: "احترافية", premium: "مميزة", enterprise: "مؤسسات" };
    const label = locale === "ar" ? planAr[plan] : planEn[plan];
    const triggerLabel = locale === "ar" ? "جدّد الآن" : "Renew now";
    const toastText = locale === "ar" ? "تم التجديد" : "Subscription renewed — active for";
    const invoiceDesc = locale === "ar" ? `اشتراك ${label} — خالد الحربي` : `${label} subscription — Khaled Al-Harbi`;
    const notifText = locale === "ar" ? `تم تجديد الاشتراك — ${plan}` : `Subscription renewed — ${plan}`;

    await page.goto(`${b}/dashboard`, { waitUntil: "load", timeout: 120_000 });
    // The trigger exists in SSR HTML before React hydrates; a pre-hydration
    // click would silently no-op. Settle briefly so the onClick is attached.
    await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
    // Open the renewal dialog — first exact-match trigger is fine: every
    // RenewDialog instance (expired/expiring banners, subscription card) opens
    // the same dialog content.
    await waitFor(
      page,
      `[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').trim() === '${triggerLabel}')`,
      `renew dialog trigger (${locale})`
    );
    await page.evaluate((label) => {
      const btn = [...document.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === label);
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`renew trigger not found: ${label}`);
      btn.click();
    }, triggerLabel);
    await waitFor(page, "document.querySelector('[role=dialog]') !== null", "renew dialog open");

    // Pick the plan (its row's label), then submit via the dialog's own button.
    await page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      const btn = [...(dialog?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").includes(label));
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`plan button not found: ${label}`);
      btn.click();
    }, label);
    await page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      const btn = [...(dialog?.querySelectorAll("button") ?? [])].find((b) => (b.textContent ?? "").trim() === label);
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`renew submit not found: ${label}`);
      btn.click();
    }, triggerLabel);

    // Toast (auto-dismisses ~4s) → plan badge → new invoice → inbox notification.
    await waitFor(page, `document.body.innerText.includes('${toastText}')`, "renewal toast");
    await waitFor(
      page,
      `[...document.querySelectorAll('span')].some(s => (s.textContent ?? '').trim() === '${label}')`,
      "subscription card plan badge"
    );
    await waitFor(page, `document.body.innerText.includes('${invoiceDesc}')`, "invoice card shows the new invoice");
    await page.goto(`${b}/notifications`, { waitUntil: "load", timeout: 120_000 });
    await waitFor(page, `document.body.innerText.includes('${notifText}')`, "renewal notification in inbox");
  }

  /**
   * Real mouse click on the first element matching a text predicate. Radix
   * Tabs deliberately IGNORES synthetic element.click() (event.detail === 0
   * → it preventDefaults and never selects), so switching tabs in tests needs
   * a genuine pointer-level click at the element's coordinates.
   */
  async function clickTab(page: Page, text: string): Promise<boolean> {
    const point = await page
      .evaluate((pred) => {
        const el = [...document.querySelectorAll('[role="tab"]')].find((x) =>
          (x.textContent ?? "").includes(pred)
        );
        if (!(el instanceof HTMLElement)) return null;
        // Scroll the tab into view first: the dashboard's panel can sit below
        // the fold in the headless viewport, and a mouse click at coordinates
        // outside the viewport silently no-ops — the tab never activates and
        // waitForUpcomingBadge times out with the tab stuck inactive.
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, text)
      .catch(() => null);
    if (!point) return false;
    await page.mouse.click(point.x, point.y);
    return true;
  }

  /**
   * Snapshot the open booking dialog (or its absence) for failure diagnosis:
   * which step it's on, how many slot chips render, whether any are enabled,
   * and the input values. Attached to waitFor timeouts in runBookingFlow so a
   * flake reports WHAT the dialog showed instead of just a bare timeout.
   */
  async function dumpDialogState(page: Page, label: string): Promise<string> {
    const state = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { open: false };
      const chips = [...dialog.querySelectorAll("button[aria-pressed]")].map((b) => ({
        text: (b.textContent ?? "").trim().slice(0, 30),
        disabled: (b as HTMLButtonElement).disabled,
      }));
      return {
        open: true,
        chipCount: chips.length,
        enabledChips: chips.filter((c) => !c.disabled).length,
        chips: chips.slice(0, 10),
        inputs: [...dialog.querySelectorAll("input")].map((i) => ({
          placeholder: (i as HTMLInputElement).placeholder,
          value: (i as HTMLInputElement).value.slice(0, 40),
        })),
        text: (dialog.textContent ?? "").slice(0, 500),
      };
    });
    const line = `[booking:${label}] dialog=${JSON.stringify(state)}`;
    pushNote(line);
    return line;
  }

  /**
   * Fill a React-controlled input with a real value (native setter + input
   * event — the standard trick for controlled components; puppeteer's type()
   * would also work but this is deterministic and instant).
   */
  async function setInput(page: Page, selector: string, value: string): Promise<void> {
    const ok = await page.evaluate(
      (sel, val) => {
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLInputElement)) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
        setter.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      },
      selector,
      value
    );
    if (!ok) throw new Error(`setInput: input not found (${selector})`);
  }

  /**
   * Real mouse click at the center of the first element matching a CSS
   * selector. Radix controls deliberately ignore synthetic element.click()
   * (event.detail === 0 → they preventDefault and never fire), so toggles
   * like the RespondDialog's deposit Switch need a genuine pointer-level
   * click (same rationale as clickTab).
   */
  async function clickAtSelector(page: Page, selector: string, label: string): Promise<void> {
    const point = await page
      .evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLElement)) return null;
        el.scrollIntoView({ block: "center" });
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, selector)
      .catch(() => null);
    if (!point) throw new Error(`${label} not found (${selector})`);
    await page.mouse.click(point.x, point.y);
  }

  /**
   * Click-and-poll the BookingsPanel's Upcoming tab until the VISIBLE panel
   * shows the row for `jobTitle` with `badge` (e.g. "Confirmed"/"Payment
   * required"). The accept's router.refresh() re-renders the panel and resets
   * it to the default (Requests) tab, so a single Upcoming click right after
   * can land on pre-refresh DOM and be lost. Radix keeps inactive panels in
   * the DOM but hidden — the visible-panel check is what makes this
   * deterministic, and the click keeps being re-issued until the panel agrees.
   */
  async function waitForUpcomingBadge(
    page: Page,
    opts: { jobTitle: string; badge: string; tab: string; locale: string }
  ): Promise<void> {
    const { jobTitle, badge, tab, locale } = opts;
    const deadline = Date.now() + 20_000;
    for (;;) {
      const shown = await page
        .evaluate(
          (title, b) => {
            const panel = [...document.querySelectorAll('[role="tabpanel"]')].find(
              (p) => !(p as HTMLElement).hidden && (p as HTMLElement).offsetParent !== null
            );
            return Boolean(panel?.textContent?.includes(title) && panel.textContent.includes(b));
          },
          jobTitle,
          badge
        )
        .catch(() => false);
      if (shown) return;
      await clickTab(page, tab);
      await new Promise((r) => setTimeout(r, 300));
      if (Date.now() > deadline) {
        const panelState = await page
          .evaluate(() => {
            const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => ({
              text: (t.textContent ?? "").trim().slice(0, 40),
              state: (t as HTMLElement).getAttribute("data-state"),
            }));
            const panels = [...document.querySelectorAll('[role="tabpanel"]')].map((p) => ({
              hidden: (p as HTMLElement).hidden,
              text: (p.textContent ?? "").slice(0, 300),
            }));
            return { tabs, panels };
          })
          .catch(() => "<evaluate failed>");
        throw new Error(
          `booking ${badge} on worker dashboard (${locale}) — panel state: ${JSON.stringify(panelState)}`
        );
      }
    }
  }

  /**
   * The booking request→accept loop (docs/booking-scheduling.md M1), run in
   * one locale against any server:
   *   1. Worker: /dashboard → "Generate slots" (M2) so a fresh slot exists.
   *   2. Guest: /workers/khaled-al-harbi-plumbing → Request a booking dialog,
   *      type a job title (step 1) → pick the first available slot (step 2)
   *      → name + phone (step 3) → send. Assert the success state.
   *   3. Worker: /dashboard → the new REQUESTED row appears in the Requests
   *      tab → Respond dialog → Accept (deposit mode also toggles the
   *      "Require deposit" switch and enters an amount) → assert the toast.
   *   4. Worker: the booking moves to Upcoming — Confirmed (plain accept) or
   *      Payment required (deposit accepted, awaiting the M3 checkout).
   *   5. Guest: /bookings?phone=… → Confirmed (plain) — or, in deposit mode,
   *      Payment required → "Pay now" → the simulated checkout redirects to
   *      /bookings?paid=1 → Confirmed.
   *   6. Deposit mode: back on /dashboard the worker's Upcoming tab shows
   *      Confirmed too — both sides updated once the payment lands.
   * Each locale uses a distinct name/phone/jobTitle so the row and the phone
   * lookup stay uniquely identifiable across runs on the same server.
   */
  async function runBookingFlow(
    page: Page,
    opts: { baseUrl: string; locale: "en" | "ar"; deposit?: boolean }
  ): Promise<void> {
    const { baseUrl: b, locale, deposit = false } = opts;
    const en = locale === "en";
    const name = en ? "E2E Customer" : "عميل تجريبي";
    const phone = en ? "+966 50 111 2222" : "+966 50 333 4444";
    const jobTitle = en ? "E2E leak fix request" : "طلب إصلاح تسريب تجريبي";
    const nextLabel = en ? "Next" : "التالي";
    const sendLabel = en ? "Send booking request" : "إرسال طلب الحجز";
    const successText = en ? "Request sent!" : "تم إرسال الطلب!";
    const respondLabel = en ? "Respond to request" : "الرد على الطلب";
    const acceptLabel = en ? "Accept booking" : "قبول الحجز";
    const acceptedToast = en ? "Booking accepted" : "تم قبول الحجز";
    const generateLabel = en ? "Generate slots" : "إنشاء المواعيد";
    const generatedToast = en ? "slots generated" : "موعداً";
    const upcomingTab = en ? "Upcoming" : "القادمة";
    const confirmedBadge = en ? "Confirmed" : "مؤكد";
    const paymentRequiredBadge = en ? "Payment required" : "الدفع مطلوب";
    const payNowLabel = en ? "Pay now" : "ادفع الآن";
    const depositPlaceholder = en ? "e.g. 50" : "مثال: 50";
    const namePlaceholder = en ? "Full name" : "الاسم الكامل";
    const dialogSel = '[role="dialog"]';

    // ── 1. Worker: materialize the weekly template so a slot exists ────────
    await page.setCookie(
      { name: "wa_locale", value: locale, domain: HOST, path: "/" },
      {
        name: "wa_session",
        value: encodeURIComponent(JSON.stringify(SESSIONS.worker)),
        domain: HOST,
        path: "/",
      }
    );
    await page.goto(`${b}/dashboard`, { waitUntil: "load", timeout: 120_000 });
    await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
    await waitFor(
      page,
      `[...document.querySelectorAll('button')].some(x => (x.textContent ?? '').includes('${generateLabel}'))`,
      `generate slots button (${locale})`
    );
    await page.evaluate((label) => {
      const btn = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes(label));
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`generate slots button not found: ${label}`);
      btn.click();
    }, generateLabel);
    await waitFor(page, `document.body.innerText.includes('${generatedToast}')`, "generate slots toast");

    // ── 2. Guest books the first available slot ────────────────────────────
    await page.deleteCookie({ name: "wa_session", domain: HOST, path: "/" });
    await page.goto(`${b}/workers/khaled-al-harbi-plumbing`, { waitUntil: "load", timeout: 120_000 });
    await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
    const requestLabel = en ? "Request a booking" : "اطلب حجزاً";
    await waitFor(
      page,
      `[...document.querySelectorAll('button')].some(x => (x.textContent ?? '').includes('${requestLabel}'))`,
      `booking dialog trigger (${locale})`
    );
    await page.evaluate((label) => {
      const btn = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").includes(label));
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`booking trigger not found: ${label}`);
      btn.click();
    }, requestLabel);
    await waitFor(page, `document.querySelector('${dialogSel}') !== null`, "booking dialog open");

    // Step 1 — job title (the dialog has exactly one input here).
    await setInput(page, `${dialogSel} input`, jobTitle);
    await page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      const btn = [...(dialog?.querySelectorAll("button") ?? [])].find((x) => (x.textContent ?? "").trim() === label);
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`next button not found: ${label}`);
      btn.click();
    }, nextLabel);

    // Step 2 — first AVAILABLE slot chip (slot chips carry aria-pressed).
    // NOTE: this predicate runs in the BROWSER as plain JS — no TS `as` casts
    // allowed inside the evaluate string (esbuild strips casts in code
    // position but NOT inside template-literal content, and the raw `as` is a
    // SyntaxError in Chrome → waitFor would silently poll until timeout).
    try {
      await waitFor(
        page,
        `[...document.querySelectorAll('${dialogSel} button[aria-pressed]')].some(x => !x.disabled)`,
        `an available slot chip (${locale})`
      );
    } catch (err) {
      const diag = await dumpDialogState(page, `${locale} slot-step`);
      throw new Error(`${err instanceof Error ? err.message : String(err)}\n${diag}`);
    }
    await page.evaluate(() => {
      const chip = [...document.querySelectorAll('[role="dialog"] button[aria-pressed]')].find(
        (x) => !(x as HTMLButtonElement).disabled
      );
      if (!(chip instanceof HTMLButtonElement)) throw new Error("no available slot chip");
      chip.click();
    });
    await page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      const btn = [...(dialog?.querySelectorAll("button") ?? [])].find((x) => (x.textContent ?? "").trim() === label);
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`next button not found: ${label}`);
      btn.click();
    }, nextLabel);

    // Step 3 — name + phone (inputs are name, phone, email in DOM order).
    await waitFor(
      page,
      `document.querySelectorAll('${dialogSel} input').length >= 2`,
      "details step inputs"
    );
    await setInput(page, `${dialogSel} input[placeholder="${namePlaceholder}"]`, name);
    await setInput(page, `${dialogSel} input[dir="ltr"]`, phone);
    await page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      const btn = [...(dialog?.querySelectorAll("button") ?? [])].find((x) => (x.textContent ?? "").includes(label));
      if (!(btn instanceof HTMLButtonElement)) throw new Error(`send button not found: ${label}`);
      btn.click();
    }, sendLabel);
    await waitFor(page, `document.body.innerText.includes('${successText}')`, "booking success state");

    // ── 3. Worker accepts via the Respond dialog ────────────────────────────
    await page.setCookie({
      name: "wa_session",
      value: encodeURIComponent(JSON.stringify(SESSIONS.worker)),
      domain: HOST,
      path: "/",
    });
    await page.goto(`${b}/dashboard`, { waitUntil: "load", timeout: 120_000 });
    await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
    const respondForRow = `[...document.querySelectorAll('button')].some(x => (x.textContent ?? '').trim() === '${respondLabel}' && (x.closest('.overflow-hidden')?.textContent ?? '').includes('${jobTitle}'))`;
    await waitFor(page, respondForRow, `respond button for ${jobTitle} (${locale})`);
    await page.evaluate(
      (label, title) => {
        const btn = [...document.querySelectorAll("button")].find(
          (x) =>
            (x.textContent ?? "").trim() === label &&
            (x.closest(".overflow-hidden")?.textContent ?? "").includes(title)
        );
        if (!(btn instanceof HTMLButtonElement)) throw new Error(`respond button not found: ${label}`);
        btn.click();
      },
      respondLabel,
      jobTitle
    );
    await waitFor(page, `document.querySelector('${dialogSel}') !== null`, "respond dialog open");
    if (deposit) {
      // Deposit path (M3): toggle the "Require deposit" switch, then enter an
      // amount — the submit stays disabled until a deposit is set. The switch
      // is a Radix control, so click it with a real pointer event.
      await waitFor(
        page,
        `document.querySelector('${dialogSel} button[role="switch"]') !== null`,
        "deposit switch in respond dialog"
      );
      // Settle for the dialog's Radix open animation before the click.
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await clickAtSelector(page, `${dialogSel} button[role="switch"]`, "deposit switch");
      await waitFor(
        page,
        `document.querySelector('${dialogSel} input[placeholder="${depositPlaceholder}"]') !== null`,
        "deposit amount input"
      );
      await setInput(page, `${dialogSel} input[placeholder="${depositPlaceholder}"]`, "50");
    }
    // The submit button shares its label with the accept-mode toggle — the
    // submit is the LAST match in the dialog.
    await page.evaluate((label) => {
      const dialog = document.querySelector('[role="dialog"]');
      const btns = [...(dialog?.querySelectorAll("button") ?? [])].filter(
        (x) => (x.textContent ?? "").trim() === label
      );
      const submit = btns.at(-1);
      if (!(submit instanceof HTMLButtonElement)) throw new Error(`accept submit not found: ${label}`);
      submit.click();
    }, acceptLabel);
    await waitFor(page, `document.body.innerText.includes('${acceptedToast}')`, "accepted toast");

    // ── 4. The booking moved to Upcoming (badge depends on the accept) ──────
    await waitForUpcomingBadge(page, {
      jobTitle,
      badge: deposit ? paymentRequiredBadge : confirmedBadge,
      tab: upcomingTab,
      locale,
    });

    // ── 5. Customer sees the same status via phone lookup ───────────────────
    await page.deleteCookie({ name: "wa_session", domain: HOST, path: "/" });
    await page.goto(`${b}/bookings?phone=${encodeURIComponent(phone)}`, { waitUntil: "load", timeout: 120_000 });

    if (deposit) {
      // The pay box renders for a PENDING_PAYMENT booking with a deposit.
      await waitFor(
        page,
        `document.body.innerText.includes('${jobTitle}') && document.body.innerText.includes('${paymentRequiredBadge}')`,
        `customer sees payment-required booking (${locale})`
      );
      // The button exists in SSR HTML before React hydrates — settle so the
      // server action's onClick is attached before clicking.
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await waitFor(
        page,
        `[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').trim() === '${payNowLabel}')`,
        `pay now button (${locale})`
      );
      await page.evaluate((label) => {
        const btn = [...document.querySelectorAll("button")].find(
          (b) => (b.textContent ?? "").trim() === label
        );
        if (!(btn instanceof HTMLButtonElement)) throw new Error(`pay now button not found: ${label}`);
        btn.click();
      }, payNowLabel);
      // payBookingAction → the simulated checkout URL → GET /api/payments/simulate
      // verifies the signed token + confirms the payment → 302 back to
      // /bookings?paid=1 (same origin, so the guest session survives). The
      // paid landing renders the phone-lookup form, so re-query by phone
      // below for the Confirmed assertion.
      await waitFor(
        page,
        "location.search.includes('paid=1')",
        `checkout redirect to /bookings?paid=1 (${locale})`,
        30_000
      );
      await page.goto(`${b}/bookings?phone=${encodeURIComponent(phone)}`, {
        waitUntil: "load",
        timeout: 120_000,
      });
    }

    try {
      await waitFor(
        page,
        `document.body.innerText.includes('${jobTitle}') && document.body.innerText.includes('${confirmedBadge}')`,
        `customer sees confirmed booking (${locale})`
      );
    } catch (err) {
      // Diagnostic: dump what the page actually rendered so a deposit-path
      // timeout reports the row/status instead of a bare timeout.
      const body = await page
        .evaluate(() => ({
          pathname: location.pathname,
          search: location.search,
          body: (document.body.innerText ?? "").slice(0, 1500),
        }))
        .catch(() => "<evaluate failed>");
      throw new Error(
        `${err instanceof Error ? err.message : String(err)}\npage state: ${JSON.stringify(body)}`
      );
    }

    // ── 6. Deposit mode: worker side flips to Confirmed once the payment
    // lands — both sides tell the same story (mirrors the chain tests). ──────
    if (deposit) {
      await page.setCookie({
        name: "wa_session",
        value: encodeURIComponent(JSON.stringify(SESSIONS.worker)),
        domain: HOST,
        path: "/",
      });
      await page.goto(`${b}/dashboard`, { waitUntil: "load", timeout: 120_000 });
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await waitForUpcomingBadge(page, {
        jobTitle,
        badge: confirmedBadge,
        tab: upcomingTab,
        locale,
      });
    }
  }

  /**
   * Interactive flows — run against any server (dev or prod, parameterized by
   * baseUrl; strict enables the prod runtime-error collector):
   *   1. Subscription renewal in EN (Enterprise plan).
   *   2. Theme toggle light→dark on the homepage (dark class + wa_theme cookie,
   *      then restored on reload — the SSR contract that prevents light flash).
   *   3. Language switch EN→AR via the header menu (cookie + reload).
   *   4. Worker verification resubmit from /dashboard (toast + pending badge).
   *   5. Admin approve from the /admin verification queue (row removed, audit
   *      entry logged).
   *   6. Subscription renewal in AR (Professional plan).
   *   7. Booking request→accept in EN and AR (guest books, worker accepts,
   *      both sides show Confirmed; dev additionally runs the M3 deposit
   *      path — accept with a deposit, guest pays via the simulated
   *      checkout, both sides flip to Confirmed).
   *   8. (dev) Company self-serve campaign: create → redirected to the
   *      simulated checkout → confirms → campaign ACTIVE on /company.
   * Each step waits for its state change while the page collectors accumulate
   * any hydration/runtime error — asserted empty at the end.
   */
  async function runInteractions(opts: {
    baseUrl: string;
    strict?: boolean;
    /** "dev" runs the M3 deposit path; "prod" keeps the plain accept flow
     * because the simulated provider is refused under NODE_ENV=production. */
    mode?: "dev" | "prod";
  }): Promise<void> {
    const { baseUrl: targetBase, strict = false, mode = "dev" } = opts;
    const issues: string[] = [];
    const page: Page = await browser!.newPage();
    try {
      attachCollectors(page, issues, strict);

      // ── 1. Subscription renewal (EN) ─────────────────────────────────────
      await page.setCookie(
        { name: "wa_locale", value: "en", domain: HOST, path: "/" },
        {
          name: "wa_session",
          value: encodeURIComponent(JSON.stringify(SESSIONS.worker)),
          domain: HOST,
          path: "/",
        },
        // Theme cookie is HOST-scoped (not port-scoped): the dev interaction
        // pass toggles dark and would otherwise leak wa_theme=dark onto the
        // prod origin (same 127.0.0.1 host, different port) — booting the prod
        // run in dark and breaking the light→dark assertion below. Pin light
        // here so step 2 is deterministic on ANY server/origin.
        { name: "wa_theme", value: "light", domain: HOST, path: "/" }
      );
      await runRenewal(page, { baseUrl: targetBase, plan: "enterprise", locale: "en" });

      // ── 2. Theme toggle: light → dark, persisted via the wa_theme cookie ──
      await page.goto(`${targetBase}/`, { waitUntil: "load", timeout: 120_000 });
      await waitFor(
        page,
        "document.documentElement.lang === 'en' && document.documentElement.dir === 'ltr'",
        "homepage renders EN/LTR"
      );
      await waitFor(
        page,
        "document.querySelector('button[aria-label=\"Switch to dark mode\"]') !== null",
        "theme toggle present (light)"
      );
      // ThemeToggle SSRs its button (initialTheme before hydration), so the
      // waitFor above can match pre-hydration; a click landing before React
      // attaches onClick would silently no-op. Settle like runRenewal does.
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await page.evaluate(() => {
        const btn = document.querySelector('button[aria-label="Switch to dark mode"]');
        if (!(btn instanceof HTMLButtonElement)) throw new Error("theme toggle (light) not found");
        btn.click();
      });
      await waitFor(
        page,
        "document.documentElement.classList.contains('dark') && document.cookie.includes('wa_theme=dark')",
        "dark class + wa_theme cookie after toggle"
      );
      // Full reload: SSR must restore the dark class from the cookie — the same
      // contract that prevents a light flash / hydration mismatch for dark users.
      // (wa_theme is host-scoped, so this dark value intentionally persists
      // onto any later same-host server until a test re-pins it.)
      await page.reload({ waitUntil: "load", timeout: 120_000 });
      await waitFor(
        page,
        "document.documentElement.classList.contains('dark') && document.documentElement.lang === 'en'",
        "dark theme restored on reload via cookie"
      );

      // ── 3. Language switch: EN → AR via the header menu ──────────────────
      // The reload-restore wait above can pass pre-hydration (the dark class
      // is in the SSR HTML), so settle before the language click too.
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await page.click('button[aria-label="Switch language"]');
      await waitFor(page, "document.querySelectorAll('[role=menuitem]').length > 0", "language menu open");
      await page
        .evaluate(() => {
          const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) =>
            (el.textContent ?? "").includes("العربية")
          );
          if (!item) throw new Error("arabic language item not found");
          item.click();
        })
        .catch((err: unknown) => {
          // The click triggers location.reload(), which may destroy the
          // execution context before the evaluate resolves — that's expected.
          // Anything else (the item genuinely missing) must fail fast with the
          // actionable message rather than a 30s lang-flip timeout.
          const msg = err instanceof Error ? err.message : String(err);
          if (!/execution context was destroyed/i.test(msg)) throw err;
        });
      // setLocale() writes wa_locale=ar then reloads — wait for the SSR flip.
      await waitFor(
        page,
        "document.documentElement.lang === 'ar' && document.documentElement.dir === 'rtl'",
        "language switched to AR/RTL",
        30_000
      );

      // ── 4. Worker verification resubmit (now in AR) ──────────────────────
      await page.goto(`${targetBase}/dashboard`, { waitUntil: "load", timeout: 120_000 });
      // The resubmit button exists in SSR HTML before React hydrates; a
      // pre-hydration click would silently no-op. Settle like runRenewal does.
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await waitFor(
        page,
        "[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').includes('إعادة إرسال المستندات'))",
        "resubmit button on worker dashboard"
      );
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((b) =>
          (b.textContent ?? "").includes("إعادة إرسال المستندات")
        );
        if (!(btn instanceof HTMLButtonElement)) throw new Error("resubmit button not found");
        btn.click();
      });
      // Success toast (auto-dismisses after ~4s) then the banner flips to pending.
      await waitFor(page, "document.body.innerText.includes('تم إرسال طلب التوثيق')", "resubmit success toast");
      await waitFor(
        page,
        "[...document.querySelectorAll('span')].some(s => (s.textContent ?? '').trim() === 'قيد المراجعة')",
        "verification banner badge → pending"
      );

      // ── 5. Admin approve from the verification queue (AR) ────────────────
      await page.setCookie({
        name: "wa_session",
        value: encodeURIComponent(JSON.stringify(SESSIONS.admin)),
        domain: HOST,
        path: "/",
      });
      await page.goto(`${targetBase}/admin`, { waitUntil: "load", timeout: 120_000 });
      // The queue row (approve button included) exists in SSR HTML before React
      // hydrates — the waitFor below passes on SSR content, so a click right
      // after would race the onClick attachment and silently no-op. The admin
      // page is the heaviest route (charts, tables, framer-motion), so give
      // hydration a head start like runRenewal / the theme toggle do.
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      const khaledInQueue =
        "[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').trim() === 'اعتماد' && (b.closest('.rounded-xl')?.textContent ?? '').includes('خالد الحربي'))";
      await waitFor(page, khaledInQueue, "Khaled appears in the admin queue after resubmit");
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find(
          (b) =>
            (b.textContent ?? "").trim() === "اعتماد" &&
            (b.closest(".rounded-xl")?.textContent ?? "").includes("خالد الحربي")
        );
        if (!(btn instanceof HTMLButtonElement)) throw new Error("approve button for Khaled not found");
        btn.click();
      });
      await waitFor(page, `!(${khaledInQueue})`, "Khaled removed from the queue after approval");
      // The audit entry (WORKER_VERIFIED) surfaces in the Recent activity card.
      await waitFor(page, "document.body.innerText.includes('تم توثيقه بواسطة')", "decision logged to Recent activity");

      // ── 6. Subscription renewal (AR) — back on the worker session ─────────
      await page.setCookie({
        name: "wa_session",
        value: encodeURIComponent(JSON.stringify(SESSIONS.worker)),
        domain: HOST,
        path: "/",
      });
      await runRenewal(page, { baseUrl: targetBase, plan: "professional", locale: "ar" });

      // ── 7. Booking request → accept (EN; deposit path in dev) ────────────
      await runBookingFlow(page, {
        baseUrl: targetBase,
        locale: "en",
        deposit: mode === "dev",
      });

      // ── 8. Booking request → accept (AR; deposit path in dev) ────────────
      await runBookingFlow(page, {
        baseUrl: targetBase,
        locale: "ar",
        deposit: mode === "dev",
      });

      // ── 9. Company self-serve campaign (dev only — the simulated provider
      // is refused under NODE_ENV=production, so prod keeps the plain matrix;
      // mirrors the adapter-level campaign-payments tests in the UI): create a
      // campaign → redirected to the simulated checkout → it confirms the
      // purchase → 302 to /company?paid=1 → the campaign shows ACTIVE. ──────
      if (mode === "dev") {
        await page.setCookie(
          {
            name: "wa_locale",
            value: "en",
            domain: HOST,
            path: "/",
          },
          {
            name: "wa_session",
            value: encodeURIComponent(JSON.stringify(SESSIONS.company)),
            domain: HOST,
            path: "/",
          }
        );
        const createLabel = "Create campaign";
        const campaignName = "E2E plumbing ads";
        await page.goto(`${targetBase}/company`, { waitUntil: "load", timeout: 120_000 });
        await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
        await waitFor(
          page,
          `[...document.querySelectorAll('button')].some(b => (b.textContent ?? '').trim() === '${createLabel}')`,
          "campaign builder trigger"
        );
        await page.evaluate((label) => {
          const btn = [...document.querySelectorAll("button")].find(
            (b) => (b.textContent ?? "").trim() === label
          );
          if (!(btn instanceof HTMLButtonElement)) throw new Error(`campaign trigger not found: ${label}`);
          btn.click();
        }, createLabel);
        await waitFor(page, "document.querySelector('[role=dialog]') !== null", "campaign dialog open");
        // Name EN + AR (by placeholder) + budget (the dialog's number input),
        // then submit — the submit shares the trigger's label, so click the
        // LAST match inside the dialog (same pattern as the accept flow).
        await setInput(page, '[role="dialog"] input[placeholder="Villa renovation — Riyadh"]', campaignName);
        await setInput(page, '[role="dialog"] input[placeholder="تجديد فيلا — الرياض"]', "حملة تجريبية");
        await setInput(page, '[role="dialog"] input[type="number"]', "150");
        await page.evaluate((label) => {
          const dialog = document.querySelector('[role="dialog"]');
          const btns = [...(dialog?.querySelectorAll("button") ?? [])].filter(
            (x) => (x.textContent ?? "").trim() === label
          );
          const submit = btns.at(-1);
          if (!(submit instanceof HTMLButtonElement)) throw new Error(`campaign submit not found: ${label}`);
          submit.click();
        }, createLabel);
        // createCampaignAction → the builder redirects to the simulated
        // checkout → GET /api/payments/simulate verifies + confirms → 302 to
        // /company?paid=1. In this headless env the scripted navigation right
        // after a server action is RACY: dev's Fast Refresh can cancel it
        // (leaving the campaign PENDING on /company) or the paid landing can
        // drop the cookie jar (→ /auth/login, since /company is auth-gated;
        // the deposit flow never notices because /bookings is public). Handle
        // both deterministically:
        //   1. Wait for the campaign row OR the checkout landing.
        //   2. If the row is still PENDING, complete the purchase via its
        //      Pay-now button — re-clicking (idempotent re-mint) until the
        //      confirm lands or we've left /company.
        //   3. Re-establish the session on a settled page, then assert ACTIVE.
        await waitFor(
          page,
          `document.body.innerText.includes('${campaignName}') || location.search.includes('paid=1') || location.pathname === '/auth/login'`,
          "campaign created (row or checkout)",
          30_000
        );
        const campaignDeadline = Date.now() + 30_000;
        for (;;) {
          const done = await page
            .evaluate(
              (name) =>
                [...document.querySelectorAll("span")].some(
                  (s) => (s.textContent ?? "").trim() === "Active"
                ) ||
                location.pathname !== "/company" ||
                !document.body.innerText.includes(name),
              campaignName
            )
            .catch(() => false);
          if (done) break;
          if (Date.now() > campaignDeadline) {
            throw new Error("campaign purchase did not land");
          }
          // Re-mint + navigate via the row's Pay-now button (idempotent).
          await page
            .evaluate(() => {
              const btn = [...document.querySelectorAll("button")].find(
                (b) => (b.textContent ?? "").trim() === "Pay now"
              );
              if (!(btn instanceof HTMLButtonElement)) throw new Error("pay now button not found");
              btn.click();
            })
            .catch(() => {});
          await new Promise((r) => setTimeout(r, 800));
        }
        // Re-establish the session on a settled page (a mid-navigation context
        // can make setCookie fail), then assert the paid landing shows ACTIVE.
        await page.goto(`${targetBase}/company`, { waitUntil: "load", timeout: 120_000 });
        await page.setCookie({
          name: "wa_session",
          value: encodeURIComponent(JSON.stringify(SESSIONS.company)),
          domain: HOST,
          path: "/",
        });
        await page.goto(`${targetBase}/company?paid=1`, { waitUntil: "load", timeout: 120_000 });
        try {
          await waitFor(
            page,
            `document.body.innerText.includes('${campaignName}') && [...document.querySelectorAll('span')].some(s => (s.textContent ?? '').trim() === 'Active')`,
            "campaign ACTIVE on the company dashboard"
          );
        } catch (err) {
          // Diagnostic: dump what the company page actually rendered so a
          // timeout reports the row/status instead of a bare wait.
          const body = await page
            .evaluate(() => ({
              pathname: location.pathname,
              search: location.search,
              session: document.cookie,
              body: (document.body.innerText ?? "").slice(0, 2000),
            }))
            .catch(() => "<evaluate failed>");
          throw new Error(
            `${err instanceof Error ? err.message : String(err)}\ncampaign page state: ${JSON.stringify(body)}`
          );
        }
      }

      // ── M5 — fee-waived search filter (docs/booking-take-rate.md) ────────
      // The /search sidebar toggle narrows to Enterprise (fee-waived) workers —
      // the UI mirror of the db:smoke M5 section. Public page; pin EN so the
      // toggle label is deterministic regardless of where earlier steps left
      // the locale.
      await page.setCookie({ name: "wa_locale", value: "en", domain: HOST, path: "/" });
      await page.goto(`${targetBase}/search`, { waitUntil: "load", timeout: 120_000 });
      await waitFor(
        page,
        `[...document.querySelectorAll('a[href^="/workers/"]')].some((a) => a.querySelector('h3'))`,
        "search results render"
      );
      const beforeFilter = await page.evaluate(
        () => [...document.querySelectorAll('a[href^="/workers/"]')].filter((a) => a.querySelector("h3")).length
      );
      await waitFor(
        page,
        `[...document.querySelectorAll('label')].some((l) => (l.textContent ?? '').includes('Fee waived (Enterprise)'))`,
        "fee-waived toggle present"
      );
      // The trigger exists in SSR HTML before React hydrates; a pre-hydration
      // click would silently no-op (the same hazard the other flows settle for).
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await page.evaluate(() => {
        const label = [...document.querySelectorAll('label')].find((l) =>
          (l.textContent ?? '').includes('Fee waived (Enterprise)')
        );
        const sw = label?.querySelector('button');
        if (!sw) throw new Error("fee-waived switch not found");
        sw.click();
      });
      // The filter narrows the URL + grid to Enterprise-only workers: every
      // result card carries the fee-waived badge — the same FEE_EXEMPT_PLANS
      // source the db:smoke M5 section checks against the live DB.
      try {
        await waitFor(
          page,
          `location.search.includes('feeWaived=1') &&
           [...document.querySelectorAll('a[href^="/workers/"]')].filter((a) => a.querySelector('h3')).length > 0 &&
           [...document.querySelectorAll('a[href^="/workers/"]')].filter((a) => a.querySelector('h3'))
             .every((a) => (a.textContent ?? '').includes('Fee waived'))`,
          "fee-waived filter returns only Enterprise workers"
        );
      } catch (err) {
        // Diagnostic: dump what the search page actually rendered so a timeout
        // reports the URL/switch/cards instead of a bare wait.
        const state = await page
          .evaluate(() => ({
            search: location.search,
            cards: [...document.querySelectorAll('a[href^="/workers/"]')]
              .filter((a) => a.querySelector('h3'))
              .map((a) => ({
                name: a.querySelector('h3')?.textContent,
                feeWaived: (a.textContent ?? '').includes('Fee waived'),
              })),
            switchChecked: [...document.querySelectorAll('button')].some((b) =>
              b.getAttribute('data-state') === 'checked'
            ),
          }))
          .catch(() => "<evaluate failed>");
        throw new Error(
          `${err instanceof Error ? err.message : String(err)}\nsearch page state: ${JSON.stringify(state)}`
        );
      }
      const afterFilter = await page.evaluate(
        () => [...document.querySelectorAll('a[href^="/workers/"]')].filter((a) => a.querySelector("h3")).length
      );
      expect(afterFilter).toBeGreaterThan(0);
      expect(afterFilter).toBeLessThan(beforeFilter);
      pushNote(`[fee-waived] ${beforeFilter} → ${afterFilter} Enterprise-only result(s)`);

      // ── M5 — admin inline plan change (worker-management audit table) ──────
      // The UI mirror of the db:smoke M5 section: demote the seeded Enterprise
      // worker (bilal) to Premium via the audit table's inline plan select,
      // assert the badge flips AND he drops out of the fee-waived surfaces, then
      // revert and assert he's back — the changeWorkerPlan seam, exercised
      // through the real UI. Admin-only; pin EN for deterministic labels
      // regardless of where earlier steps left the locale.
      //
      // NOTE on assertion surfaces: the demo WORKERS store is in-memory and
      // Next keeps the route-handler and server-component module instances
      // separate, so /api/workers (which the /search client refetches on mount)
      // would show the STALE plan in demo mode. The mutation's effects are
      // asserted where they're deterministic: the /admin table itself (server
      // component), bilal's profile fee-waived badge (server component), and a
      // fresh SSR render of /search?feeWaived=1 fetched in-page (same context).
      // In real mode all three read the same DB, so this mirrors production.
      await page.setCookie(
        { name: "wa_locale", value: "en", domain: HOST, path: "/" },
        {
          name: "wa_session",
          value: encodeURIComponent(JSON.stringify(SESSIONS.admin)),
          domain: HOST,
          path: "/",
        }
      );
      await page.goto(`${targetBase}/admin`, { waitUntil: "load", timeout: 120_000 });
      // The admin page is the heaviest route — settle before touching the
      // select (same hydration hazard the other flows document).
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await waitFor(
        page,
        `[...document.querySelectorAll('select')].some((s) => s.getAttribute('aria-label') === 'Change plan')`,
        "worker-management table renders the inline plan selects"
      );
      // The row finder scopes to a row WITH a plan select (the analytics
      // top-workers table also lists Bilal, but its rows have none).
      const bilalRow = (name: string) => `
        [...document.querySelectorAll('tbody tr')].find(
          (r) => r.querySelector('select') !== null && (r.textContent ?? '').includes('${name}')
        )
      `;
      await waitFor(
        page,
        `Boolean(${bilalRow("Bilal Mansour")}) && ${bilalRow("Bilal Mansour")}.querySelector('select').value === 'enterprise'`,
        "bilal row shows Enterprise in the audit table"
      );
      // Demote: Enterprise → Premium via his row's plan select (native value
      // setter + change event, the same interaction the live check uses). The
      // change only STAGES — the confirm dialog's Apply commits the action.
      await page.evaluate(`(() => {
        const row = ${bilalRow("Bilal Mansour")};
        const sel = row.querySelector('select');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, 'premium');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(page, "document.querySelector('[role=dialog]') !== null", "plan-change confirm dialog open");
      await page.evaluate(`(() => {
        const btn = [...document.querySelectorAll('[role=dialog] button')].find(
          (b) => (b.textContent ?? '').trim() === 'Apply'
        );
        if (!btn) throw new Error('plan-change Apply button not found');
        btn.click();
      })()`);
      // The action mutates the store and router.refresh() re-renders — wait
      // for BOTH the select to flip and the ADMIN_PLAN_CHANGED entry to land
      // in Recent activity (admin + worker + from → to copy).
      await waitFor(
        page,
        `${bilalRow("Bilal Mansour")}.querySelector('select').value === 'premium' &&
         (document.body.innerText ?? '').includes("changed Bilal Mansour's plan: Enterprise → Premium")`,
        "bilal demoted to Premium + ADMIN_PLAN_CHANGED in Recent activity"
      );

      // The fee-waived search (SSR render, same context as the mutation) must
      // no longer surface him — bilal is the demo's only Enterprise worker, so
      // the filtered render has no cards. The in-page fetch re-renders the
      // route server-side and returns the HTML the client would have hydrated.
      const searchSsr = async () =>
        await page.evaluate(async () => {
          const res = await fetch("/search?feeWaived=1", { cache: "no-store" });
          return await res.text();
        });
      const ssrAfterDemote = await searchSsr();
      expect(ssrAfterDemote).not.toContain("bilal-mansour-cleaning");
      // And his profile (server component) drops the fee-waived badge.
      await page.goto(`${targetBase}/workers/bilal-mansour-cleaning`, { waitUntil: "load", timeout: 120_000 });
      await waitFor(page, "document.body.innerText.includes('Bilal Mansour')", "bilal profile renders");
      expect(await page.evaluate(() => document.body.innerText)).not.toContain("Fee waived");

      // Revert: Premium → Enterprise, then confirm he's back on both surfaces.
      await page.goto(`${targetBase}/admin`, { waitUntil: "load", timeout: 120_000 });
      await new Promise((r) => setTimeout(r, HYDRATION_SETTLE_MS));
      await waitFor(
        page,
        `Boolean(${bilalRow("Bilal Mansour")}) && ${bilalRow("Bilal Mansour")}.querySelector('select').value === 'premium'`,
        "bilal still Premium on reload (store persisted)"
      );
      await page.evaluate(`(() => {
        const row = ${bilalRow("Bilal Mansour")};
        const sel = row.querySelector('select');
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, 'enterprise');
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitFor(page, "document.querySelector('[role=dialog]') !== null", "plan-change confirm dialog open (revert)");
      await page.evaluate(`(() => {
        const btn = [...document.querySelectorAll('[role=dialog] button')].find(
          (b) => (b.textContent ?? '').trim() === 'Apply'
        );
        if (!btn) throw new Error('plan-change Apply button not found (revert)');
        btn.click();
      })()`);
      await waitFor(
        page,
        `${bilalRow("Bilal Mansour")}.querySelector('select').value === 'enterprise'`,
        "bilal reverted to Enterprise"
      );
      const ssrAfterRevert = await searchSsr();
      expect(ssrAfterRevert).toContain("bilal-mansour-cleaning");
      await page.goto(`${targetBase}/workers/bilal-mansour-cleaning`, { waitUntil: "load", timeout: 120_000 });
      await waitFor(page, "document.body.innerText.includes('Bilal Mansour')", "bilal profile re-renders");
      expect(await page.evaluate(() => document.body.innerText)).toContain("Fee waived");
      pushNote(
        "[plan-change] bilal Enterprise → Premium → fee-waived search SSR + profile badge hide him → reverted to Enterprise → both surface him again"
      );
    } catch (err) {
      throw new Error(
        [
          err instanceof Error ? err.message : String(err),
          "",
          "--- collected console/page errors ---",
          ...issues,
          "--- context ---",
          ...notes,
        ].join("\n")
      );
    } finally {
      await page.close();
    }
    expect(
      issues,
      `E2E interaction failures:\n${issues.join("\n")}\n\n--- context ---\n${notes.join("\n")}`
    ).toEqual([]);
  }

  it(
    "interactive flows: subscription renewal (EN+AR), theme toggle + reload restore, language switch EN→AR, worker verification resubmit, admin queue approve, booking request→accept (EN+AR), company campaign purchase (dev), fee-waived search filter, admin inline plan change (EN) — toasts + invoices + state changes + zero hydration errors",
    async () => {
      await runInteractions({ baseUrl });
    },
    300_000
  );

  const itProd = E2E_SKIP_PROD ? it.skip : it;

  itProd(
    "production build (next build + next start): all 8 routes × 2 locales + interactive flows — zero hydration/runtime errors, CSS + JS bundles present, server actions + RSC re-renders verified",
    async () => {
      const port = await freePort();
      const prodUrl = `http://${HOST}:${port}`;

      // 1. Build into an isolated dist dir. NEXT_DIST_DIR is read by
      // next.config.ts for BOTH build and start, so they always agree.
      let buildLog = ""; // capped to the last 256KB so a verbose build can't balloon memory
      const build = spawn(process.execPath, [nextBin!, "build"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NEXT_TELEMETRY_DISABLED: "1",
          DEMO_MODE: "true",
          NEXT_DIST_DIR: prodDistDir,
          ADMIN_ACTIVITY_FILE: path.join(prodDistDir, "activity.json"),
          PUSH_STORE_FILE: path.join(prodDistDir, "push-subscriptions.json"),
        },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      prodBuild = build; // leak guard: killed in afterAll if this ever hangs
      const buildResult = new Promise<void>((resolve, reject) => {
        build.stdout?.on("data", (d: Buffer) => {
          buildLog = (buildLog + d.toString()).slice(-262_144);
        });
        build.stderr?.on("data", (d: Buffer) => {
          buildLog = (buildLog + d.toString()).slice(-262_144);
        });
        build.on("error", reject);
        build.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`next build failed (exit ${code}):\n${buildLog.slice(-4000)}`));
        });
      });
      await buildResult;
      pushNote(`[prod-build] ok · ${buildLog.split("\n").length} lines of output`);

      // 2. Start the production server against that build.
      prodServer = spawnServer([nextBin!, "start", "-p", String(port), "--hostname", HOST], {
        NEXT_DIST_DIR: prodDistDir,
        ADMIN_ACTIVITY_FILE: path.join(prodDistDir, "activity.json"),
        PUSH_STORE_FILE: path.join(prodDistDir, "push-subscriptions.json"),
      });
      await waitForServer(`${prodUrl}/`, 120_000, "production server");

      // 3. Same push setup as dev: probe VAPID, grant permission for this origin.
      let prodPush = false;
      try {
        const res = await fetch(`${prodUrl}/api/push/vapid-public-key`);
        if (res.ok) {
          const { publicKey } = (await res.json()) as { publicKey?: string };
          prodPush = Boolean(publicKey);
        }
      } catch {
        prodPush = false;
      }
      if (prodPush) {
        await browser!.defaultBrowserContext().overridePermissions(new URL(prodUrl).origin, [
          "notifications",
        ]);
      }

      // 4. The full matrix with prod-only assertions: strict runtime-error
      // collection, stylesheet/JS-bundle presence, no error overlay.
      await runMatrix(
        [...ROUTES, ...PUBLIC_ROUTES],
        { baseUrl: prodUrl, pushConfigured: prodPush, mode: "prod" },
        /* strict */ true
      );

      // 5. The same interactive flows against the production server — real
      // server-action round-trips + RSC re-renders after resubmit/approve,
      // under the strict prod collector (runtime errors fail, not just
      // hydration signatures).
      await runInteractions({ baseUrl: prodUrl, strict: true, mode: "prod" });
    },
    600_000
  );
});
