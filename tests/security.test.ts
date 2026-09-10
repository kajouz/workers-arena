import { createHash, randomBytes } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_PASSWORD,
  demoSessionAllowed,
  hashPassword,
  needsPasswordRehash,
  verifyPassword,
} from "../src/lib/security";

// ─────────────────────────────────────────────────────────────────────────────
// scrypt password hashing (src/lib/security.ts).
//
// hashPassword emits `scrypt$N$r$p$<saltHex>$<hashHex>`; verifyPassword accepts
// that format AND the legacy `salt:sha256(salt+password)` scheme (pre-migration
// rows), with rehash-on-login upgrade handled by src/auth.ts via
// needsPasswordRehash().
// ─────────────────────────────────────────────────────────────────────────────

/** Legacy-format hash (the old demo-grade scheme) for migration tests. */
function legacyHash(password: string, salt = randomBytes(16).toString("hex")): string {
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return `${salt}:${hash}`;
}

describe("hashPassword (scrypt)", () => {
  it("emits the self-describing scrypt format with the configured costs", () => {
    const stored = hashPassword(DEMO_PASSWORD);
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(1 << 14); // N
    expect(Number(parts[2])).toBe(8); // r
    expect(Number(parts[3])).toBe(1); // p
    // 16-byte salt + 64-byte hash, hex-encoded
    expect(parts[4]).toMatch(/^[0-9a-f]{32}$/);
    expect(parts[5]).toMatch(/^[0-9a-f]{128}$/);
  });

  it("produces a unique salt per call (no hash reuse)", () => {
    expect(hashPassword(DEMO_PASSWORD)).not.toBe(hashPassword(DEMO_PASSWORD));
  });

  it("accepts an explicit salt (deterministic — used by tests/seed)", () => {
    const salt = randomBytes(16).toString("hex");
    expect(hashPassword(DEMO_PASSWORD, salt)).toBe(hashPassword(DEMO_PASSWORD, salt));
  });
});

describe("verifyPassword", () => {
  it("verifies the correct password against a scrypt hash", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored = hashPassword(DEMO_PASSWORD);
    expect(verifyPassword("wrong-password", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("rejects malformed stored hashes without throwing", () => {
    expect(verifyPassword(DEMO_PASSWORD, "")).toBe(false);
    expect(verifyPassword(DEMO_PASSWORD, "garbage")).toBe(false);
    expect(verifyPassword(DEMO_PASSWORD, "scrypt$bad")).toBe(false);
    // Wrong part count
    expect(verifyPassword(DEMO_PASSWORD, "scrypt$32768$8$1$salt")).toBe(false);
    // Absurd costs (crafted row → CPU-pin DoS) must be rejected, not derived
    expect(verifyPassword(DEMO_PASSWORD, `scrypt$${1 << 30}$8$1$ab$${"0".repeat(128)}`)).toBe(false);
  });

  it("verifies legacy salt:sha256 rows (pre-migration)", () => {
    const stored = legacyHash("legacy-password");
    expect(verifyPassword("legacy-password", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("uses timing-safe comparison (same-length mismatch still false)", () => {
    const stored = hashPassword(DEMO_PASSWORD);
    const sameLengthWrong = "A".repeat(DEMO_PASSWORD.length);
    expect(verifyPassword(sameLengthWrong, stored)).toBe(false);
  });
});

describe("needsPasswordRehash", () => {
  it("flags legacy salt:sha256 rows for upgrade", () => {
    expect(needsPasswordRehash(legacyHash(DEMO_PASSWORD))).toBe(true);
  });

  it("does not flag scrypt rows", () => {
    expect(needsPasswordRehash(hashPassword(DEMO_PASSWORD))).toBe(false);
  });

  it("does not flag malformed rows (they fail verify before this matters)", () => {
    expect(needsPasswordRehash("garbage")).toBe(false);
  });
});

describe("demoSessionAllowed (production guard)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows the demo cookie session outside production", () => {
    expect(demoSessionAllowed()).toBe(true);
  });

  it("refuses the demo cookie session when NODE_ENV=production (DEMO_MODE unset)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(demoSessionAllowed()).toBe(false);
  });

  it("still refuses when DEMO_MODE is explicitly 'false'", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "false");
    expect(demoSessionAllowed()).toBe(false);
  });

  it("allows demo when production runs with DEMO_MODE=true (explicit opt-in)", () => {
    // The documented contract: prod-build E2E boots with DEMO_MODE=true on
    // purpose (keyless, database-free). Deliberate ≠ misconfigured.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    expect(demoSessionAllowed()).toBe(true);
  });
});
