#!/usr/bin/env node
/**
 * ────────────────────────────────────────────────────────────────────────────
 * MOCK WEB PUSH SERVICE (development / testing)
 * ────────────────────────────────────────────────────────────────────────────
 * Real Web Push requires an HTTPS push service (FCM for Chrome, etc.) which is
 * not available in embedded/Electron or headless browsers. This local HTTPS
 * server plays that role: register its subscription with the app, dispatch a
 * notification, and the real web-push SDK will encrypt + POST to this endpoint
 * (with a VAPID JWT), where the payload is decrypted and printed.
 *
 *   node scripts/mock-push-service.cjs          # HTTPS on :3457
 *   MOCK_PUSH_PORT=4000 node scripts/mock-push-service.cjs
 *
 * Setup:
 *   1. Generate a self-signed cert once:
 *        openssl req -x509 -newkey rsa:2048 -keyout .data/certs/key.pem \
 *          -out .data/certs/cert.pem -days 365 -nodes -subj "/CN=localhost" \
 *          -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
 *   2. The keypair persists in .data/mock-push-keys.json, so the printed
 *      subscription stays valid across restarts.
 *   3. Register the printed subscription (POST /api/push/register) from a
 *      signed-in browser tab:
 *        fetch("/api/push/register", { method: "POST",
 *          headers: {"content-type":"application/json"},
 *          body: JSON.stringify({ subscription: SUBSCRIPTION_JSON }) })
 * ────────────────────────────────────────────────────────────────────────────
 */
const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ece = require("http_ece"); // web-push's encryption engine

const PORT = Number(process.env.MOCK_PUSH_PORT ?? 3457);
const CERT_DIR = path.join(process.cwd(), ".data", "certs");
const KEY_FILE = process.env.MOCK_PUSH_KEY_FILE ?? path.join(process.cwd(), ".data", "mock-push-keys.json");

const cert = fs.readFileSync(path.join(CERT_DIR, "cert.pem"));
const key = fs.readFileSync(path.join(CERT_DIR, "key.pem"));

// ── Receiver keypair: persist so the subscription survives restarts ─────────
let publicB64;
let privateB64;
let authB64;
try {
  const saved = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
  publicB64 = saved.publicKey;
  privateB64 = saved.privateKey;
  authB64 = saved.auth;
} catch {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  publicB64 = ecdh.getPublicKey().toString("base64url");
  privateB64 = ecdh.getPrivateKey().toString("base64url");
  authB64 = crypto.randomBytes(16).toString("base64url");
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, JSON.stringify({ publicKey: publicB64, privateKey: privateB64, auth: authB64 }, null, 2));
}

// http_ece decrypt expects an ECDH object (getPublicKey/computeSecret).
const ecdh = crypto.createECDH("prime256v1");
ecdh.setPrivateKey(Buffer.from(privateB64, "base64url"));
const authSecret = Buffer.from(authB64, "base64url");

const subscription = {
  endpoint: `https://localhost:${PORT}/push`,
  keys: { p256dh: publicB64, auth: authB64 },
};

console.log("=== MOCK PUSH SUBSCRIPTION (register via POST /api/push/register) ===");
console.log(JSON.stringify(subscription));
console.log("=========================================================================");

const server = https.createServer({ cert, key }, (req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const encoding = req.headers["content-encoding"] ?? "(none)";
    const auth = req.headers.authorization ?? "(no VAPID auth header)";
    console.log(`\n[push] POST ${req.url}`);
    console.log(`[push] content-encoding: ${encoding}`);
    console.log(`[push] authorization:   ${auth.slice(0, 96)}…`);
    if (encoding === "aes128gcm") {
      try {
        const plain = ece.decrypt(body, {
          version: "aes128gcm",
          privateKey: ecdh,
          authSecret,
        });
        console.log(`[push] ✅ DECRYPTED: ${plain.toString("utf8")}`);
      } catch (err) {
        console.log(`[push] ❌ decrypt failed: ${err.message}`);
      }
    }
    res.writeHead(201, { "content-type": "text/plain" });
    res.end("OK");
  });
});

server.listen(PORT, () =>
  console.log(`mock push service listening on https://localhost:${PORT} — waiting for pushes…`)
);
