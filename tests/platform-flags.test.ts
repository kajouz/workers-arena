/**
 * Enforcement of the admin platform settings: maintenance mode (proxy) and
 * "Allow New Registrations" (registerAction), plus the revenue-stream store's
 * async API.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { maintenanceExempt } from "@/lib/maintenance";
import {
  isMaintenanceMode,
  isRegistrationOpen,
  resetPlatformSettingsStore,
  updatePlatformSettings,
} from "@/lib/data/platform-settings";
import { registerAction } from "@/app/actions/auth";
import {
  getAuditLog,
  getStreamConfig,
  isStreamEnabled,
  resetRevenueSettingsStore,
  toggleStream,
  updateStreamConfig,
} from "@/lib/data/revenue-settings";

const ADMIN = { id: "u-admin", name: "Platform Admin" };

beforeEach(async () => {
  await resetPlatformSettingsStore();
  resetRevenueSettingsStore();
});

describe("maintenanceExempt", () => {
  it.each([
    "/en/admin",
    "/ar/admin/settings",
    "/en/auth/login",
    "/en/maintenance",
    "/api/admin/platform-settings",
    "/api/auth/callback/credentials",
    "/api/session",
    "/api/health",
    "/api/cron/reminders",
    "/api/webhooks/whatsapp",
    "/api/payments/webhook",
    "/sw.js",
    "/manifest.webmanifest",
  ])("keeps %s open", (path) => expect(maintenanceExempt(path)).toBe(true));

  it.each(["/en", "/ar", "/en/search", "/en/auth/register", "/en/dashboard", "/en/administration", "/api/workers", "/api/ads"])(
    "closes %s",
    (path) => expect(maintenanceExempt(path)).toBe(false)
  );
});

describe("platform flags", () => {
  it("follow the saved settings, and a save clears the cache", async () => {
    expect(await isMaintenanceMode()).toBe(false);
    expect(await isRegistrationOpen()).toBe(true);
    await updatePlatformSettings({ maintenance_mode: true, registration_enabled: false }, ADMIN);
    expect(await isMaintenanceMode()).toBe(true);
    expect(await isRegistrationOpen()).toBe(false);
  });
});

describe("registerAction", () => {
  const form = () => {
    const f = new FormData();
    f.set("name", "New Person");
    f.set("email", "new.person@example.com");
    f.set("password", "Password123!");
    f.set("confirmPassword", "Password123!");
    f.set("role", "customer");
    f.set("terms", "on");
    return f;
  };

  it("refuses when registrations are closed", async () => {
    await updatePlatformSettings({ registration_enabled: false }, ADMIN);
    expect(await registerAction({}, form())).toEqual({ error: "registrationClosed" });
  });
});

describe("revenue settings store", () => {
  it("keeps a toggle and a settings update, with audit entries", async () => {
    const before = await isStreamEnabled("credits");
    await toggleStream("credits", !before, ADMIN.id, ADMIN.name);
    expect(await isStreamEnabled("credits")).toBe(!before);

    await updateStreamConfig("credits", { settings: { freeCreditsOnSignup: 9 } }, ADMIN.id, ADMIN.name);
    expect((await getStreamConfig("credits"))?.settings.freeCreditsOnSignup).toBe(9);
    // Both entries can share a millisecond, so their newest-first order is not defined.
    expect((await getAuditLog()).map((a) => a.action).sort()).toEqual([before ? "disabled" : "enabled", "settings_updated"].sort());
  });

  it("never lets an update change a stream's identity", async () => {
    await updateStreamConfig("credits", { id: "tokens", createdAt: "1999-01-01" } as never, ADMIN.id, ADMIN.name);
    const cfg = await getStreamConfig("credits");
    expect(cfg?.id).toBe("credits");
    expect(cfg?.createdAt).not.toBe("1999-01-01");
  });

  // isStreamEnabled returns a Promise now; `if (!isStreamEnabled(x))` would
  // test the Promise (always truthy) and silently treat every stream as on.
  it("is awaited at every call site", () => {
    const fns = /\b(isStreamEnabled|getStreamConfig|getAllStreamConfigs|getAuditLog|getAuditLogForStream|getStreamSetting|updateStreamConfig|toggleStream)\(/g;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !p.endsWith("revenue-settings.ts")) {
          readFileSync(p, "utf8").split("\n").forEach((line, i) => {
            for (const m of line.matchAll(fns)) {
              const before = line.slice(0, m.index);
              if (!/await\s*$/.test(before) && !/function\s*$/.test(before)) offenders.push(`${p}:${i + 1}`);
            }
          });
        }
      }
    };
    walk(join(process.cwd(), "src"));
    expect(offenders).toEqual([]);
  });
});
