#!/usr/bin/env node
/**
 * scripts/smoke-preview.mjs — boot the PREVIEW build and prove it actually works.
 *
 *   npm run smoke:preview                 # build (isolated dist) → serve → verify
 *   npm run smoke:preview -- --no-build   # reuse the last smoke build
 *   npm run smoke:preview -- --port 3011 --route /search
 *
 * Why this exists: the dev server can *answer* (`GET / 200`, complete SSR HTML)
 * while its client runtime wedges — the tab sits on its loading skeletons, the
 * main thread stays blocked, and nothing renders differently. `curl` and a status
 * check cannot see that, so a broken preview looks healthy until a human opens
 * it. This script is the check a human would otherwise have to do by eye:
 *
 *   1. build the app the way the Preview tab serves it (isolated NEXT_DIST_DIR,
 *      NEXT_DISABLE_STANDALONE so `next start` can serve the output),
 *   2. start `next start` on a FREE port (never an occupied one — testing a
 *      stranger's server on the port would verify the wrong artifact),
 *   3. open each key route in headless Chrome and require that it
 *      - answered 200 (not a 404/500/redirect away),
 *      - HYDRATED: React attached to the real DOM (a `__reactFiber$`/
 *        `__reactContainer$` key on a node) — not just server-rendered HTML,
 *      - is RESPONSIVE: an in-page evaluate completes inside a hard budget,
 *        which is the exact symptom the wedged dev server shows,
 *      - has its stylesheet + script bundles (a missing chunk renders as
 *        static, unstyled HTML),
 *      - shows no error overlay, no uncaught exception, no failed
 *        script/stylesheet request and no hydration-mismatch message,
 *   4. on the home route, CLICK something client-only (the theme toggle) and
 *      require the DOM to change — the interaction that only works post-hydration,
 *   5. re-open every route at PHONE width and audit COVERAGE: no visible
 *      interactive control may be unreachable behind fixed/sticky chrome. A
 *      control that scrolls under the bottom nav is normal; a control that no
 *      legal scroll position can clear is a tap blocker and FAILS the run
 *      (see the audit's contract below),
 *   6. exit non-zero with the captured console errors + the server log tail so a
 *      failure is diagnosable without re-running by hand.
 *
 * ── The overlay audit's contract (step 5) ────────────────────────────────────
 * Reachability is a SOLVER, not a scroll sweep. Sampling scroll offsets misses
 * the tappable one and libels healthy pages; this instead PARKS the control at
 * each legal resting position — the centre of the viewport is where a user can
 * always scroll content to — and hit-tests its centre with
 * `document.elementsFromPoint`. A control whose centre lands on itself (or a
 * descendant) at ANY legal position is reachable. Note `scroll-behavior: smooth`
 * makes `scrollTop =` a no-op for a synchronous reader, so every move uses
 * `{ behavior: "instant" }`.
 *
 *   · UNREACHABLE behind a fixed/sticky overlay, and the overlay offers no
 *     dismiss control  → FAILURE (this is the gate: e.g. a stray full-screen
 *     fixed panel, or an ad overlay that never goes away, swallowing a CTA).
 *   · UNREACHABLE behind an ESCAPABLE overlay → warning: the user can clear it.
 *     Escapable means the overlay carries a close/dismiss/skip control (the
 *     "Recommended for you" retargeting panel, the PWA install banner, the
 *     onboarding tour) or dialog semantics (Esc is the way out). These mount on
 *     timers, so failing on them would make the gate flaky.
 *     A NEW fixed overlay with none of those will FAIL the run — deliberately:
 *     the failure names the overlay, so a human decides fix-vs-escape-hatch
 *     (`--no-overlay`) instead of the audit silently excusing it.
 *   · Covered at the document's FIRST PAINT by fixed chrome, but revealed by
 *     scrolling → warning. This is the inherent cost of a fixed bottom bar and
 *     is where the pre-fix /auth/login demo buttons sat (a real bug, but the
 *     page WAS scrollable past it), so it is reported loudly without gating.
 *
 * Two classes are excluded ON PURPOSE: anything inside the fixed/sticky container
 * itself (that is the chrome, not content it covers), and anything inside a
 * user-scrollable ancestor (`overflow: auto|scroll` with overflow) — its
 * reachability is governed by that scroller, which this audit does not drive.
 * Next.js' dev-tools `<nextjs-portal>` is ignored as a blocker (dev noise; the
 * smoke serves a production build, where it does not exist).
 *
 * Exit codes: 0 = healthy, 1 = the preview is broken, 2 = could not run the
 * check (no browser, build failed, port range exhausted) — 2 is NOT a pass.
 *
 * The build goes to an isolated dist dir (default `.data/.next-preview-smoke`,
 * gitignored) which `--no-build` reuses, so a repeat run skips the build. A
 * non-default dist dir makes Next append its type paths to tsconfig.json's
 * TRACKED `include` array; those generated entries are removed again on the way
 * out, so a run leaves no diff behind.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NEXT_BIN = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");

const HELP = `
Usage: node scripts/smoke-preview.mjs [options]

  --port <n>        first port to try (default 3001; probes upward if busy)
  --no-build        reuse the existing smoke dist dir instead of rebuilding
  --dist <name>     dist dir (default .data/.next-preview-smoke)
  --route <path>    verify this route too (repeatable; overrides the defaults)
  --phone <WxH>     viewport for the overlay audit (default 375x667)
  --no-overlay      skip the phone-width overlay/coverage audit
  --timeout <ms>    per-page budget for goto + in-page evaluate (default 20000)
  --keep-server     leave the server running after the checks
  --help            show this text
`;

/** Route → nothing locale-specific: the app defaults to EN, but a cookie-carried
 * locale must not turn a healthy preview into a red check. */
