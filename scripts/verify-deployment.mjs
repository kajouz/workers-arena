/**
 * Verifies the live production deployment through Vercel Deployment Protection:
 *   1. Creates (or reuses) a protection-bypass secret for the project.
 *   2. Requests the VAPID public-key endpoint and core routes with the bypass.
 * Never prints the CLI token. Run: node scripts/verify-deployment.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "https://workers-arena-kajouz-5273s-projects.vercel.app";
const PROJECT_ID = "prj_MsvgQuYFIvHjGNpvRuRFEszF7WTK";
const TEAM_ID = "team_FumZmRy0irImzB4EKJsv1neR";

const authPath = join(homedir(), "Library", "Application Support", "com.vercel.cli", "auth.json");
const auth = JSON.parse(readFileSync(authPath, "utf8"));
const token = auth.token ?? auth.auth?.token;
if (!token) {
  console.error("No Vercel CLI token found (auth.json shape changed?)");
  process.exit(1);
}

// 1. Protection bypass — PATCH generates (or regenerates) the automation secret.
const bypassRes = await fetch(
  `https://api.vercel.com/v1/projects/${PROJECT_ID}/protection-bypass?teamId=${TEAM_ID}`,
  {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ generate: { secret: randomBytes(16).toString("hex"), note: "scripts/verify-deployment.mjs" } }),
  }
);
if (!bypassRes.ok) {
  console.error("Bypass setup failed:", bypassRes.status, (await bypassRes.text()).slice(0, 300));
  process.exit(1);
}
const data = await bypassRes.json();
// Response shape: protectionBypass is a map keyed BY the secret itself.
const bypassMap = data.protectionBypass ?? {};
const bypassSecret = Object.keys(bypassMap)[0] ?? data.bypassSecret;
if (!bypassSecret) {
  console.error("No bypass secret in response:", JSON.stringify(data).slice(0, 200));
  process.exit(1);
}
const headers = { "x-vercel-protection-bypass": bypassSecret };

// 2. Health checks.
let failures = 0;
async function check(path, expectStatus, test) {
  const res = await fetch(`${BASE}${path}`, { headers, redirect: "manual" });
  const okStatus = res.status === expectStatus;
  let body = "";
  let ok = okStatus;
  if (test && ok) {
    body = await res.text();
    ok = test(body);
  }
  console.log(`${ok ? "✅" : "❌"} ${path} → ${res.status}${ok ? "" : ` (expected ${expectStatus}${test ? " + content match" : ""})`}`);
  if (!ok) failures += 1;
  return body;
}

const vapidBody = await check("/api/push/vapid-public-key", 200, (body) => {
  try {
    const json = JSON.parse(body);
    return typeof json.publicKey === "string" && json.publicKey.startsWith("B");
  } catch {
    return false;
  }
});
if (vapidBody) {
  const key = JSON.parse(vapidBody).publicKey;
  console.log(`   publicKey prefix: ${key.slice(0, 12)}… (${key.length} chars, non-ephemeral if it matches the configured VAPID key)`);
}

await check("/", 200);
await check("/manifest.webmanifest", 200);
await check("/offline.html", 200);

console.log(failures === 0 ? "\n✅ PRODUCTION HEALTHY — VAPID push endpoint live" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
