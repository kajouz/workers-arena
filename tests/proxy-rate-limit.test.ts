import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

/**
 * The proxy's POST rate limiting, as seen from the client.
 *
 * Next.js SERVER ACTIONS post to the CURRENT PAGE ROUTE with a `next-action`
 * header, so the form budget (10/min per IP+path) counted the app's own UI:
 * blocking a slot, accepting a booking and sending a chat message are each one
 * POST to /dashboard, so ten presses in a minute returned 429 and the action
 * died client-side with "An unexpected response was received from the server."
 * — the page just looked broken. Actions now have their own looser bucket;
 * real form POSTs keep the strict one.
 *
 * The limiter state is module-level and keyed by IP+path, so each case uses its
 * own path to stay independent of the others.
 */

function makeRequest(url: string, opts: { method?: string; action?: boolean; ip?: string } = {}): NextRequest {
  const headers = new Headers();
  if (opts.ip) headers.set("x-forwarded-for", opts.ip);
  if (opts.action) headers.set("next-action", "40a1b2c3d4");
  return {
    nextUrl: new URL(url),
    headers,
    method: opts.method ?? "POST",
  } as unknown as NextRequest;
}

/** Fire `n` identical POSTs and return the statuses. */
async function post(path: string, n: number, opts: { action?: boolean; ip?: string } = {}): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    const res = await proxy(makeRequest(`http://localhost${path}`, opts));
    statuses.push(res.status);
  }
  return statuses;
}

describe("proxy rate limiting", () => {
  it("throttles real form POSTs past the strict budget", async () => {
    const statuses = await post("/contact", 11, { ip: "10.0.0.1" });
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("does not throttle a page's server actions like form submissions", async () => {
    // Ten is the whole point: the old budget stopped here, and a worker
    // blocking slots on /dashboard crosses it in seconds.
    const statuses = await post("/dashboard", 30, { action: true, ip: "10.0.0.2" });
    expect(statuses.every((s) => s === 200), "server actions must not be form-throttled").toBe(true);
  });

  it("still caps server actions — the loose bucket is a cap, not an exemption", async () => {
    const statuses = await post("/admin", 121, { action: true, ip: "10.0.0.3" });
    expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
    expect(statuses[120]).toBe(429);
  });

  it("keeps the two buckets independent for the same IP and path", async () => {
    // A form POST and an action POST to the same path must not share a counter:
    // an action-heavy page would otherwise exhaust the form budget for a real
    // submission (and vice versa).
    const form = await post("/bookings", 10, { ip: "10.0.0.4" });
    const actions = await post("/bookings", 10, { action: true, ip: "10.0.0.4" });
    expect(form.every((s) => s === 200)).toBe(true);
    expect(actions.every((s) => s === 200)).toBe(true);
    // The form bucket is now exhausted (its 11th call is the reject)…
    const formAgain = await post("/bookings", 1, { ip: "10.0.0.4" });
    expect(formAgain[0]).toBe(429);
    // …while the action bucket still admits traffic.
    const actionsAgain = await post("/bookings", 1, { action: true, ip: "10.0.0.4" });
    expect(actionsAgain[0]).toBe(200);
  });

  it("rate-limits per IP, so one client cannot spend another's budget", async () => {
    const a = await post("/faq", 10, { ip: "10.0.0.5" });
    const b = await post("/faq", 10, { ip: "10.0.0.6" });
    expect(a.every((s) => s === 200)).toBe(true);
    expect(b.every((s) => s === 200)).toBe(true);
  });
});
