// @vitest-environment jsdom
/**
 * The booking-refund notification payload — single source of truth (built by
 * bookingNotification(booking, "customer-refund", { refund })) — carries the
 * refunded AMOUNT + the admin-stated REASON into the surfaces the deposit
 * refund touches, mirroring campaign-refund-surfaces.test.tsx:
 *   1. the BELL             — the header dropdown renders the inbox item,
 *   2. the EMAIL PREVIEW    — the admin dispute view computes renderBookingEmail
 *                             from the same builder,
 *   3. the DISPATCHED EMAIL — the email channel's send() routes the same
 *                             payload through renderForChannel (the copy the
 *                             customer actually receives).
 * One payload, asserted on all three. The booking-refund BODY stays
 * copy-light by design (booking number, no amount); the amount + reason ride
 * BookingEmailContext.refund — the single context both email surfaces render —
 * which the bell test asserts on the payload alongside the rendered item.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NotificationBell } from "@/components/layout/notification-bell";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { bookingNotification } from "@/lib/data/booking-notifications";
import { renderBookingEmail } from "@/lib/notifications/templates";
import { createEmailChannel } from "@/lib/notifications/providers/email";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { Booking, Notification } from "@/lib/data/types";

// The bell calls the server actions on click; stub them (real server-action
// modules pull server-only deps into the jsdom bundle).
const { markReadActionMock, markAllReadActionMock } = vi.hoisted(() => ({
  markReadActionMock: vi.fn(),
  markAllReadActionMock: vi.fn(),
}));
vi.mock("@/app/actions/business", () => ({
  markReadAction: markReadActionMock,
  markAllReadAction: markAllReadActionMock,
}));

const HOUR = 3_600_000;

/** A CONFIRMED booking with a PAID deposit — the state a deposit refund leaves. */
function makeBooking(overrides: Partial<Booking> = {}): Booking {
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR).toISOString();
  return {
    id: "bk-1001",
    number: "BK-1001",
    workerId: "w1",
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    status: "confirmed",
    startAt: at(24),
    endAt: at(23),
    quote: 25000,
    deposit: 10000,
    currency: "SAR",
    events: [
      { status: "requested", actorType: "customer", time: at(26) },
      { status: "confirmed", actorType: "worker", reason: "Can do — quote SAR 250", time: at(25) },
      { status: "refunded", actorType: "admin", reason: "Customer requested cancellation", time: at(1) },
    ],
    ...overrides,
  };
}

/** The booking-refund payload built through the shared builder (single source
 * of truth) — the same shape both adapters dispatch and the dispute view
 * previews. */
function buildRefundPayload(booking: Booking = makeBooking()) {
  return bookingNotification(booking, "customer-refund", {
    refund: { amount: 10000, reason: "Customer requested cancellation" },
  });
}

/** The builder payload as a fully materialized ChannelPayload (what the
 * adapters dispatch — the API route / email provider both use this shape). */
function asChannelPayload(
  msg: ReturnType<typeof buildRefundPayload>,
  id = "n-refund-bk-1"
): ChannelPayload {
  return {
    id,
    type: msg.type,
    titleEn: msg.titleEn,
    titleAr: msg.titleAr,
    bodyEn: msg.bodyEn,
    bodyAr: msg.bodyAr,
    href: msg.href,
    time: "2026-08-17T07:27:20.083Z",
    booking: msg.booking,
  };
}

