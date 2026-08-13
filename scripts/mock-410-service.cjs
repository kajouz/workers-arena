#!/usr/bin/env node
/**
 * MOCK "DEAD PUSH SERVICE" — always answers 410 Gone.
 * Lets pruneDeadPushSubscriptions() be exercised live: register a subscription
 * whose endpoint points here, run a prune, and the probe's 410 prunes it.
 *
 *   node scripts/mock-410-service.cjs            # HTTPS on :3458
 *   MOCK_410_PORT=4000 node scripts/mock-410-service.cjs
 */
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.MOCK_410_PORT ?? 3458);
const CERT_DIR = path.join(process.cwd(), ".data", "certs");

const server = https.createServer(
  { cert: fs.readFileSync(path.join(CERT_DIR, "cert.pem")), key: fs.readFileSync(path.join(CERT_DIR, "key.pem")) },
  (req, res) => {
    req.resume();
    console.log(`[410] POST ${req.url}`);
    res.writeHead(410, { "content-type": "text/plain" });
    res.end("Gone");
  }
);

server.listen(PORT, () =>
  console.log(`mock dead push service listening on https://localhost:${PORT} — always 410`)
);
