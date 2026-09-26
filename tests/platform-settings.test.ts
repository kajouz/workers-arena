/**
 * Admin platform settings (/admin/settings) persist through the store and the
 * admin-only API — the Save button used to only wait a second and discard.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));
vi.mock("@/lib/auth-demo", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSession: getSessionMock,
}));

import {
  defaultPlatformSettings,
  mergeWithDefaults,
  validatePlatformSetting,
  PLATFORM_SETTING_SECTIONS,
} from "@/lib/data/platform-settings-schema";
import {
  getPlatformSettings,
  resetPlatformSettingsStore,
  updatePlatformSettings,
} from "@/lib/data/platform-settings";
import { ACTION_CODES, getAdminActivityFeed, resetAdminActivityFeed } from "@/lib/data/activity";
import { GET, PUT } from "@/app/api/admin/platform-settings/route";

const ADMIN = { id: "u-admin", name: "Platform Admin", email: "admin@workersarena.com", role: "admin", hue: 280 };
const WORKER = { ...ADMIN, id: "u-worker", name: "Khaled", role: "worker" };

function put(settings: unknown) {
  return PUT(new Request("http://x/api/admin/platform-settings", { method: "PUT", body: JSON.stringify({ settings }) }));
}

beforeEach(async () => {
  resetPlatformSettingsStore();
  await resetAdminActivityFeed();
  getSessionMock.mockReset();
});

describe("platform settings schema", () => {
  it("has a unique id and a valid default for every setting", () => {
    const ids = PLATFORM_SETTING_SECTIONS.flatMap((s) => s.settings.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, value] of Object.entries(defaultPlatformSettings())) {
      expect(validatePlatformSetting(id, value), id).toBeNull();
    }
  });

  it("rejects unknown keys and wrong types", () => {
    expect(validatePlatformSetting("nope", true)).toMatch(/unknown setting/);
    expect(validatePlatformSetting("maintenance_mode", "yes")).toMatch(/true or false/);
    expect(validatePlatformSetting("reminder_hours", Number.NaN)).toMatch(/number/);
    expect(validatePlatformSetting("max_login_attempts", 0)).toMatch(/at least 1/);
    expect(validatePlatformSetting("default_language", "fr")).toMatch(/one of en, ar/);
    expect(validatePlatformSetting("site_name", "x".repeat(201))).toMatch(/at most 200/);
  });

  it("drops stale stored keys and invalid stored values when merging", () => {
    const merged = mergeWithDefaults({ site_name: "Arena", removed_setting: 1, reminder_hours: "soon" });
    expect(merged.site_name).toBe("Arena");
    expect(merged).not.toHaveProperty("removed_setting");
    expect(merged.reminder_hours).toBe(24);
  });
});

describe("platform settings store", () => {
  it("persists a partial update and keeps the other values", async () => {
    const res = await updatePlatformSettings({ site_name: "Arena LB", reminder_hours: 12 }, ADMIN);
    expect(res).toMatchObject({ ok: true, changed: ["site_name", "reminder_hours"] });

    const now = await getPlatformSettings();
    expect(now.site_name).toBe("Arena LB");
    expect(now.reminder_hours).toBe(12);
    expect(now.maintenance_mode).toBe(false);
  });

  it("saves nothing when any key is invalid", async () => {
    const res = await updatePlatformSettings({ site_name: "Arena LB", maintenance_mode: "on" }, ADMIN);
    expect(res.ok).toBe(false);
    expect((await getPlatformSettings()).site_name).toBe("WorkersArena");
  });

  it("logs changed keys to the admin activity feed, and skips no-op saves", async () => {
    await updatePlatformSettings({ enable_sms: true }, ADMIN);
    await updatePlatformSettings({ enable_sms: true }, ADMIN);
    const entries = (await getAdminActivityFeed()).filter((e) => e.code === ACTION_CODES.PLATFORM_SETTINGS_UPDATED);
    expect(entries).toHaveLength(1);
    expect(entries[0].actionEn).toContain("enable_sms");
  });
});

describe("/api/admin/platform-settings", () => {
  it("refuses anonymous and non-admin callers", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    getSessionMock.mockResolvedValue(WORKER);
    expect((await put({ site_name: "Hijacked" })).status).toBe(401);
    expect((await getPlatformSettings()).site_name).toBe("WorkersArena");
  });

  it("saves for an admin and returns the stored values on the next GET", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const saved = await put({ maintenance_mode: true, default_language: "ar" });
    expect(saved.status).toBe(200);

    const body = (await (await GET()).json()) as { settings: Record<string, unknown> };
    expect(body.settings.maintenance_mode).toBe(true);
    expect(body.settings.default_language).toBe("ar");
  });

  it("returns 400 with the reasons for an invalid patch", async () => {
    getSessionMock.mockResolvedValue(ADMIN);
    const res = await put({ platform_fee_rate: -5 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { errors: string[] }).errors[0]).toMatch(/at least 0/);
  });
});
