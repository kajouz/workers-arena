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
import { signSessionPayload } from "../src/lib/security";
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

  it("REFUSES the demo cookie when NODE_ENV=production (production guard)", async () => {
    // The demo cookie is an unsigned JSON blob granting any role (incl. admin),
    // so production must never honor it: an unset/"false" DEMO_MODE on a deploy
    // means the app fails loud instead of trusting the forgeable session.
    vi.stubEnv("NODE_ENV", "production");
    // Pin the misconfigured-deploy case: DEMO_MODE unset or "false". (stubEnv
    // can't unset, so "" stands in — both take the same refuse branch. The
    // ambient value must never leak in: a dev .env with DEMO_MODE=true would
    // otherwise flip this test green while production misconfigures.)
    vi.stubEnv("DEMO_MODE", "");
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(JSON.stringify(DEMO_USERS.admin)),
    });
    const session = await getSession();
    expect(session).toBeNull();
    expect(vi.mocked(auth)).not.toHaveBeenCalled(); // guard fires before NextAuth
  });

  it("REFUSES the demo cookie in production even when DEMO_MODE=true", async () => {
    // Regression pin for the live hole: the production deployment runs the demo
    // DATASET (DEMO_MODE=true), and gating the unsigned cookie on that same flag
    // meant `curl -H 'Cookie: wa_session={"role":"admin"}' /api/admin/retention`
    // returned 200 to anyone. Data mode and cookie trust are separate switches.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(JSON.stringify(DEMO_USERS.admin)),
    });
    const session = await getSession();
    expect(session).toBeNull();
    expect(vi.mocked(auth)).not.toHaveBeenCalled();
  });

  it("HONORS the demo cookie in production only for the E2E opt-in flag", async () => {
    // The e2e prod matrix / CI Playwright job boot production servers and sign
    // in by seeding the cookie directly, so they set ALLOW_UNSIGNED_DEMO_COOKIE
    // (test-only, alongside RATE_LIMIT_DISABLED). Real deploys never set it.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("ALLOW_UNSIGNED_DEMO_COOKIE", "1");
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(JSON.stringify(DEMO_USERS.admin)),
    });
    const session = await getSession();
    expect(session).toMatchObject({ role: "admin" });
    expect(vi.mocked(auth)).not.toHaveBeenCalled();
  });

  it("still honors a SIGNED session cookie in production without the test flag", async () => {
    // The guard must not lock anyone out: setSession() writes base64url+HMAC, so
    // the demo deployment's real logins (and the one-click demo buttons) keep
    // working — only the unsigned forgery path is closed. Note NO
    // ALLOW_UNSIGNED_DEMO_COOKIE here: signing alone is sufficient.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true"); // the live deployment's data mode
    vi.stubEnv("AUTH_SECRET", "test-secret-for-signing");
    const payload = Buffer.from(JSON.stringify(DEMO_USERS.worker)).toString("base64url");
    cookieStore.get.mockReturnValue({ value: encodeURIComponent(signSessionPayload(payload)) });
    const session = await getSession();
    expect(session).toMatchObject({ id: DEMO_USERS.worker.id });
  });

  it("rejects a TAMPERED signed cookie in production (signature is not decorative)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    vi.stubEnv("AUTH_SECRET", "test-secret-for-signing");
    // Swap the payload but keep the original signature — the forgery shape.
    const payload = Buffer.from(JSON.stringify(DEMO_USERS.worker)).toString("base64url");
    const forged = Buffer.from(JSON.stringify(DEMO_USERS.admin)).toString("base64url");
    const signed = signSessionPayload(payload).replace(payload, forged);
    cookieStore.get.mockReturnValue({ value: encodeURIComponent(signed) });
    expect(await getSession()).toBeNull();
  });
});
