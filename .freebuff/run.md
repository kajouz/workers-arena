# How to Run

## Reproduce Artifacts

No dependency install or file copying needed when running in the main checkout:
`.env.local` + `.env` are already present and `DEMO_MODE="true"` is set, so the app
serves the full demo dataset **without** PostgreSQL. (A real-mode run needs
`docker compose up -d postgres` + `npx prisma migrate dev && npm run db:seed`.)

## Interactive development (dev server — the default preview)

```bash
cd /Users/ka/Documents/WorkersArena-freebuff
NEXT_DIST_DIR=.data/.next-dev-preview npx next dev -p 3001
```

Port 3001 is the one the Preview tab and `playwright.config.ts` expect. HMR is
live, so UI edits appear without a rebuild.

On the `feat/locale-routing` branch, bare URLs redirect: `/` → 301 → `/en`
(or `/ar` when the `wa_locale` cookie says so), and every page lives under
`/{locale}/...`. A 301 from `/` is the locale proxy doing its job, not a
fault.

**Why `NEXT_DIST_DIR` and not plain `npx next dev`:** the default `.next` cache is
shared with whatever else is running in this checkout, and `next dev` would
replace a production build living there. The isolated dir keeps dev and preview
builds from clobbering each other. Side effect: Next rewrites `tsconfig.json`'s
`include` with `<distDir>/types/**` entries at startup — a tracked file, so
restore it when you are done if you do not want the diff:

```bash
node scripts/strip-tsconfig-dist-entries.mjs   # idempotent, removes only generated entries
git checkout -- tsconfig.json                  # or nuclear: restore committed version
```

### History: the dev tab used to freeze (fixed)

Between Sep 11–12 a dev preview could wedge permanently: server HTML rendered,
then the main thread blocked for good (skeletons forever, `preview_*` tools
timing out). Two candidate causes were on the table — React's dev build needing
`eval()` under the app's CSP, and a render loop. It was the **render loop**, and
the CSP was a red herring:

- `ThemeTransition`'s `MutationObserver` watched `<html>`'s `class` and **added a
  class in response**, so it re-entered itself on every change. React also
  assigns `<html className>` itself, and re-assigning an attribute queues a
  `MutationRecord` even when the value is identical — so in `next dev` (strict
  mode re-renders + dev tooling) the loop started during hydration, with no user
  interaction at all. Measured on the unfixed code: the tooling click that
  followed **wedged the main thread** (in-page `evaluate` never returned), while
  startup itself stayed responsive.
- The CSP/eval error was real but harmless: React logged
  `eval() is not supported in this environment …` and lost its dev-only
  diagnostics, yet the page hydrated, stayed responsive and its theme toggle
  worked. Both are fixed now — see below.

Fixed in `src/components/providers/theme-transition.tsx`: the observer reacts to
a **scheme change** (`dark` present/absent) instead of to "a class mutation
happened", so its own add/remove reads back as unchanged and terminates. Pinned
by `tests/theme-transition.test.tsx`, including the same-value rewrite case.

The CSP is now single-sourced in `src/lib/security/csp.ts` (consumed by both
`src/proxy.ts` and `next.config.ts`) and allows `'unsafe-eval'` **in `next dev`
only**, so React's dev diagnostics work while a production build keeps the
hardened policy. Pinned by `tests/csp.test.ts`.

If a dev tab ever freezes again, `npm run smoke:preview` reports it as a failure
instead of looking healthy — and it now also fails on an interactive control
trapped behind a fixed overlay, not just on a wedged client.

## Start the Preview server (production build — what ships)

Use this when the preview must match production (no HMR, no dev-only React
runtime, minified bundles).

```bash
cd /Users/ka/Documents/WorkersArena-freebuff

# 1. build into an isolated dist dir (leaves a running dev server's .next alone;
#    tmp/ is gitignored). NEXT_DISABLE_STANDALONE=1 so `next start` can serve it.
NEXT_DISABLE_STANDALONE=1 NEXT_DIST_DIR=tmp/preview-prod ./node_modules/.bin/next build

# 2. serve it (same two env vars, or `next start` picks up the wrong dist dir
#    and warns about `output: standalone`)
NEXT_DISABLE_STANDALONE=1 NEXT_DIST_DIR=tmp/preview-prod ./node_modules/.bin/next start -p 3001
```

