#!/usr/bin/env node
/**
 * migrate-on-deploy.mjs — apply pending Prisma migrations before a PRODUCTION
 * build on Vercel, so code can never ship ahead of the database it needs.
 *
 * Why this exists: the deploy (`vercel deploy --prod` from CI) never ran
 * migrations; docs/DEPLOYMENT.md made `prisma migrate deploy` a manual release
 * step. On 2026-09-28 three migrations (credit funds, WALLET payment method,
 * payment receipts) reached production code without their tables/columns.
 * The production DATABASE_URL is a Vercel "Sensitive" variable — readable at
 * build time only — so the build is the one place that can apply them.
 *
 * Runs `prisma migrate deploy` only when ALL hold:
 *   • VERCEL_ENV === "production" (never on preview/dev builds, which may
 *     share or lack a database), and
 *   • DATABASE_URL is a postgres URL (a demo-mode production has none).
 * Otherwise it prints why it skipped and exits 0.
 *
 * `migrate deploy` only applies committed, not-yet-applied migrations (never
 * resets or generates). Any failure exits non-zero, which fails the build, so
 * the deploy stops and the previous version stays live.
 *
 * Neon's pooled endpoint ("-pooler" in the host) runs through PgBouncer, which
 * breaks Prisma's migration lock; the direct endpoint is the same host without
 * "-pooler". DIRECT_URL / DATABASE_URL_UNPOOLED win when set.
 *
 * Usage (vercel.json buildCommand): node scripts/migrate-on-deploy.mjs && npm run build
 */
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  console.log(`[migrate-on-deploy] VERCEL_ENV=${env ?? "(unset)"} — not a production build, skipping.`);
  process.exit(0);
}

const configured = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
if (!/^postgres(ql)?:\/\//.test(configured)) {
  console.log("[migrate-on-deploy] No postgres DATABASE_URL (demo-mode production?) — skipping.");
  process.exit(0);
}

let url = configured;
try {
  const parsed = new URL(configured);
  if (parsed.hostname.includes("-pooler.")) {
    parsed.hostname = parsed.hostname.replace("-pooler.", ".");
    url = parsed.toString();
    console.log("[migrate-on-deploy] Using the direct (non-pooled) endpoint for migrations.");
  }
} catch {
  // Leave the URL as configured; prisma reports a malformed URL itself.
}

console.log("[migrate-on-deploy] Applying pending migrations (prisma migrate deploy)…");
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
if (result.status !== 0) {
  console.error("[migrate-on-deploy] Migrations FAILED — stopping the build so the previous deploy stays live.");
  process.exit(result.status ?? 1);
}
console.log("[migrate-on-deploy] Database schema is up to date.");
