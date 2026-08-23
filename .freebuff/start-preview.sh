#!/bin/bash
export HOME="/Users/ka"
export PATH="/Users/ka/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
cd /Users/ka/Documents/WorkersArena-freebuff
exec /Users/ka/.local/bin/node node_modules/next/dist/bin/next dev -p 3001
