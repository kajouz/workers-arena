import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton — production path.
 * The app currently runs in demo mode (DEMO_MODE=true in .env), which does not
 * require a database. Once PostgreSQL is provisioned:
 *
 *   1. Set DATABASE_URL in .env
 *   2. Set DEMO_MODE=false
 *   3. Run: npx prisma migrate deploy && npm run db:seed
 *
 * Then swap the demo implementations in src/lib/data/repo.ts for these queries.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * On Vercel every function instance holds its own Prisma pool, and Prisma's
 * default pool is num_cpus * 2 + 1 connections. A deploy spins up many fresh
 * instances while the old ones are still connected, which exhausted the
 * pooler ("FATAL: no more connections allowed (max_client_conn)") and took
 * down every DB-backed page. Cap each instance at one connection unless
 * DATABASE_URL sets connection_limit itself. Returns undefined (Prisma reads
 * DATABASE_URL as usual) off Vercel or when the URL can't be parsed.
 */
export function resolveDatasourceUrl(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const raw = env.DATABASE_URL;
  if (!raw || !env.VERCEL) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (url.searchParams.has("connection_limit")) return undefined;
  url.searchParams.set("connection_limit", "1");
  return url.toString();
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      datasourceUrl: resolveDatasourceUrl(),
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export { PrismaClient };
