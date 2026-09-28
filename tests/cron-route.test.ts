/**
 * cronRoute: the wrapper every /api/cron/* handler goes through. The database
 * sleeps when idle, and the first query after that used to fail the job with
 * an empty 500 after Prisma's 10 s pool timeout.
 */
import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cronRoute, isTransientDbError } from "@/lib/cron-route";

const req = () => new Request("http://x/api/cron/test");
const prismaError = (code: string) => Object.assign(new Error(`prisma ${code}`), { code });

describe("isTransientDbError", () => {
  it.each(["P1001", "P1002", "P1008", "P1017", "P2024"])("treats %s as transient", (code) => {
    expect(isTransientDbError(prismaError(code))).toBe(true);
  });
  it("recognises the pool-timeout message without a code", () => {
    expect(isTransientDbError(new Error("Timed out fetching a new connection from the connection pool"))).toBe(true);
  });
  it("does not retry real query errors", () => {
    expect(isTransientDbError(prismaError("P2002"))).toBe(false);
    expect(isTransientDbError(new TypeError("x is undefined"))).toBe(false);
  });
});

describe("cronRoute", () => {
  it("retries once after a transient database error", async () => {
    vi.useFakeTimers();
    const handler = vi.fn().mockRejectedValueOnce(prismaError("P2024")).mockResolvedValueOnce(Response.json({ ok: true }));
    const pending = cronRoute("test", handler)(req());
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it("returns a JSON error with the code instead of an empty 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cronRoute("test", async () => { throw prismaError("P2002"); })(req());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, job: "test", error: "P2002", transient: false });
  });

  it("answers 503 when the database is still unreachable after the retry", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handler = vi.fn().mockRejectedValue(prismaError("P1001"));
    const pending = cronRoute("test", handler)(req());
    await vi.runAllTimersAsync();
    const res = await pending;
    vi.useRealTimers();
    expect(handler).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(503);
  });

  it("wraps every cron route", () => {
    const dir = join(process.cwd(), "src/app/api/cron");
    const unwrapped = readdirSync(dir).filter((name) => {
      const src = readFileSync(join(dir, name, "route.ts"), "utf8");
      return /export async function (GET|POST)\(/.test(src) || !src.includes("cronRoute(");
    });
    expect(unwrapped).toEqual([]);
  });
});
