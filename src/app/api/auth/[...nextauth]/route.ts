import { handlers } from "@/auth";

/**
 * Auth.js v5 catch-all route (GET/POST /api/auth/*).
 * Node runtime — the Credentials provider queries Prisma directly.
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
