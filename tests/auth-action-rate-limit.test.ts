/**
 * Sign-in / sign-up throttles in the auth server actions. The proxy counts
 * server actions in a loose shared bucket, so the strict limits live in the
 * actions themselves (src/app/actions/auth.ts → withinLimits).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { ipRef } = vi.hoisted(() => ({ ipRef: { current: "203.0.113.1" } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "x-forwarded-for": ipRef.current }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// A sign-in that gets through redirects; record it instead of throwing.
vi.mock("@/lib/i18n/redirect", () => ({ localeRedirect: vi.fn(async () => ({})) }));

import { loginAction, registerAction } from "@/app/actions/auth";

function loginForm(email: string) {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", "correct-horse");
  return fd;
}

let n = 0;
beforeEach(() => {
  // A fresh IP and account per test, so the in-memory buckets never overlap.
  n += 1;
  ipRef.current = `203.0.113.${n}`;
  vi.stubEnv("RATE_LIMIT_DISABLED", "");
});

describe("loginAction throttle", () => {
  it("allows 10 attempts per IP in 15 minutes, then refuses", async () => {
    for (let i = 0; i < 10; i++) {
      expect(await loginAction({}, loginForm(`person${n}-${i}@example.com`))).not.toEqual({ error: "rateLimited" });
    }
    expect(await loginAction({}, loginForm(`person${n}-x@example.com`))).toEqual({ error: "rateLimited" });
  });

  it("caps one account across many IPs", async () => {
    const email = `target${n}@example.com`;
    for (let i = 0; i < 10; i++) {
      ipRef.current = `198.51.100.${n * 20 + i}`;
      expect(await loginAction({}, loginForm(email))).not.toEqual({ error: "rateLimited" });
    }
    ipRef.current = `198.51.100.${n * 20 + 19}`;
    expect(await loginAction({}, loginForm(email))).toEqual({ error: "rateLimited" });
  });

  it("is off when RATE_LIMIT_DISABLED=1 (e2e)", async () => {
    vi.stubEnv("RATE_LIMIT_DISABLED", "1");
    for (let i = 0; i < 12; i++) {
      expect(await loginAction({}, loginForm(`e2e${n}@example.com`))).not.toEqual({ error: "rateLimited" });
    }
  });
});

describe("registerAction throttle", () => {
  it("allows 5 sign-ups per IP per hour", async () => {
    const form = () => new FormData(); // invalid shape — still counts as an attempt
    for (let i = 0; i < 5; i++) {
      expect(await registerAction({}, form())).not.toEqual({ error: "rateLimited" });
    }
    expect(await registerAction({}, form())).toEqual({ error: "rateLimited" });
  });
});
