import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveDatasourceUrl } from "@/lib/server/prisma";

const URL_BASE = "postgresql://user:secret@db.example.com:6543/app";

describe("resolveDatasourceUrl (per-instance Prisma pool cap on Vercel)", () => {
  it("adds connection_limit=1 on Vercel when the URL has none", () => {
    const out = resolveDatasourceUrl({ VERCEL: "1", DATABASE_URL: `${URL_BASE}?sslmode=require` });
    const url = new URL(out!);
    expect(url.searchParams.get("connection_limit")).toBe("1");
    // Existing params, credentials and host survive.
    expect(url.searchParams.get("sslmode")).toBe("require");
    expect(url.username).toBe("user");
    expect(url.password).toBe("secret");
    expect(url.host).toBe("db.example.com:6543");
  });

  it("respects an explicit connection_limit", () => {
    expect(
      resolveDatasourceUrl({ VERCEL: "1", DATABASE_URL: `${URL_BASE}?connection_limit=5` }),
    ).toBeUndefined();
  });

  it("leaves Prisma's default behaviour off Vercel", () => {
    expect(resolveDatasourceUrl({ DATABASE_URL: URL_BASE })).toBeUndefined();
  });

  it("returns undefined with no or an unparseable DATABASE_URL", () => {
    expect(resolveDatasourceUrl({ VERCEL: "1" })).toBeUndefined();
    expect(resolveDatasourceUrl({ VERCEL: "1", DATABASE_URL: "not a url" })).toBeUndefined();
  });
});

describe("no route opens its own PrismaClient", () => {
  it("forum API routes use the shared getPrisma() client", () => {
    for (const rel of ["route.ts", "[id]/route.ts", "[id]/vote/route.ts"]) {
      const src = readFileSync(join(process.cwd(), "src/app/api/forum", rel), "utf8");
      expect(src).not.toContain("new PrismaClient(");
      expect(src).toContain("getPrisma()");
    }
  });
});
