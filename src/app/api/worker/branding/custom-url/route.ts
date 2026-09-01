import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { isStreamEnabled } from "@/lib/data/revenue-settings";

/**
 * POST /api/worker/branding/custom-url
 * Claim a custom profile URL.
 */
export async function POST(request: Request) {
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

    const { url } = await request.json();

    // Validate URL format
    if (!url || !/^[a-z0-9-]+$/.test(url)) {
      return NextResponse.json(
        { error: "Invalid URL format. Use lowercase letters, numbers, and hyphens only." },
        { status: 400 }
      );
    }

    // Check length
    if (url.length < 3 || url.length > 50) {
      return NextResponse.json(
        { error: "URL must be between 3 and 50 characters." },
        { status: 400 }
      );
    }

    // Check for reserved words
    const reservedWords = ["admin", "api", "www", "mail", "help", "support", "about", "contact"];
    if (reservedWords.includes(url)) {
      return NextResponse.json(
        { error: "This URL is reserved." },
        { status: 400 }
      );
    }

    // In production, this would:
    // 1. Check if URL is already taken
    // 2. Charge the worker's credits
    // 3. Save to database

    return NextResponse.json({
      success: true,
      message: "Custom URL claimed successfully",
      url: `workersarena.com/${url}`,
    });
  } catch (error) {
    console.error("Error claiming custom URL:", error);
    return NextResponse.json(
      { error: "Failed to claim custom URL" },
      { status: 500 }
    );
  }
}
