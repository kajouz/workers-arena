import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/search/sync — auth guard (audit point #4).
//
// The route is operational (full Meilisearch reindex): either a signed-in
// ADMIN session or the CRON_SECRET header/query is required, exactly like the
// cron endpoints and the other admin APIs. These tests exercise the route
// handler with next/headers' cookies mocked (same seam as tests/auth.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock("@/lib/search/meilisearch", () => ({
  syncWorkersToMeilisearch: vi.fn(async () => ({ indexed: 42 })),
}));

import { POST } from "../src/app/api/search/sync/route";
import { syncWorkersToMeilisearch } from "@/lib/search/meilisearch";

const ADMIN_COOKIE = encodeURIComponent(
  JSON.stringify({
    id: "u-admin",
    name: "Platform Admin",
    email: "admin@workersarena.com",
    role: "admin",
    hue: 280,
  })
);

function post(url = "http://localhost/api/search/sync", headers: Record<string, string> = {}) {
  return POST(new Request(url, { method: "POST", headers }));
}

describe("POST /api/search/sync — auth guard", () => {
  beforeEach(() => {
    cookieStore.get.mockReset();
    vi.mocked(syncWorkersToMeilisearch).mockClear();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("401s an anonymous POST (no cookie, no secret) and never indexes", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const res = await post();
    expect(res.status).toBe(401);
    expect(vi.mocked(syncWorkersToMeilisearch)).not.toHaveBeenCalled();
  });

  it("401s a non-admin session (worker)", async () => {
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(
        JSON.stringify({
          id: "u-worker",
          name: "Khaled Al-Harbi",
          email: "khaled@plumbfix.sa",
          role: "worker",
          hue: 25,
        })
      ),
    });
    const res = await post();
    expect(res.status).toBe(401);
    expect(vi.mocked(syncWorkersToMeilisearch)).not.toHaveBeenCalled();
  });

  it("accepts an admin session", async () => {
    cookieStore.get.mockReturnValue({ value: ADMIN_COOKIE });
    const res = await post();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { indexed: number };
    expect(body.indexed).toBe(42);
    expect(vi.mocked(syncWorkersToMeilisearch)).toHaveBeenCalledTimes(1);
  });

  it("accepts the CRON_SECRET via the x-cron-secret header", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const res = await post("http://localhost/api/search/sync", {
      "x-cron-secret": "test-cron-secret",
    });
    expect(res.status).toBe(200);
  });

  it("accepts the CRON_SECRET via ?secret= (header-less schedulers)", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const res = await post("http://localhost/api/search/sync?secret=test-cron-secret");
    expect(res.status).toBe(200);
  });

  it("rejects a WRONG secret even with a worker cookie present", async () => {
    cookieStore.get.mockReturnValue({
      value: encodeURIComponent(
        JSON.stringify({
          id: "u-worker",
          name: "Khaled Al-Harbi",
          email: "khaled@plumbfix.sa",
          role: "worker",
          hue: 25,
        })
      ),
    });
    const res = await post("http://localhost/api/search/sync", {
      "x-cron-secret": "wrong-secret",
    });
    expect(res.status).toBe(401);
    expect(vi.mocked(syncWorkersToMeilisearch)).not.toHaveBeenCalled();
  });

  it("fails closed when CRON_SECRET is unset (no bypass with an empty header)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    cookieStore.get.mockReturnValue(undefined);
    const res = await post("http://localhost/api/search/sync", { "x-cron-secret": "" });
    expect(res.status).toBe(401);
  });
});