const DEFAULT_ROUTES = ["/", "/search?category=plumbing", "/workers/khaled-al-harbi-plumbing", "/bookings", "/faq"];

/** Hydration-mismatch / invalid-nesting console text (mirrors the e2e classifier). */
const HYDRATION_RE =
  /hydration error|hydrat\w* (failed|error)|did not match|didn't match|validatedomnesting|cannot be a descendant of|cannot appear as a descendant of|server rendered html|expected server html|to contain a matching|while hydrating|minified react error #(4(18|23|25)|418)|react error #(4(18|23|25))/i;

/** Error-page markers — a server crash would otherwise pass every other check. */
const ERROR_PAGE_RE = /unhandled runtime error|internal server error|application error: a client-side exception/i;

/** Off-Vercel analytics scripts 404 locally — noise, not a broken preview. */
const KNOWN_NOISE_RE = /_vercel\/(insights|speed-insights)\//;

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
].filter((p) => Boolean(p));

/** Layouts used by `npx playwright install chromium` — lets CI (which installs
 * only the Playwright browser) run this without a system Chrome. */
const PLAYWRIGHT_CHROMIUM_GLOBS = [
  path.join(os.homedir(), "Library/Caches/ms-playwright"),
  path.join(os.homedir(), ".cache/ms-playwright"),
];

