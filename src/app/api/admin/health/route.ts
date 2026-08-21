import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";

export const revalidate = 0;

interface HealthCheck {
  status: "healthy" | "degraded" | "down";
  timestamp: string;
  uptime: number;
  checks: {
    database: { status: string; latencyMs: number };
    memory: { usedMB: number; totalMB: number; percentage: number };
    api: { avgResponseMs: number; errorRate: number; requestsLastHour: number };
    cron: { lastRun: string | null; status: string }[];
  };
}

const requestLog: { timestamp: number; duration: number; status: number }[] = [];
const MAX_LOG = 1000;

export function logRequest(duration: number, status: number) {
  requestLog.push({ timestamp: Date.now(), duration, status });
  if (requestLog.length > MAX_LOG) requestLog.splice(0, requestLog.length - MAX_LOG);
}

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentRequests = requestLog.filter((r) => r.timestamp > oneHourAgo);

  const avgResponseMs =
    recentRequests.length > 0
      ? Math.round(recentRequests.reduce((s, r) => s + r.duration, 0) / recentRequests.length)
      : 0;

  const errorCount = recentRequests.filter((r) => r.status >= 500).length;
  const errorRate =
    recentRequests.length > 0
      ? Math.round((errorCount / recentRequests.length) * 100 * 10) / 10
      : 0;

  // Memory usage (Node.js process)
  const mem = process.memoryUsage();
  const usedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const totalMB = Math.round(mem.heapTotal / 1024 / 1024);

  // Database latency check
  const dbStart = Date.now();
  let dbStatus = "healthy";
  let dbLatency = 0;
  try {
    const { getPrisma } = await import("@/lib/server/prisma");
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - dbStart;
    if (dbLatency > 2000) dbStatus = "degraded";
  } catch {
    dbStatus = "down";
    dbLatency = Date.now() - dbStart;
  }

  const health: HealthCheck = {
    status: dbStatus === "down" ? "down" : errorRate > 10 ? "degraded" : "healthy",
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks: {
      database: { status: dbStatus, latencyMs: dbLatency },
      memory: {
        usedMB,
        totalMB,
        percentage: Math.round((usedMB / totalMB) * 100),
      },
      api: {
        avgResponseMs,
        errorRate,
        requestsLastHour: recentRequests.length,
      },
      cron: [
        { lastRun: null, status: "active" },
      ],
    },
  };

  return NextResponse.json(health);
}
