/**
 * Audit — the quote auction + chat quote-sharing emails for the same
 * secondary-block locale correctness as the campaign/booking refund audits:
 *
 *  1. `quoteNotification` (quote-invite / quote-winner / quote-loser /
 *     quote-expired) embeds the job title in the bodies. Quote bid bookings
 *     carry the bilingual `serviceItem` the customer posted against, so the AR
 *     body must render `serviceItem.nameAr` — never the EN free-text jobTitle
 *     leaking into an Arabic sentence. Falls back to the raw jobTitle when no
 *     catalog item exists (user-typed text can't be translated).
 *
 *  2. The generic email shell (renderEmail) flips dir + direction +
 *     text-align for the other-language block — locked structurally like the
 *     refund email test.
 *
 *  3. The chat quote-accept email (`worker-quote-accepted`) rides the booking
 *     receipt card (already localized Service row) with a locale-neutral
 *     booking-number subject suffix — no jobTitle anywhere in the bodies.
 */
import { describe, it, expect } from "vitest";
import { quoteNotification } from "@/lib/data/quote-notifications";
import { bookingNotification } from "@/lib/data/booking-notifications";
import { renderEmail, renderBookingEmail } from "@/lib/notifications/templates";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { Booking } from "@/lib/data/types";

const AR_SERVICE = { nameEn: "Fix leaking pipe", nameAr: "إصلاح تسريب ماسورة", price: 120, unit: "job" as const };

/** A slot-less QUOTED bid booking — the state quote emails are dispatched for. */
function makeQuoteBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "bk-201",
    number: "BK-201",
    workerId: "w1",
    customerId: "u-customer",
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    serviceItem: AR_SERVICE,
    status: "quoted",
    quote: 25000,
    currency: "SAR",
    quoteRequestId: "qr-1",
    events: [{ status: "quoted", actorType: "worker", time: "2026-08-17T07:27:20.083Z" }],
    ...overrides,
  };
}

/** Materialize a quote payload into the ChannelPayload the email channel renders. */
function asChannelPayload(msg: ReturnType<typeof quoteNotification>): ChannelPayload {
  return {
    id: `q-${msg.type}-1`,
    type: msg.type,
    titleEn: msg.titleEn,
    titleAr: msg.titleAr,
    bodyEn: msg.bodyEn,
    bodyAr: msg.bodyAr,
    href: msg.href,
    time: "2026-08-17T07:27:20.083Z",
    recipient: { name: "Khaled Al-Harbi", email: "khaled@plumbfix.sa" },
  };
}

describe("quote emails — secondary-block locale correctness", () => {
  it.each(["quote-invite", "quote-winner", "quote-loser", "quote-expired"] as const)(
    "%s — the AR body renders the Arabic catalog name, never the EN jobTitle",
    (kind) => {
      const msg = quoteNotification(makeQuoteBooking(), kind);

      // AR primary copy uses serviceItem.nameAr; the EN free-text title never
      // leaks into the Arabic sentence.
      expect(msg.bodyAr).toContain("إصلاح تسريب ماسورة");
      expect(msg.bodyAr).not.toContain("Leaking kitchen sink repair");

      // EN primary copy uses the EN catalog name.
      expect(msg.bodyEn).toContain("Fix leaking pipe");
      expect(msg.bodyEn).not.toContain("إصلاح تسريب ماسورة");
    }
  );

  it("without a catalog service, the quote bodies fall back to the free-text jobTitle in both locales", () => {
    const booking = makeQuoteBooking({ serviceItem: undefined });
    for (const kind of ["quote-invite", "quote-winner", "quote-loser", "quote-expired"] as const) {
      const msg = quoteNotification(booking, kind);
      expect(msg.bodyAr).toContain("Leaking kitchen sink repair");
      expect(msg.bodyEn).toContain("Leaking kitchen sink repair");
    }
  });

  it("the EN quote email's secondary block is dir=rtl with the AR copy and the Arabic service name (bilingual shell)", () => {
    const msg = quoteNotification(makeQuoteBooking(), "quote-winner");
    const email = renderEmail(asChannelPayload(msg), "en");

    // The AR secondary block carries the localized body — Arabic name inside
    // the RTL cell, never the EN name in the flipped-language block.
    const m = email.html.match(/<td dir="rtl">([\s\S]*?)<\/td>/);
    expect(m).not.toBeNull();
    const block = m![1];
    expect(block).toContain("تم اختيار عرضك");
    expect(block).toContain("اختار العميل عرضك لـ «إصلاح تسريب ماسورة»");
    expect(block).not.toContain("Fix leaking pipe");
    expect(block).toContain("direction:rtl");
    expect(block).toContain("text-align:right");
  });

  it("the AR quote email's primary body is the Arabic copy — the EN name only lives in the secondary block", () => {
    const msg = quoteNotification(makeQuoteBooking(), "quote-invite");
    const email = renderEmail(asChannelPayload(msg), "ar");

    // Split at the flipped-language block (dir=ltr in the AR render): the
    // primary copy must be Arabic, the EN name may only appear in the
    // deliberate bilingual secondary block.
    const [primary] = email.html.split('<td dir="ltr">');
    expect(primary).toContain("دعاك Sara Customer لتقديم عرض سعر على «إصلاح تسريب ماسورة»");
    expect(primary).not.toContain("Fix leaking pipe");
  });
});

describe("chat quote-accept email (worker-quote-accepted) — receipt card localizes", () => {
  it("the AR render's Service row shows the Arabic name and the subject stays locale-neutral (booking number)", () => {
    const booking = makeQuoteBooking({ status: "confirmed", startAt: "2026-08-18T09:00:00.000Z", endAt: "2026-08-18T10:00:00.000Z" });
    const msg = bookingNotification(booking, "worker-quote-accepted");
    const payload: ChannelPayload = {
      id: "preview-w-bk-201",
      type: msg.type,
      titleEn: msg.titleEn,
      titleAr: msg.titleAr,
      bodyEn: msg.bodyEn,
      bodyAr: msg.bodyAr,
      href: msg.href,
      time: "2026-08-17T07:27:20.083Z",
      booking: msg.booking,
    };
    const ar = renderBookingEmail(payload, "ar");

    // Subject suffix is the locale-neutral booking number (no name leak).
    expect(ar.subject).toBe("[WorkersArena] تم قبول العرض — BK-201");
    // Body: customer name (proper noun) + booking number only.
    expect(ar.html).toContain("قبل Sara Customer عرضك في المحادثة للحجز BK-201");
    // Card Service row: Arabic catalog name, no EN jobTitle.
    expect(ar.html).toContain("إصلاح تسريب ماسورة");
    expect(ar.html).not.toContain("Leaking kitchen sink repair");
  });
});