function findPlaywrightChromium() {
  for (const cache of PLAYWRIGHT_CHROMIUM_GLOBS) {
    if (!existsSync(cache)) continue;
    for (const entry of readdirSync(cache)) {
      if (!entry.startsWith("chromium")) continue;
      for (const rel of [
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
        "chrome-win/chrome.exe",
      ]) {
        const candidate = path.join(cache, entry, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

function parseArgs(argv) {
  const opts = {
    port: 3001,
    build: true,
    dist: ".data/.next-preview-smoke",
    routes: [],
    timeout: 20_000,
    keepServer: false,
    overlay: true,
    phone: { width: 375, height: 667 },
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if (arg === "--no-build") opts.build = false;
    else if (arg === "--no-overlay") opts.overlay = false;
    else if (arg === "--phone") {
      const [width, height] = String(argv[++i] ?? "").split("x").map(Number);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 200 || height < 200) {
        console.error(`✗ invalid --phone value (expected WxH, e.g. 375x667)\n${HELP}`);
        process.exit(2);
      }
      opts.phone = { width, height };
    }
    else if (arg === "--keep-server") opts.keepServer = true;
    else if (arg === "--port") opts.port = Number(argv[++i]);
    else if (arg === "--dist") opts.dist = argv[++i];
    else if (arg === "--timeout") opts.timeout = Number(argv[++i]);
    else if (arg === "--route") opts.routes.push(argv[++i]);
    else {
      console.error(`✗ unknown option: ${arg}\n${HELP}`);
      process.exit(2);
    }
  }
  return opts;
}

/** Reject on `ms` — the pending promise keeps running, so callers must bail out. */
function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not finish within ${ms}ms`)), ms);
    }),
  ]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Is the port bindable the way `next start` binds it? Probing without a host
 * matters: `next start` listens on the IPv6 wildcard (`:::3001`), and on macOS a
 * probe bound to 127.0.0.1 alone SUCCEEDS while that wildcard is held — which is
 * how this script once "verified" a stranger's server on the port instead of its
 * own. A wildcard probe fails for both families, matching the real bind.
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port);
  });
}

/** The first free port at/after `port` — never reuse an occupied one. */
async function pickPort(start, span = 10) {
  for (let port = start; port < start + span; port++) {
    if (await isPortFree(port)) {
      if (port !== start) console.log(`  · port ${start} is busy — using ${port}`);
      return port;
    }
  }
  return undefined;
}

function run(cmd, args, env, logFile) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    const onData = (buf) => {
      chunks.push(buf);
      if (logFile) process.stdout.write(buf);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => resolve({ code, output: Buffer.concat(chunks).toString() }));
  });
}

/** Poll until the server answers; resolves "ok" | "timeout" | "dead". */
async function waitForServer(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return "dead";
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return "ok";
    } catch {
      // not listening yet
    }
    await sleep(500);
  }
  return "timeout";
}

function tail(text, lines = 25) {
  return text.split("\n").slice(-lines).join("\n");
}

/** The theme control in the header — present on every page, and its label
 * changes on every click (see the interaction check). */
const THEME_SELECTOR =
  'button[aria-label*="Switch to light mode" i], button[aria-label*="Switch to dark mode" i], button[aria-label*="Theme: system" i]';

/** `next start` reports a bound socket — the proof that the server we probe is
 * OUR server and not something already listening on the same port. */
const SERVER_READY_RE = /Ready in \d+/;
const PORT_TAKEN_RE = /EADDRINUSE/;

/**
 * In-page overlay audit. Runs INSIDE the browser, so every helper it needs is
 * declared here (module-scope values are not visible in the page context).
 *
 * Returns the controls it could not reach behind fixed/sticky chrome, plus the
 * ones covered at first paint. See the script header for the full contract.
 */
function overlayAudit() {
  const CANDIDATE =
    'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [tabindex]:not([tabindex="-1"])';

  const describe = (el) => {
    if (!el) return "null";
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    const label = (el.getAttribute("aria-label") || el.textContent?.trim().replace(/\s+/g, " ").slice(0, 28) || el.getAttribute("name") || "")
      .replace(/[[\]]/g, "")
      .trim();
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}${label ? `[${label}]` : ""}`;
  };

  /** Nearest fixed/sticky ancestor — including the element itself. */
  const stickyRoot = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === "fixed" || pos === "sticky") return { node: n, pos };
    }
    return null;
  };

  /**
   * Does the user have a way out of this overlay? A close/dismiss control counts,
   * and so does modal semantics: while a dialog is open, content behind its
   * backdrop is EXPECTED to be covered, and a dialog is dismissed by Esc or its
   * own close affordance — flagging that would be a false failure on any page
   * that auto-opens one (onboarding, checkout).
   */
  const DISMISS_SELECTOR =
    'button[aria-label*="dismiss" i], button[aria-label*="close" i], button[aria-label*="skip" i], [role="button"][aria-label*="close" i], [role="dialog"], [role="alertdialog"], [aria-modal="true"], button[aria-label*="إغلاق"], button[aria-label*="اغلاق"], button[aria-label*="تخطي"]';
  // The overlay ROOT can itself be the dialog (`div[role=dialog][fixed]`), so the
  // root is matched directly — querySelector alone only sees descendants.
  const hasDismiss = (root) => !!root && (root.matches(DISMISS_SELECTOR) || !!root.querySelector(DISMISS_SELECTOR));

  /** A user-scrollable ancestor governs that element's reachability, not the document. */
  const inOwnScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (/^(auto|scroll)$/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 4) return true;
      if (/^(auto|scroll)$/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 4) return true;
    }
    return false;
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    if (s.visibility === "hidden" || s.display === "none" || s.pointerEvents === "none") return false;
    if (Number(s.opacity) < 0.1) return false;
    return true;
  };

  // Order matters: a breadcrumb `<nav>` lives INSIDE <main>, so "main" is the
  // honest label for it while the bottom tab bar stays "nav".
  const region = (el) =>
    el.closest("footer") ? "footer" : el.closest("header") ? "header" : el.closest("main") ? "main" : el.closest("nav") ? "nav" : "page";

  /** Hit-test the element's centre; null when it is outside the viewport. */
  const hitTest = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x > innerWidth - 1 || y > innerHeight - 1) return null;
    // Dev-tools host (dev only) sits above everything and is not app content.
    const stack = document.elementsFromPoint(x, y).filter((e) => !e.closest("nextjs-portal"));
    const top = stack[0];
    if (!top) return { ok: false, blocker: "nothing hit-tests here", overlay: null, overlayKind: "in-flow", dismissible: false };
    if (el.contains(top) || top.contains(el)) return { ok: true };
    const root = stickyRoot(top);
    return {
      ok: false,
      blocker: describe(top),
      overlay: root ? `${root.pos} ${describe(root.node)}` : null,
      overlayKind: root ? root.pos : "in-flow",
      dismissible: root ? hasDismiss(root.node) : false,
    };
  };

  const targets = [];
  for (const el of document.querySelectorAll(CANDIDATE)) {
    if (el.matches(":disabled") || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("hidden")) continue;
    if (!visible(el)) continue;
    if (stickyRoot(el)) continue; // part of the chrome itself
    if (inOwnScroller(el)) continue; // this audit only drives document scrolling
    targets.push(el);
  }

  const maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);

  // ── Rule 1: is there ANY legal resting position where this control is tappable?
  const unreachable = [];
  for (const el of targets) {
    const r0 = el.getBoundingClientRect();
    const docCentre = r0.top + window.scrollY + r0.height / 2;
    const offsets = [0.5, 0.42, 0.58, 0.34, 0.66].map((f) => Math.max(0, Math.min(maxScroll, docCentre - innerHeight * f)));
    offsets.push(0, maxScroll);
    const seen = new Set();
    let reachable = false;
    const attempts = [];
    for (const offset of offsets) {
      const y = Math.round(offset);
      if (seen.has(y)) continue;
      seen.add(y);
      window.scrollTo({ top: y, behavior: "instant" });
      const res = hitTest(el);
      if (!res) continue;
      if (res.ok) {
        reachable = true;
        break;
      }
      attempts.push({ scrollY: y, ...res });
    }
    if (reachable || attempts.length === 0) continue;
    unreachable.push({
      el: describe(el),
      region: region(el),
      positions: attempts.length,
      blocker: attempts[0].blocker,
      overlay: attempts[0].overlay,
      overlayKind: attempts[0].overlayKind,
      // Dismissible only counts if EVERY blocking position offers the way out.
      dismissible: attempts.every((a) => a.dismissible),
    });
  }

  // ── Rule 2 (advisory): covered by fixed chrome at the document's first paint.
  window.scrollTo({ top: 0, behavior: "instant" });
  const atRest = [];
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(r.top + r.height / 2);
    if (y < 0 || y > innerHeight - 1 || x < 0 || x > innerWidth - 1) continue;
    const res = hitTest(el);
    if (!res || res.ok || res.overlayKind === "in-flow") continue;
    atRest.push({ el: describe(el), region: region(el), blocker: res.blocker, overlay: res.overlay });
  }
  window.scrollTo({ top: 0, behavior: "instant" });

  return { controls: targets.length, maxScroll, unreachable, atRest };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP.trim());
    return 0;
  }
  if (!existsSync(NEXT_BIN)) {
    console.error("✗ could not run: next is not installed (npm ci first)");
    return 2;
  }

  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p)) ?? findPlaywrightChromium();
  if (!chrome) {
    console.error(
      "✗ could not run: no Chrome/Chromium found — the preview cannot be verified without a browser.\n" +
        "  Install one (npx playwright install chromium) or set PUPPETEER_EXECUTABLE_PATH."
    );
    return 2;
  }

  let puppeteer;
  try {
    puppeteer = (await import("puppeteer-core")).default;
  } catch {
    console.error("✗ could not run: puppeteer-core is missing (npm ci first)");
    return 2;
  }

  const distDir = opts.dist;
  const env = { ...process.env, NEXT_DIST_DIR: distDir, NEXT_DISABLE_STANDALONE: "1" };
  const serverLogPath = path.join(ROOT, ".data", "preview-smoke-server.log");
  const tsconfigPath = path.join(ROOT, "tsconfig.json");
  mkdirSync(path.join(ROOT, ".data"), { recursive: true });

  // ── 1. Build the artifact the preview serves ───────────────────────────────
  if (opts.build) {
    console.log(`▶ building (NEXT_DIST_DIR=${distDir})…`);
    const started = Date.now();
    const { code, output } = await run(process.execPath, [NEXT_BIN, "build"], env);
    // The build rewrites tsconfig.json — restore whether it succeeded or not.
    restoreTsconfigTypes(tsconfigPath, distDir);
    if (code !== 0) {
      console.error(`✗ could not run: the preview build failed (exit ${code})\n\n${tail(output, 40)}`);
      return 2;
    }
    console.log(`  ✓ built in ${Math.round((Date.now() - started) / 1000)}s`);
  } else if (!existsSync(path.join(ROOT, distDir, "BUILD_ID"))) {
    console.error(`✗ could not run: no build in ${distDir} — run without --no-build first`);
    return 2;
  }

  // ── 2. Serve it on a port we own ───────────────────────────────────────────
  const port = await pickPort(opts.port);
  if (!port) {
    console.error(`✗ could not run: no free port in ${opts.port}–${opts.port + 9}`);
    return 2;
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port)], {
    cwd: ROOT,
    env,
    // Own process group so cleanup kills the whole tree, not just the leader.
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const serverChunks = [];
  const capture = (buf) => {
    serverChunks.push(buf);
    process.stdout.write(`  [server] ${buf}`);
  };
  server.stdout.on("data", capture);
  server.stderr.on("data", capture);

  const stopServer = () => {
    if (server.exitCode !== null || opts.keepServer) return;
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  };

  let browser;
  try {
    const ready = await waitForServer(baseUrl, server, 120_000);
    const serverText = () => Buffer.concat(serverChunks).toString();
    if (ready !== "ok") {
      console.error(
        `✗ preview is broken: the server never answered on ${baseUrl} (${ready})\n\n${tail(serverText())}`
      );
      return 1;
    }
    // Ownership: only verify a server we started. A process that grabbed the port
    // after our probe would otherwise be smoke-tested in place of the build.
    if (server.exitCode !== null || PORT_TAKEN_RE.test(serverText()) || !SERVER_READY_RE.test(serverText())) {
      console.error(
        `✗ could not run: ${baseUrl} is not being served by this run — another process holds the port\n\n${tail(serverText())}`
      );
      return 2;
    }
    console.log(`▶ server up on ${baseUrl} — verifying hydration + routes`);

    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
      protocolTimeout: 120_000,
    });

    const routes = opts.routes.length > 0 ? opts.routes : DEFAULT_ROUTES;
    const failures = [];
    const warnings = [];
    const overlayAdvisory = [];

    for (const route of routes) {
      const url = `${baseUrl}${route}`;
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => pageErrors.push(err.message));
      page.on("requestfailed", (req) => {
        if (!["script", "document", "stylesheet"].includes(req.resourceType())) return;
        // The same off-Vercel analytics 404s that are console noise also abort as
        // requests — a blocked THIRD-PARTY script is not a broken preview.
        if (KNOWN_NOISE_RE.test(req.url())) return;
        failedRequests.push(`${req.resourceType()} ${req.url()} (${req.failure()?.errorText ?? "failed"})`);
      });

      try {
        const response = await withTimeout(page.goto(url, { waitUntil: "load" }), opts.timeout, `GET ${route}`);
        const status = response?.status() ?? 0;
        // Settle: hydration happens after `load`; a wedged client shows up as the
        // evaluate below never returning.
        await sleep(1500);

        const state = await withTimeout(
          // Everything the page-side function needs is passed in — module-scope
          // constants are not visible inside the browser context.
          page.evaluate((selector) => {
            const hydrated = [...document.querySelectorAll("*")].some((el) =>
              Object.keys(el).some((k) => /^__react(Fiber|Container|Props)\$/.test(k))
            );
            return {
              pathname: location.pathname,
              title: document.title,
              text: document.body.innerText,
              hydrated,
              styleSheets: document.styleSheets.length,
              scriptBundles: document.querySelectorAll('script[src^="/_next/static/"]').length,
              // The theme control cycles light → dark → auto, so its LABEL is the
              // deterministic post-click signal (the `dark` class can legitimately
              // stay put when the cycle lands on "auto" and the OS preference
              // agrees). A label that never changes means no handler ran.
              themeLabel: document.querySelector(selector)?.getAttribute("aria-label") ?? null,
            };
          }, THEME_SELECTOR),
          opts.timeout,
          `evaluate ${route}`
        );

        if (status !== 200) failures.push(`${route} → HTTP ${status}`);
        if (state.pathname !== route.split("?")[0]) failures.push(`${route} → landed on ${state.pathname}`);
        if (!state.hydrated) failures.push(`${route} → React never attached to the DOM (not hydrated)`);
        if (state.scriptBundles === 0) failures.push(`${route} → no /_next/static script bundles`);
        if (state.styleSheets === 0) failures.push(`${route} → no stylesheets applied`);
        if (state.text.trim().length < 300) failures.push(`${route} → page text is only ${state.text.trim().length} chars`);
        if (!/WorkersArena/i.test(state.title)) failures.push(`${route} → unexpected document title "${state.title}"`);
        if (ERROR_PAGE_RE.test(state.text)) failures.push(`${route} → error page rendered`);
        for (const message of pageErrors) failures.push(`${route} → uncaught exception: ${message}`);
        for (const message of failedRequests) failures.push(`${route} → ${message}`);
        for (const message of consoleErrors) {
          if (KNOWN_NOISE_RE.test(message)) continue;
          if (HYDRATION_RE.test(message)) failures.push(`${route} → hydration: ${message.split("\n")[0]}`);
          else warnings.push(`${route} → console error: ${message.split("\n")[0]}`);
        }

        // The home route must also PROVE interactivity: flipping the theme is
        // client-only state, so a changed <html class> cannot come from the SSR HTML.
        if (route === "/") {
          if (!state.themeLabel) {
            failures.push(`${route} → theme toggle not found (cannot verify interactivity)`);
          } else {
            // Dispatch through the DOM rather than the input protocol: a synthetic
            // click still reaches React's root listener (so it proves hydration),
            // while `page.click` also needs stable coordinates — an overlay or a
            // busy renderer makes it time out for reasons unrelated to the preview.
            // If the client runtime is wedged this evaluate never returns, which is
            // the same failure the dev preview showed.
            await withTimeout(
              page.evaluate((selector) => document.querySelector(selector).click(), THEME_SELECTOR),
              opts.timeout,
              `click the theme toggle on ${route} (client runtime appears wedged)`
            );
            await sleep(500);
            const after = await withTimeout(
              page.evaluate(
                (selector) => document.querySelector(selector)?.getAttribute("aria-label") ?? null,
                THEME_SELECTOR
              ),
              opts.timeout,
              `read the theme label on ${route} after the click`
            );
            if (after === state.themeLabel) {
              failures.push(`${route} → clicking the theme control changed nothing (no handler ran)`);
            }
          }
        }

        const bad = failures.filter((f) => f.startsWith(`${route} `)).length;
        console.log(`  ${bad === 0 ? "✓" : "✗"} ${route} (${status}, ${state.text.trim().length} chars${state.hydrated ? ", hydrated" : ""})`);
      } catch (err) {
        failures.push(`${route} → ${err instanceof Error ? err.message : String(err)}`);
        console.log(`  ✗ ${route} — ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        await page.close().catch(() => {});
      }
    }

    // ── 3. Phone-width overlay audit ────────────────────────────────────────
    if (opts.overlay) {
      const { width, height } = opts.phone;
      console.log(`\n▶ overlay audit at ${width}×${height} — no control may be trapped behind fixed chrome`);
      for (const route of routes) {
        const page = await browser.newPage();
        await page.setViewport({ width, height });
        try {
          await withTimeout(page.goto(`${baseUrl}${route}`, { waitUntil: "load" }), opts.timeout, `GET ${route} @${width}`);
          // The retargeting panel mounts on a 2s timer, so audit the SETTLED page:
          // otherwise whether a promo counts as a blocker depends on timing.
          await sleep(2500);
          const audit = await withTimeout(page.evaluate(overlayAudit), opts.timeout, `overlay audit ${route} @${width}`);

          const trapped = audit.unreachable.filter((item) => !item.dismissible);
          const excused = audit.unreachable.filter((item) => item.dismissible);
          // A full-screen regression traps every control on the page, so report the
          // first few in full and aggregate the rest — a 400-line failure list is
          // not more diagnosable than five lines naming the overlay.
          for (const item of trapped.slice(0, 4)) {
            failures.push(
              `${route} @${width} → ${item.region} ${item.el} is not tappable at any of ${item.positions} legal position(s): covered by ${item.overlay ?? `in-flow ${item.blocker}`}`
            );
          }
          if (trapped.length > 4) {
            const shared = new Set(trapped.slice(4).map((item) => item.overlay ?? `in-flow ${item.blocker}`));
            failures.push(
              `${route} @${width} → ${trapped.length - 4} more control(s) trapped by ${[...shared].join(", ")}`
            );
          }
          for (const item of excused) {
            overlayAdvisory.push({ kind: "dismissible", route, el: item.el, overlay: item.overlay });
          }
          for (const item of audit.atRest) {
            overlayAdvisory.push({ kind: "at first paint", route, el: item.el, overlay: item.overlay });
          }
          const advisory = excused.length + audit.atRest.length;
          console.log(
            `  ${trapped.length === 0 ? "✓" : "✗"} ${route} (${audit.controls} controls, ${trapped.length} trapped, ${advisory} advisory)`
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failures.push(`${route} @${width} → overlay audit could not run: ${message}`);
          console.log(`  ✗ ${route} — overlay audit could not run: ${message}`);
        } finally {
          await page.close().catch(() => {});
        }
      }
    }

    if (warnings.length > 0) {
      console.log(`\n⚠ ${warnings.length} non-fatal console error(s):`);
      for (const warning of warnings.slice(0, 10)) console.log(`  · ${warning}`);
    }

    if (overlayAdvisory.length > 0) {
      // Group by overlay: "which fixed element covers what" is the useful shape,
      // not 28 near-identical lines.
      const groups = new Map();
      for (const notice of overlayAdvisory) {
        const key = `${notice.kind}::${notice.overlay}`;
        if (!groups.has(key)) groups.set(key, { kind: notice.kind, overlay: notice.overlay, byRoute: new Map() });
        const group = groups.get(key);
        group.byRoute.set(notice.route, [...(group.byRoute.get(notice.route) ?? []), notice.el]);
      }
      const total = (group) => [...group.byRoute.values()].reduce((n, els) => n + els.length, 0);
      const ranked = [...groups.values()].sort((a, b) => total(b) - total(a));
      console.log(`\n⚠ ${overlayAdvisory.length} overlay coverage notice(s) — not fatal:`);
      for (const group of ranked.slice(0, 6)) {
        const examples = [...group.byRoute.entries()].slice(0, 2).map(([route, els]) => `${route} → ${els.slice(0, 2).join(", ")}${els.length > 2 ? ` (+${els.length - 2})` : ""}`);
        console.log(`  · ${total(group)} control(s) covered ${group.kind} by ${group.overlay}`);
        for (const example of examples) console.log(`      ${example}`);
      }
      if (ranked.length > 6) console.log(`  · …and ${ranked.length - 6} more overlay(s)`);
    }

    if (failures.length > 0) {
      console.error(`\n✗ preview smoke FAILED — ${failures.length} problem(s) across ${routes.length} route(s):`);
      for (const failure of failures) console.error(`  · ${failure}`);
      console.error(`\nserver log (${path.relative(ROOT, serverLogPath)}):\n${tail(Buffer.concat(serverChunks).toString())}`);
      return 1;
    }

    const overlayNote = opts.overlay ? `, and ${routes.length} route(s) at ${opts.phone.width}×${opts.phone.height} with no control trapped behind fixed chrome` : "";
    console.log(`\n✓ preview smoke passed — ${routes.length} route(s) answered, hydrated and interactive${overlayNote} on ${baseUrl}`);
    return 0;
  } finally {
    await browser?.close().catch(() => {});
    writeServerLog(serverLogPath, Buffer.concat(serverChunks).toString());
    stopServer();
    restoreTsconfigTypes(tsconfigPath, distDir);
  }
}

/** Persist the server output for post-mortems — never masks the real failure. */
function writeServerLog(file, content) {
  try {
    writeFileSync(file, content);
  } catch {
    // ignore
  }
}

/**
 * Building with a `NEXT_DIST_DIR` makes Next's TS plugin append type paths for
 * that dir to tsconfig.json's `include` array — a TRACKED file, so every run would
 * otherwise leave a machine-specific diff behind (and a hard-killed run, whose
 * `finally` never fires, leaves it for good; the same artifact the e2e runner
 * self-heals). Strip only the entries naming THIS run's dist dir, so an
 * unrelated concurrent edit to the file survives untouched.
 */
function restoreTsconfigTypes(file, distDir) {
  try {
    const escaped = distDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const owned = new RegExp(`^\\s*"[^"]*${escaped}[\\\\/](?:dev/)?types/[^"]*",?\\s*$`);
    const lines = readFileSync(file, "utf8").split("\n");
    const kept = lines.filter((line) => !owned.test(line));
    if (kept.length === lines.length) return;
    // The entry is usually the include array's last — drop the dangling comma
    // so the restored file is strict JSON again.
    writeFileSync(file, kept.join("\n").replace(/,\n(\s*[\]}])/g, "\n$1"));
    const removed = lines.length - kept.length;
    console.log(`  · tsconfig.json: dropped ${removed} generated include entr${removed === 1 ? "y" : "ies"} for ${distDir}`);
  } catch {
    // An unreadable tsconfig must never mask the smoke's own result.
  }
}

/**
 * Exported so tests/preview-overlay-audit.test.ts can pin the audit's contract
 * with fixtures — no build, no server, no app required.
 */
export { overlayAudit, restoreTsconfigTypes };

// Only boot when run AS A SCRIPT: importing this module must never build, serve
// or exit the process.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const code = await main();
  process.exit(code);
}
