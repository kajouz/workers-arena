import { ACTION_CODES, logAdminActivity } from "./activity";
import {
  mergeWithDefaults,
  validatePlatformSetting,
  type PlatformSettingValues,
} from "./platform-settings-schema";

/**
 * Platform settings store — dual adapter, like the fee-rule store: real mode
 * (DEMO_MODE=false + DATABASE_URL) keeps one JSON row in the `Setting` table;
 * demo mode keeps the values in process memory.
 */

/** The `Setting.key` holding the whole map (only the changed keys are ever merged in). */
export const PLATFORM_SETTINGS_KEY = "platform";

function realSettingsEnabled(): boolean {
  return process.env.DEMO_MODE === "false" && Boolean(process.env.DATABASE_URL);
}

const GLOBAL_KEY = "__workersArenaPlatformSettings";
const g = globalThis as Record<string, unknown>;

function demoStored(): Record<string, unknown> {
  return (g[GLOBAL_KEY] as Record<string, unknown> | undefined) ?? {};
}

/** Test helper: forget the demo-mode values. */
export function resetPlatformSettingsStore(): void {
  delete g[GLOBAL_KEY];
}

async function readStored(): Promise<unknown> {
  if (!realSettingsEnabled()) return demoStored();
  const { getPrisma } = await import("@/lib/server/prisma");
  const row = await getPrisma().setting.findUnique({ where: { key: PLATFORM_SETTINGS_KEY } });
  return row?.value ?? {};
}

async function writeStored(values: PlatformSettingValues): Promise<void> {
  if (!realSettingsEnabled()) {
    g[GLOBAL_KEY] = { ...values };
    return;
  }
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
