import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * GET /api/worker/branding
 * Get the current worker's branding configuration.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isStreamEnabled("branding")) {
      return NextResponse.json(
        { error: "Branding package is not available" },
        { status: 403 }
      );
    }

    // In production, this would fetch from database
    // For now, return demo configuration
    const config = {
      customUrlEnabled: false,
      businessCardEnabled: false,
      socialKitEnabled: false,
      profileThemeEnabled: false,
      videoIntroEnabled: false,
      verifiedBusinessEnabled: false,
      customUrl: "",
      accentColor: "#f97316",
      cardDesign: "modern",
      frameStyle: "none",
      videoUrl: "",
      companyName: "",
    };

    return NextResponse.json({ config });
  } catch (error) {
    console.error("Error fetching branding config:", error);
    return NextResponse.json(
      { error: "Failed to fetch branding configuration" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/worker/branding
 * Update the worker's branding configuration.
 */
export async function PUT(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isStreamEnabled("branding")) {
      return NextResponse.json(
        { error: "Branding package is not available" },
        { status: 403 }
      );
    }

    const updates = await request.json();

    // In production, this would update the database
    // For now, return the updates as if saved
    return NextResponse.json({
      success: true,
      message: "Branding configuration updated",
      updates,
    });
  } catch (error) {
    console.error("Error updating branding config:", error);
    return NextResponse.json(
      { error: "Failed to update branding configuration" },
      { status: 500 }
    );
  }
}
