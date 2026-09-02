import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-demo";
import { getAllBookings, getWorkerById } from "@/lib/data/repo";

/**
 * GET /api/admin/emergency
 *
 * Returns all emergency bookings with real-time status and response time metrics.
 * Admin-only endpoint.
 */
export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allBookings = await getAllBookings();

  // Filter to emergency bookings only
  const emergencyBookings = allBookings.filter((b) => b.isEmergency);

  // Calculate metrics
  const activeRequests = emergencyBookings.filter(
    (b) => b.status === "requested" || b.status === "quoting"
  );
  const inProgressRequests = emergencyBookings.filter(
    (b) => b.status === "confirmed" || b.status === "pendingPayment" || b.status === "inProgress"
  );
  const completedRequests = emergencyBookings.filter((b) => b.status === "completed");
  const cancelledRequests = emergencyBookings.filter(
    (b) => b.status === "cancelled" || b.status === "declined" || b.status === "noShow"
  );

  // Calculate response times (time from request to first worker action)
  const responseTimes: number[] = [];
  for (const booking of emergencyBookings) {
    const requestEvent = booking.events.find((e) => e.status === "requested");
    const responseEvent = booking.events.find(
      (e) => e.status === "confirmed" || e.status === "declined" || e.status === "quoting"
    );
    if (requestEvent && responseEvent) {
      const requestTime = new Date(requestEvent.time).getTime();
      const responseTime = new Date(responseEvent.time).getTime();
      if (responseTime > requestTime) {
        responseTimes.push(responseTime - requestTime);
      }
    }
  }

  const avgResponseTimeMs =
    responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

  const fastestResponseMs = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const slowestResponseMs = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

  // Calculate contact release rate
  const contactReleased = emergencyBookings.filter(
    (b) => b.contactDetailsReleasedAt || b.status === "inProgress" || b.status === "completed"
  );

  // Enrich bookings with worker info
  const enrichedBookings = await Promise.all(
    emergencyBookings.map(async (booking) => {
      const worker = await getWorkerById(booking.workerId);
      const requestEvent = booking.events.find((e) => e.status === "requested");
      const firstResponse = booking.events.find(
        (e) => e.status !== "requested" && e.status !== "message"
      );

      let responseTimeMs: number | null = null;
      if (requestEvent && firstResponse) {
        const req = new Date(requestEvent.time).getTime();
        const resp = new Date(firstResponse.time).getTime();
        if (resp > req) responseTimeMs = resp - req;
      }

      return {
        id: booking.id,
        number: booking.number,
        customerName: booking.customerName,
        jobTitle: booking.jobTitle,
        status: booking.status,
        createdAt: requestEvent?.time ?? "",
        startAt: booking.startAt,
        workerName: worker
          ? booking.customerLocale === "ar"
            ? worker.nameAr
            : worker.nameEn
          : "Unknown",
        workerId: booking.workerId,
        responseTimeMs,
        contactReleased: Boolean(booking.contactDetailsReleasedAt || booking.status === "inProgress" || booking.status === "completed"),
        hasMaskedNumber: true, // Emergency always creates masked numbers
      };
    })
  );

  // Sort by creation time (newest first)
  enrichedBookings.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return NextResponse.json({
    summary: {
      total: emergencyBookings.length,
      active: activeRequests.length,
      inProgress: inProgressRequests.length,
      completed: completedRequests.length,
      cancelled: cancelledRequests.length,
      avgResponseTimeMs: Math.round(avgResponseTimeMs),
      fastestResponseMs: Math.round(fastestResponseMs),
      slowestResponseMs: Math.round(slowestResponseMs),
      contactReleaseRate:
        emergencyBookings.length > 0
          ? Math.round((contactReleased.length / emergencyBookings.length) * 100)
          : 0,
    },
    bookings: enrichedBookings,
  });
}