Available at `http://localhost:3001`. Rebuild after source changes — there is no
HMR in this mode. A cold build takes under a minute and warns about the
`output: standalone` config if `NEXT_DISABLE_STANDALONE` is omitted.

## Check a preview before showing it to anyone

```bash
npm run smoke:preview                 # build → serve → verify, exit 1 if broken
npm run smoke:preview -- --no-build   # reuse the last smoke build (fast)
npm run smoke:preview -- --port 3011 --route /search
```

`scripts/smoke-preview.mjs` builds into `.data/.next-preview-smoke`, serves it on
the first FREE port from `--port` (never an occupied one), then opens every key
route in headless Chrome and requires: HTTP 200, React attached to the real DOM
(hydrated), an in-page evaluate that returns inside the budget (a wedged main
thread is the failure this exists for), stylesheet + script bundles present, no
error page, no uncaught exception, no failed script/stylesheet request, no
hydration-mismatch message — and, on `/`, a theme-toggle click that actually
changes the control's label. Exit 0 healthy, 1 broken preview, 2 could not run
(no browser / build failed / port range exhausted; 2 is not a pass).

The isolated dist dir makes Next append that dir's type paths to `tsconfig.json`'s
tracked `include` array; the runner strips its own generated entries again on the
way out (success or failed build), so a smoke run leaves no diff behind — unlike
the dev server above, which still needs the manual `git checkout --`.

It then re-opens every route at **phone width** (`--phone WxH`, default
375×667; `--no-overlay` to skip) and audits COVERAGE: no visible interactive
control may be unreachable behind fixed/sticky chrome. Reachability is solved,
not sampled — the control is parked at each legal resting position (the centre of
the viewport is where a user can always scroll content to) and its centre is
hit-tested with `document.elementsFromPoint`.

  · Trapped behind a fixed overlay that offers no way out → **exit 1**, naming
    the control, its region and the overlay. This is the tap-blocking layout bug
    the gate exists for (a stray `fixed inset-0`, a promo panel that never goes
    away, a decorative overlay swallowing a CTA).
  · Trapped behind an ESCAPABLE overlay (close/dismiss/skip control, or dialog
    semantics) → printed as a non-fatal notice: the user can clear it, and these
    mount on timers (the "Recommended for you" retargeting panel, the PWA
    install banner), so failing on them would be flaky.
  · Covered at first paint by fixed chrome but reachable by scrolling → also a
    non-fatal notice, grouped by overlay. This is the class the pre-fix
    `/auth/login` demo buttons sat in: a real bug (the bar had no business on a
    focused auth screen, now pinned by `tests/bottom-tabs.test.tsx`), but the
    page WAS scrollable past it, and every mobile app with a bottom tab bar
    covers content at rest — failing on it would red-flag healthy pages.

Excluded on purpose: anything inside the fixed/sticky container itself (that is
the chrome, not content it covers) and anything whose reachability belongs to a
user-scrollable ancestor (a carousel rail), which the audit does not drive. The
contract is pinned by `tests/preview-overlay-audit.test.ts` (six browser
fixtures: trapped, dismissible, dialog, onboarding-skip, bottom bar, rail) — plus
three no-browser cases pinning the tsconfig self-heal, including that it removes
only its own dist dir's entries and leaves a concurrent run's alone.

## Detached Launch (survives the tool-call shell)

`nohup … & disown` inside a tool call gets reaped with the caller's process group.
Use the repo's own daemonizer (detached spawn, new session) and let a shell
redirect into the log:

```bash
cd /Users/ka/Documents/WorkersArena-freebuff
node .freebuff/daemonize.mjs /bin/sh -c \
  'cd /Users/ka/Documents/WorkersArena-freebuff && NEXT_DIST_DIR=.data/.next-dev-preview exec ./node_modules/.bin/next dev -p 3001 >> /Users/ka/Documents/WorkersArena-freebuff/.freebuff/preview-<thread-id>.log 2>&1'
```

It prints `detached pid=<pid>`; confirm with `kill -0 <pid>` after ~5s and wait for
`curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/` to return 200
before registering the preview. To stop: `kill <pid>`.

## Run Playwright Tests

```bash
cd /Users/ka/Documents/WorkersArena-freebuff
npx playwright test tests/playwright/admin-customers.spec.ts
```

The Playwright config automatically starts a dev server on port 3001 if needed.
