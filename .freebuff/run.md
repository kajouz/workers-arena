# How to Run

## Reproduce Artifacts

No special artifacts needed — the project builds cleanly from source.

## Start the Dev Server

```bash
cd /Users/ka/Documents/WorkersArena-freebuff
npx next dev -p 3001
```

The server will be available at `http://localhost:3001`.

## Run Playwright Tests

```bash
cd /Users/ka/Documents/WorkersArena-freebuff
npx playwright test tests/playwright/admin-customers.spec.ts
```

The Playwright config automatically starts a dev server on port 3001 if needed.

## Detached Launch (macOS)

Use `node -e` with `spawn(..., { detached: true })` to survive thread exit:

```bash
node -e "
const { spawn } = require('child_process');
const fs = require('fs');
const log = fs.openSync('.freebuff/preview.log', 'a');
const child = spawn('node', ['node_modules/next/dist/bin/next', 'dev', '-p', '3001'], {
  cwd: '/Users/ka/Documents/WorkersArena-freebuff',
  detached: true,
  stdio: ['ignore', log, log]
});
child.unref();
console.log('pid=' + child.pid);
"
```

To stop: `kill <pid>`
