import { ACTION_CODES, logAdminActivity } from "./activity";
import {
  mergeWithDefaults,
  validatePlatformSetting,
  type PlatformSettingValues,
} from "./platform-settings-schema";

/**
 * Platform settings store — dual adapter: real mode (DEMO_MODE=false +
 * DATABASE_URL) keeps one JSON row in the `Setting` table; demo mode keeps a
 * JSON file (default `.data/platform-settings.json`, PLATFORM_SETTINGS_FILE
 * overrides it). A file rather than process memory because the proxy, which
 * enforces maintenance mode, doesn't share module state with the route
 * handler that saves the settings. Where the filesystem is read-only (the
 * Vercel demo deploy) the values fall back to process memory.
 */
import path from "node:path";

/** The `Setting.key` holding the whole map (only the changed keys are ever merged in). */
export const PLATFORM_SETTINGS_KEY = "platform";

function realSettingsEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

const GLOBAL_KEY = "__workersArenaPlatformSettings";
const g = globalThis as Record<string, unknown>;

function demoFile(): string {
  return process.env.PLATFORM_SETTINGS_FILE ?? path.join(process.cwd(), ".data", "platform-settings.json");
}

async function demoRead(): Promise<Record<string, unknown>> {
  try {
    const fs = await import("node:fs/promises");
    const parsed = JSON.parse(await fs.readFile(demoFile(), "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // missing, unreadable or corrupt → fall through to memory
  }
  return (g[GLOBAL_KEY] as Record<string, unknown> | undefined) ?? {};
}

/** Atomic (temp file + rename); memory is always updated so a read-only
 * filesystem still keeps the values for this process. */
async function demoWrite(values: PlatformSettingValues): Promise<void> {
  g[GLOBAL_KEY] = { ...values };
  const file = demoFile();
  try {
    const fs = await import("node:fs/promises");
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
    await fs.writeFile(tmp, JSON.stringify(values, null, 2), "utf8");
    await fs.rename(tmp, file);
  } catch (err) {
    console.warn("[platform-settings] demo file not writable, keeping values in memory only:", (err as Error).message);
  }
}

/** Test helper: forget the demo-mode values. */
export async function resetPlatformSettingsStore(): Promise<void> {
  delete g[GLOBAL_KEY];
  flagsCache = null;
  const fs = await import("node:fs/promises");
  await fs.rm(demoFile(), { force: true });
}

async function readStored(): Promise<unknown> {
  if (!realSettingsEnabled()) return demoRead();
  const { getPrisma } = await import("@/lib/server/prisma");
  const row = await getPrisma().setting.findUnique({ where: { key: PLATFORM_SETTINGS_KEY } });
  return row?.value ?? {};
}

async function writeStored(values: PlatformSettingValues): Promise<void> {
  if (!realSettingsEnabled()) return demoWrite(values);
  const { getPrisma } = await import("@/lib/server/prisma");
  await getPrisma().setting.upsert({
    where: { key: PLATFORM_SETTINGS_KEY },
    create: { key: PLATFORM_SETTINGS_KEY, value: values },
    update: { value: values },
  });
}

/** Every setting: the saved value, or its default. */
export async function getPlatformSettings(): Promise<PlatformSettingValues> {
  return mergeWithDefaults(await readStored());
}

// ─── Enforced flags ──────────────────────────────────────────────────────────
// The proxy checks maintenance mode on every request, so the settings are
// cached per server instance for FLAGS_TTL_MS. A save on this instance clears
// the cache; other instances pick the change up within the TTL.
const FLAGS_TTL_MS = 10_000;
let flagsCache: { at: number; values: PlatformSettingValues } | null = null;

async function cachedSettings(): Promise<PlatformSettingValues> {
  if (flagsCache && Date.now() - flagsCache.at < FLAGS_TTL_MS) return flagsCache.values;
  try {
    flagsCache = { at: Date.now(), values: await getPlatformSettings() };
  } catch (err) {
    // A database blip must not take the whole site down (or up): keep the last
    // known values, or the defaults if there are none.
    console.error("[platform-settings] read failed, using last known values:", err);
    flagsCache = { at: Date.now(), values: flagsCache?.values ?? mergeWithDefaults({}) };
  }
  return flagsCache.values;
}

/** Maintenance mode: the public site is replaced by the maintenance page. */
export async function isMaintenanceMode(): Promise<boolean> {
  return (await cachedSettings()).maintenance_mode === true;
}

/** Whether the sign-up form may create new accounts. */
export async function isRegistrationOpen(): Promise<boolean> {
  return (await cachedSettings()).registration_enabled !== false;
}

export type UpdatePlatformSettingsResult =
  | { ok: true; settings: PlatformSettingValues; changed: string[] }
  | { ok: false; errors: string[] };

/**
 * Apply a partial update. All-or-nothing: one invalid or unknown key rejects
 * the whole patch. Only keys whose value actually changes are written and
 * logged to the admin activity feed.
 */
export async function updatePlatformSettings(
  patch: unknown,
  actor: { id?: string; name: string }
): Promise<UpdatePlatformSettingsResult> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, errors: ["settings must be an object of setting id → value"] };
  }
  const entries = Object.entries(patch as Record<string, unknown>);
  const errors = entries.map(([id, value]) => validatePlatformSetting(id, value)).filter((e): e is string => e !== null);
  if (errors.length > 0) return { ok: false, errors };

  const current = await getPlatformSettings();
  const changed = entries.filter(([id, value]) => current[id] !== value).map(([id]) => id);
  if (changed.length === 0) return { ok: true, settings: current, changed };

  const next = { ...current, ...(Object.fromEntries(entries) as PlatformSettingValues) };
  await writeStored(next);
  flagsCache = null;

  const list = changed.join(", ");
  await logAdminActivity({
    code: ACTION_CODES.PLATFORM_SETTINGS_UPDATED,
    actionEn: `${actor.name} updated platform settings: ${list}`,
    actionAr: `${actor.name} حدّث إعدادات المنصة: ${list}`,
    actor: actor.name,
    ...(actor.id ? { actorId: actor.id } : {}),
    type: "system",
  });

  return { ok: true, settings: next, changed };
}
