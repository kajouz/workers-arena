import { NextResponse } from "next/server";

interface TrackEvent {
  type: "impression" | "click" | "conversion";
  experimentId: string;
  variantId: string;
  visitorId: string;
}

// In-memory store for demo (in production, use database)
const eventLog: Array<TrackEvent & { timestamp: number }> = [];

export async function POST(request: Request) {
  try {
    const body: TrackEvent = await request.json();

    // Validate required fields
    if (!body.type || !body.experimentId || !body.variantId || !body.visitorId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate event type
    if (!["impression", "click", "conversion"].includes(body.type)) {
      return NextResponse.json(
        { error: "Invalid event type" },
        { status: 400 }
      );
    }

    // Log the event
    const event = {
      ...body,
      timestamp: Date.now(),
    };

    eventLog.push(event);

    // Keep only last 10000 events in memory
    if (eventLog.length > 10000) {
      eventLog.splice(0, eventLog.length - 10000);
    }

    console.log(`[AB Track] ${body.type}: ${body.experimentId} / ${body.variantId}`);

    return NextResponse.json({ success: true, eventId: eventLog.length });
  } catch (error) {
    console.error("[AB Track] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const experimentId = url.searchParams.get("experimentId");

  if (experimentId) {
    // Get events for specific experiment
    const events = eventLog.filter((e) => e.experimentId === experimentId);
    return NextResponse.json({ events, total: events.length });
  }

  // Get all events summary
  const summary: Record<string, { impressions: number; clicks: number; conversions: number }> = {};
  
  for (const event of eventLog) {
    const key = `${event.experimentId}:${event.variantId}`;
    if (!summary[key]) {
      summary[key] = { impressions: 0, clicks: 0, conversions: 0 };
    }
    if (event.type === "impression") summary[key].impressions++;
    else if (event.type === "click") summary[key].clicks++;
    else if (event.type === "conversion") summary[key].conversions++;
  }

  return NextResponse.json({
    summary,
    totalEvents: eventLog.length,
    recentEvents: eventLog.slice(-100),
  });
}
