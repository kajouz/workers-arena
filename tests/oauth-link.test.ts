/**
 * linkOAuthUser — a Google sign-in resolves to a real User row by verified
 * email (src/lib/server/oauth-link.ts). A tiny in-memory stand-in for
 * prisma.user keeps this runnable without a database.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { linkOAuthUser } from "@/lib/server/oauth-link";

type Row = { id: string; email: string; name: string; role: string; hue: number; isActive: boolean; image?: string | null };

let rows: Row[];
const fakePrisma = {
  user: {
    findUnique: async ({ where }: { where: { email: string } }) => rows.find((r) => r.email === where.email) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const r = rows.find((x) => x.id === where.id)!;
      Object.assign(r, data);
      return r;
    },
    upsert: async ({ where, create }: { where: { email: string }; create: Omit<Row, "id" | "role" | "isActive"> }) => {
      const found = rows.find((r) => r.email === where.email);
      if (found) return found;
      const row: Row = { id: `u-${rows.length + 1}`, role: "CUSTOMER", isActive: true, ...create };
      rows.push(row);
      return row;
    },
  },
} as unknown as Parameters<typeof linkOAuthUser>[0];

beforeEach(() => {
  rows = [
    { id: "u-sara", email: "sara@example.com", name: "Sara", role: "CUSTOMER", hue: 200, isActive: true },
    { id: "u-khaled", email: "khaled@plumbfix.lb", name: "Khaled", role: "WORKER", hue: 25, isActive: true },
    { id: "u-gone", email: "gone@example.com", name: "Gone", role: "CUSTOMER", hue: 1, isActive: false },
  ];
});

describe("linkOAuthUser", () => {
  it("signs an existing account in as itself, keeping its role", async () => {
    expect(await linkOAuthUser(fakePrisma, { email: "Khaled@PlumbFix.lb", emailVerified: true })).toEqual({
      id: "u-khaled",
      role: "worker",
      hue: 25,
    });
  });

  it("creates a customer account for a new verified email", async () => {
    const linked = await linkOAuthUser(fakePrisma, { email: "new@example.com", name: "New Person", emailVerified: true });
    expect(linked?.role).toBe("customer");
    expect(rows.find((r) => r.email === "new@example.com")).toMatchObject({ id: linked!.id, name: "New Person" });
    // A second sign-in lands on the same row.
    expect((await linkOAuthUser(fakePrisma, { email: "new@example.com", emailVerified: true }))?.id).toBe(linked!.id);
  });

  it("refuses an unverified email, even for an existing account", async () => {
    expect(await linkOAuthUser(fakePrisma, { email: "sara@example.com", emailVerified: false })).toBeNull();
  });

  it("refuses a deactivated account and a profile with no email", async () => {
    expect(await linkOAuthUser(fakePrisma, { email: "gone@example.com", emailVerified: true })).toBeNull();
    expect(await linkOAuthUser(fakePrisma, { email: null, emailVerified: true })).toBeNull();
  });
});
