import { NextResponse } from "next/server";

/**
 * Prisma error codes that mean "the database wasn't reachable in time" rather
 * than "the query was wrong": can't reach server (P1001), timed out
 * connecting (P1002, P1008), connection closed (P1017), and no free pool
 * connection within pool_timeout (P2024). The Layerbase database sleeps when
 * idle; the first query after that waits for it to wake, and with Prisma's
 * 10 s pool_timeout the scheduled jobs failed with an empty 500 after ~13 s.
 */
const TRANSIENT_DB_CODES = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);

export function isTransientDbError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && TRANSIENT_DB_CODES.has(code)) return true;
  const message = err instanceof Error ? err.message : String(err);
  return /Can't reach database server|Timed out fetching a new connection|Connection (?:terminated|closed)/i.test(message);
}

const RETRY_DELAY_MS = 3_000;

type Handler = (req: Request) => Promise<Response>;

/**
 * Wrap a cron route handler: one retry after a transient database error (the
 * jobs are idempotent, so a second run is safe), and a JSON error body with
 * the error code instead of Next's empty 500, so a failed run in the
 * scheduler's log says why.
 */
export function cronRoute(job: string, handler: Handler): Handler {
  return async (req) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await handler(req);
      } catch (err) {
        const code = (err as { code?: unknown } | null)?.code;
        if (attempt === 1 && isTransientDbError(err)) {
          console.warn(`[cron:${job}] transient database error (${String(code ?? "unknown")}), retrying in ${RETRY_DELAY_MS} ms`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        console.error(`[cron:${job}] failed:`, err);
        return NextResponse.json(
          { ok: false, job, error: typeof code === "string" ? code : "internal_error", transient: isTransientDbError(err) },
          { status: isTransientDbError(err) ? 503 : 500 }
        );
      }
    }
  };
}
