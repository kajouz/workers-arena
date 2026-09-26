import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/data/platform-settings";

export const dynamic = "force-dynamic";

/** GET /api/admin/platform-settings — every setting's saved value (or default). */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ settings: await getPlatformSettings() });
}

/**
 * PUT /api/admin/platform-settings — body `{ settings: { <id>: value, … } }`
 * with only the changed keys. 400 with `errors` if any key is unknown or has
 * the wrong type; nothing is saved in that case.
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { settings?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }
  const result = await updatePlatformSettings(body.settings, { id: session.id, name: session.name });
  if (!result.ok) return NextResponse.json({ error: "invalid-settings", errors: result.errors }, { status: 400 });
  return NextResponse.json({ settings: result.settings, changed: result.changed });
}
