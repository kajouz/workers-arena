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

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return globalForPrisma.prisma;
}

export { PrismaClient };
