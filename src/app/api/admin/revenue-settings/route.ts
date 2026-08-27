import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import {
  getAllStreamConfigs,
  getStreamConfig,
  toggleStream,
  updateStreamConfig,
  getAuditLog,
  getRevenueAnalytics,
  type RevenueStreamId,
} from "@/lib/data/revenue-settings";

/**
 * GET /api/admin/revenue-settings
 * 
 * Get all revenue stream configurations or a specific stream.
 * Query params:
 *   - streamId: Get specific stream config
 *   - audit: Get audit log (boolean)
 *   - analytics: Get revenue analytics (boolean)
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const streamId = searchParams.get("streamId") as RevenueStreamId | null;
    const audit = searchParams.get("audit") === "true";
    const analytics = searchParams.get("analytics") === "true";

    if (audit) {
      const limit = parseInt(searchParams.get("limit") || "50");
      const auditLog = getAuditLog(limit);
      return NextResponse.json({ auditLog });
    }

    if (analytics) {
      const revenueAnalytics = getRevenueAnalytics();
      return NextResponse.json({ analytics: revenueAnalytics });
    }

    if (streamId) {
      const config = getStreamConfig(streamId);
      if (!config) {
        return NextResponse.json({ error: "Stream not found" }, { status: 404 });
      }
      return NextResponse.json({ stream: config });
    }

    const allConfigs = getAllStreamConfigs();
    return NextResponse.json({ streams: allConfigs });
  } catch (error) {
    console.error("Error fetching revenue settings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/revenue-settings
 * 
 * Update revenue stream configuration.
 * Body:
 *   - streamId: RevenueStreamId (required)
 *   - updates: Partial<RevenueStreamConfig> (required)
 */
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { streamId, updates } = body;

    if (!streamId || !updates) {
      return NextResponse.json({ error: "streamId and updates are required" }, { status: 400 });
    }

    const updated = updateStreamConfig(
      streamId as RevenueStreamId,
      updates,
      session.id || "admin",
      session.name || "Admin"
    );

    return NextResponse.json({ stream: updated });
  } catch (error) {
    console.error("Error updating revenue settings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/admin/revenue-settings
 * 
 * Toggle a revenue stream on/off.
 * Body:
 *   - streamId: RevenueStreamId (required)
 *   - enabled: boolean (required)
 */
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { streamId, enabled } = body;

    if (!streamId || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "streamId and enabled are required" }, { status: 400 });
    }

    const updated = toggleStream(
      streamId as RevenueStreamId,
      enabled,
      session.id || "admin",
      session.name || "Admin"
    );

    return NextResponse.json({ stream: updated });
  } catch (error) {
    console.error("Error toggling revenue stream:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
