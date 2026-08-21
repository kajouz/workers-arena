import { NextResponse } from "next/server";

/**
 * Sentry Tunnel Route
 * Proxies Sentry events to avoid ad-blockers and CORS issues.
 * Only forwards requests with a valid Sentry DSN path.
 */
export async function POST(request: Request) {
  try {
    const envelope = await request.text();
    const piece = envelope.split("\n")[0];
    const header = JSON.parse(piece);

    const dsn = new URL(header.dsn);

    // Only allow tunneling to Sentry's ingest endpoint
    if (!dsn.hostname.endsWith("sentry.io")) {
      return NextResponse.json({ error: "Invalid Sentry host" }, { status: 400 });
    }

    const projectId = dsn.pathname.replace("/", "");
    const sentryUrl = `https://${dsn.hostname}/api/${projectId}/envelope/`;

    const response = await fetch(sentryUrl, {
      method: "POST",
      body: envelope,
      headers: {
        "Content-Type": "application/x-sentry-envelope",
      },
    });

    return new NextResponse(response.body, {
      status: response.status,
    });
  } catch {
    return NextResponse.json({ error: "Tunnel failed" }, { status: 500 });
  }
}

export const runtime = "edge";