beforeEach(() => {
  markReadActionMock.mockReset();
  markAllReadActionMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("booking-refund notification — amount + reason reach all three surfaces", () => {
  it("bell — the header dropdown renders the refunded item (number in the body, refund context on the payload)", async () => {
    const msg = buildRefundPayload();
    // The refund amount + reason ride BookingEmailContext.refund — the single
    // context the email card renders — so assert it right where the payload
    // carries it (the bell body itself stays copy-light by design).
    expect(msg.booking.refund).toEqual({
      amount: 10000,
      reason: "Customer requested cancellation",
    });

    const { booking: _ctx, ...rest } = msg;
    const item: Notification = {
      ...rest,
      id: "n-refund-bk-1",
      time: "2026-08-17T07:27:20.083Z",
      read: false,
    };

    // The bell fetches /api/notifications on mount and when the dropdown opens.
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ items: [item], unread: 1 }),
    });

    render(
      <LocaleProvider locale="ar" dir="rtl">
        <NotificationBell />
      </LocaleProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "الإشعارات" }));

    // Title + copy-light body (booking number, no amount — the amount lives in
    // the email card, asserted below).
    await waitFor(() =>
      expect(
        screen.getByText("تم استرداد دفعتك المقدمة للحجز BK-1001 إلى طريقة الدفع الأصلية.")
      ).toBeInTheDocument()
    );
    expect(screen.getByText("تم استرداد الدفعة المقدمة")).toBeInTheDocument();
  });

  it("email preview — the dispute-view refund card renders the amount and reason", () => {
    const msg = buildRefundPayload();
    const email = renderBookingEmail(asChannelPayload(msg), "en");

    expect(email.subject).toContain("Deposit refunded");
    expect(email.subject).toContain("BK-1001");
    expect(email.html).toContain("Booking details");
    expect(email.html).toContain("BK-1001");
    expect(email.html).toContain("SAR 100"); // 10000 minor → SAR 100 (formatPrice)
    expect(email.html).toContain("Customer requested cancellation"); // reason row
    expect(email.html).toContain("/admin/bookings/BK-1001"); // dispute deep link
    expect(email.text).toContain("Refunded: SAR 100");
    expect(email.text).toContain("Reason: Customer requested cancellation");
  });

  it("dispatched email — the email channel sends the same amount and reason", async () => {
    const msg = buildRefundPayload();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // The console channel is the default dev provider — the exact path the
    // dispatcher uses when a deposit refund is confirmed.
    const channel = createEmailChannel("console");
    const res = await channel.send(asChannelPayload(msg));

    expect(res.ok).toBe(true);
    expect(res.provider).toBe("console");
    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Deposit refunded");
    expect(output).toContain("BK-1001");
    expect(output).toContain("SAR 100");
    expect(output).toContain("Customer requested cancellation");
    expect(output).toContain("/admin/bookings/BK-1001");
  });
});

describe("audit — booking refund + completion emails: secondary-block locale correctness (campaign campaignName/nameAr fix, mirrored)", () => {
  const AR_SERVICE = { nameEn: "Kitchen sink repair", nameAr: "إصلاح حوض المطبخ", price: 25000, unit: "job" as const };

  it("the AR refund email's Service row renders the catalog's Arabic name, never the EN jobTitle", () => {
    const booking = makeBooking({ serviceItem: AR_SERVICE });
    const msg = buildRefundPayload(booking);
    const ar = renderBookingEmail(asChannelPayload(msg), "ar");
    const en = renderBookingEmail(asChannelPayload(msg), "en");

    // AR card row — localized catalog name, no EN leak (the AR secondary block
    // inside the EN email carries no service name, so the absence check is exact).
    expect(ar.html).toContain("الخدمة");
    expect(ar.html).toContain("إصلاح حوض المطبخ");
    expect(ar.html).not.toContain("Kitchen sink repair");

    // EN card row — the EN catalog name, no AR leak.
    expect(en.html).toContain("Service");
    expect(en.html).toContain("Kitchen sink repair");
    expect(en.html).not.toContain("إصلاح حوض المطبخ");
  });

  it("the AR customer-completed email's Service row renders the catalog's Arabic name too", () => {
    const booking = makeBooking({ status: "completed", serviceItem: AR_SERVICE });
    const msg = bookingNotification(booking, "customer-completed");
    const ar = renderBookingEmail(asChannelPayload(msg), "ar");

    expect(ar.subject).toContain("اكتملت المهمة");
    expect(ar.html).toContain("إصلاح حوض المطبخ");
    expect(ar.html).not.toContain("Kitchen sink repair");
  });

  it("without a catalog service, the Service row falls back to the free-text jobTitle in both locales", () => {
    const msg = buildRefundPayload(); // makeBooking() carries no serviceItem
    const ar = renderBookingEmail(asChannelPayload(msg), "ar");
    const en = renderBookingEmail(asChannelPayload(msg), "en");
    expect(ar.html).toContain("Leaking kitchen sink repair");
    expect(en.html).toContain("Leaking kitchen sink repair");
  });

  it("the EN refund email's secondary block is dir=rtl with the AR copy (bilingual shell)", () => {
    const msg = buildRefundPayload();
    const email = renderBookingEmail(asChannelPayload(msg), "en");

    // Extract the flipped-language cell — the emailShell secondary block.
    const m = email.html.match(/<td dir="rtl">([\s\S]*?)<\/td>/);
    expect(m).not.toBeNull();
    const block = m![1];
    expect(block).toContain("تم استرداد الدفعة المقدمة");
    expect(block).toContain("تم استرداد دفعتك المقدمة للحجز BK-1001");
    expect(block).toContain("direction:rtl");
    expect(block).toContain("text-align:right");
  });
});
