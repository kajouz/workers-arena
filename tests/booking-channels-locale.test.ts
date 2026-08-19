/**
 * Channel-level audit — the SMS / WhatsApp / push booking channels inherit the
 * SAME payload bodies as the email (copy() picks bodyAr/bodyEn by locale), so
 * the single-locale leaks must be gone at the source:
 *
 *  1. jobTitle — the reminder / recurring-visit / quote bodies render
 *     serviceItem.nameAr in Arabic and nameEn in English (the free-text
 *     jobTitle only as a no-catalog fallback) — the SMS/WhatsApp/push text
 *     built from those bodies can never show the EN title inside Arabic copy.
 *
 *  2. the slot TIME — the bodies used `Date.toLocaleString()` (server locale),
 *     so an Arabic SMS showed an English-formatted time. The builder now
 *     formats per locale (ar-EG vs en-US) — locked here.
 */
import { describe, it, expect } from "vitest";
import { bookingNotification } from "@/lib/data/booking-notifications";
import { quoteNotification } from "@/lib/data/quote-notifications";
import {
  renderSmsText,
  renderWhatsAppText,
  renderPushPayload,
  renderBookingEmail,
} from "@/lib/notifications/templates";
import type { ChannelPayload } from "@/lib/notifications/types";
import type { Booking } from "@/lib/data/types";

const AR_SERVICE = { nameEn: "Fix leaking pipe", nameAr: "إصلاح تسريب ماسورة", price: 120, unit: "job" as const };

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "bk-1001",
    number: "BK-1001",
    workerId: "w1",
    customerName: "Sara Customer",
    customerPhone: "+966 50 000 0000",
    customerEmail: "sara@example.com",
    jobTitle: "Leaking kitchen sink repair",
    serviceItem: AR_SERVICE,
    status: "confirmed",
    startAt: "2026-08-18T09:00:00.000Z",
    endAt: "2026-08-18T10:00:00.000Z",
    currency: "SAR",
    events: [{ status: "confirmed", actorType: "worker", time: "2026-08-17T07:27:20.083Z" }],
    ...overrides,
  };
}

function asChannelPayload(msg: ReturnType<typeof bookingNotification | typeof quoteNotification>): ChannelPayload {
  return {
    id: `n-${msg.type}-1`,
    type: msg.type,
    titleEn: msg.titleEn,
    titleAr: msg.titleAr,
    bodyEn: msg.bodyEn,
    bodyAr: msg.bodyAr,
    href: msg.href,
    time: "2026-08-17T07:27:20.083Z",
  };
}

describe("SMS booking channel — locale correctness", () => {
  it("AR reminder SMS shows the Arabic service name and an Arabic-formatted time, never the EN title", () => {
    const msg = bookingNotification(makeBooking(), "customer-reminder");
    const text = renderSmsText(asChannelPayload(msg), "ar");

    expect(text).toContain("إصلاح تسريب ماسورة");
    expect(text).not.toContain("Leaking kitchen sink repair");
    // Arabic locale time — ar-EG renders Arabic-Indic numerals (١٨/٠٨/٢٠٢٦),
    // never the server-locale English "Aug 18".
    expect(text).toMatch(/[٠-٩]/);
    expect(text).not.toContain("Aug");
  });

  it("EN reminder SMS keeps the EN name and time", () => {
    const msg = bookingNotification(makeBooking(), "customer-reminder");
    const text = renderSmsText(asChannelPayload(msg), "en");

    expect(text).toContain("Fix leaking pipe");
    expect(text).toContain("Aug 18");
    expect(text).not.toContain("إصلاح تسريب ماسورة");
  });

  it("AR recurring-visit SMS localizes both the service name and the time", () => {
    const msg = bookingNotification(makeBooking(), "customer-recurring-visit");
    const text = renderSmsText(asChannelPayload(msg), "ar");

    expect(text).toContain("إصلاح تسريب ماسورة");
    expect(text).not.toContain("Leaking kitchen sink repair");
    expect(text).toMatch(/[٠-٩]/);
    expect(text).not.toContain("Aug");
  });

  it("the EN and AR bodies differ in the time, proving the server-locale leak is gone", () => {
    const msg = bookingNotification(makeBooking(), "worker-request-nudge");
    expect(msg.bodyEn).toContain("Aug 18");
    expect(msg.bodyAr).not.toContain("Aug 18");
    expect(msg.bodyAr).toMatch(/[٠-٩]/);
  });
});

describe("WhatsApp booking channel — locale correctness", () => {
  it("AR quote-invite WhatsApp message shows the Arabic service name", () => {
    const quoteBooking = makeBooking({ status: "quoted", quoteRequestId: "qr-1" });
    const msg = quoteNotification(quoteBooking, "quote-invite");
    const text = renderWhatsAppText(asChannelPayload(msg), "ar");

    expect(text).toContain("إصلاح تسريب ماسورة");
    expect(text).not.toContain("Leaking kitchen sink repair");
  });

  it("EN quote-winner WhatsApp message keeps the EN name", () => {
    const quoteBooking = makeBooking({ status: "quoted", quoteRequestId: "qr-1" });
    const msg = quoteNotification(quoteBooking, "quote-winner");
    const text = renderWhatsAppText(asChannelPayload(msg), "en");

    expect(text).toContain("Fix leaking pipe");
    expect(text).not.toContain("إصلاح تسريب ماسورة");
  });
});

describe("push booking channel — locale correctness", () => {
  it("AR reminder push shows the Arabic service name and Arabic time", () => {
    const msg = bookingNotification(makeBooking(), "customer-reminder");
    const push = renderPushPayload(asChannelPayload(msg), "ar");

    expect(push).toContain("إصلاح تسريب ماسورة");
    expect(push).not.toContain("Leaking kitchen sink repair");
    expect(push).toMatch(/[٠-٩]/);
    expect(push).not.toContain("Aug");
  });
});

describe("booking email text version — locale correctness", () => {
  it("AR reminder email text carries the Arabic service name and the Arabic-formatted time, never the EN month", () => {
    const msg = bookingNotification(makeBooking(), "customer-reminder");
    const ar = renderBookingEmail({ ...asChannelPayload(msg), booking: msg.booking }, "ar");

    expect(ar.text).toContain("إصلاح تسريب ماسورة");
    expect(ar.text).not.toContain("Leaking kitchen sink repair");
    expect(ar.text).toMatch(/[٠-٩]/);
    expect(ar.text).not.toContain("Aug");
  });

  it("EN reminder email text keeps the EN name and time — the two text versions differ in the time", () => {
    const msg = bookingNotification(makeBooking(), "customer-reminder");
    const en = renderBookingEmail({ ...asChannelPayload(msg), booking: msg.booking }, "en");
    const ar = renderBookingEmail({ ...asChannelPayload(msg), booking: msg.booking }, "ar");

    expect(en.text).toContain("Fix leaking pipe");
    expect(en.text).toContain("Aug 18");
    expect(en.text).not.toContain("إصلاح تسريب ماسورة");
    // The plain-text version is single-locale — the EN time must never appear
    // in the AR text (and vice versa), proving the per-locale timeFor fix.
    expect(en.text).not.toContain("٠");
    expect(ar.text).not.toContain("Aug");
  });
});
