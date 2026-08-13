import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Real-auth swap tests (src/lib/auth-demo.ts → src/auth.ts).
//
// Real mode: DEMO_MODE=false + DATABASE_URL + a real (non-placeholder)
// AUTH_SECRET → getSession() delegates to NextAuth's auth() and maps the
// session into the app's SessionUser shape.
// Demo mode: cookie path preserved (getSession parses the wa_session cookie).
// ─────────────────────────────────────────────────────────────────────────────

// Mock @/auth BEFORE importing auth-demo so the dynamic import inside
// getSession() resolves to the mock.
vi.mock("@/auth", () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}));

// Mock next/headers cookies for the demo-cookie path.
const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

import { getSession, realAuthEnabled, DEMO_USERS, SESSION_COOKIE, type SessionUser } from "../src/lib/auth-demo";
import { auth } from "@/auth";

const REAL_SECRET = "sVf3qJ9mK2xL8pQ5rT7wY0zA4cE6hN1bGdU";

describe("realAuthEnabled gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is false when DEMO_MODE is unset (default demo)", () => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("AUTH_SECRET", REAL_SECRET);
    expect(realAuthEnabled()).toBe(false);
  });

  it("is false when AUTH_SECRET is the placeholder", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("AUTH_SECRET", "replace-me-with-a-long-random-secret");
    expect(realAuthEnabled()).toBe(false);
  });

  it("is false when DATABASE_URL is missing", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_SECRET", REAL_SECRET);
    expect(realAuthEnabled()).toBe(false);
  });

  it("is true only when DEMO_MODE=false + DATABASE_URL + real secret", () => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://ka@localhost:5432/workers_arena_v2");
    vi.stubEnv("AUTH_SECRET", REAL_SECRET);
    expect(realAuthEnabled()).toBe(true);
  });
});

describe("getSession — real mode (NextAuth delegation)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "postgresql://ka@localhost:5432/workers_arena_v2");
    vi.stubEnv("AUTH_SECRET", REAL_SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(auth).mockReset();
  });

  it("maps a NextAuth session into the SessionUser shape (real user id flows)", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "cm-real-cuid-123", name: "Platform Admin", email: "admin@workersarena.com", role: "admin", hue: 280 },
      expires: new Date(Date.now() + 3600e3).toISOString(),
    } as never);

    const session = await getSession();
    expect(session).not.toBeNull();
    expect(session!.id).toBe("cm-real-cuid-123"); // real cuid → userId/actorId FK
    expect(session!.role).toBe("admin");
    expect(session!.name).toBe("Platform Admin");
    expect(session!.email).toBe("admin@workersarena.com");
    expect(session!.hue).toBe(280);
  });

  it("returns null when NextAuth has no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect(await getSession()).toBeNull();
  });

  it("returns null when auth() throws (broken real mode)", async () => {
    vi.mocked(auth).mockRejectedValue(new Error("boom"));
    expect(await getSession()).toBeNull();
  });
});

describe("getSession — demo mode (cookie path preserved)", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AUTH_SECRET", "replace-me-with-a-long-random-secret");
    cookieStore.get.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("parses the wa_session cookie into a SessionUser", async () => {
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(JSON.stringify(DEMO_USERS.admin)),
    });
    const session = await getSession();
    expect(session).toEqual(DEMO_USERS.admin);
    expect(session!.id).toBe("u-admin");
  });

  it("returns null when no cookie is present", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await getSession()).toBeNull();
  });

  it("returns null on a corrupt cookie", async () => {
    cookieStore.get.mockReturnValue({ value: "not-json{" });
    expect(await getSession()).toBeNull();
  });

  it("never calls NextAuth auth() in demo mode", async () => {
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(JSON.stringify(DEMO_USERS.worker)),
    });
    await getSession();
    expect(vi.mocked(auth)).not.toHaveBeenCalled();
  });
});
