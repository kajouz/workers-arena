/**
 * §2.4 audit-trail PDF (docs/ENHANCEMENT-PLAN.md §2.4) — booking-pdf.ts: the
 * server-side twin of the print dialog. resolveChromeExecutable is pure
 * (unit-tested with the node:fs existsSync mocked); renderAuditPdf renders the
 * exact renderBookingAuditPrint document through system Chrome — those cases
 * run only when a Chrome/Chromium executable is actually present (the same
 * skip convention as tests/e2e-smoke.test.ts).
 */
import { describe, it, expect, vi, afterEach, afterAll } from "vitest";
import { existsSync, type PathLike } from "node:fs";
import {
  PdfRenderError,
  closePdfBrowser,
  renderAuditPdf,
  resolveChromeExecutable,
} from "@/lib/data/booking-pdf";
import { renderBookingAuditPrint } from "@/lib/data/booking-print";
import type { Booking } from "@/lib/data/types";

// Spy on existsSync for BOTH this file and booking-pdf.ts (vi.mock hoists, so
// the mocked module is what booking-pdf.ts imports too).
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

const existsMock = vi.mocked(existsSync);

afterEach(() => {
  // mockRestore (not mockClear): re-installs the REAL existsSync so a
  // mockImplementation from one test can't leak into the live-Chrome tests.
  existsMock.mockRestore();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closePdfBrowser();
});

describe("resolveChromeExecutable", () => {
  it("honors PUPPETEER_EXECUTABLE_PATH when that file exists", () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/opt/custom/chrome");
    existsMock.mockImplementation((p: PathLike) => p === "/opt/custom/chrome");
    expect(resolveChromeExecutable()).toBe("/opt/custom/chrome");
  });

  it("returns null when no candidate exists", () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/nonexistent/chrome");
    existsMock.mockImplementation(() => false);
    expect(resolveChromeExecutable()).toBeNull();
  });

  it("falls back to the platform candidates when the env override is unset", () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "");
    existsMock.mockImplementation(() => true);
    // Any candidate path is acceptable — the function must pick one without
    // throwing (it read the env at call time).
    expect(resolveChromeExecutable()).toBeTypeOf("string");
  });
});

describe("renderAuditPdf", () => {
  it("throws PdfRenderError when no Chrome is available", async () => {
    vi.stubEnv("PUPPETEER_EXECUTABLE_PATH", "/nonexistent/chrome");
    existsMock.mockImplementation(() => false);
    await expect(renderAuditPdf("<html><body>audit</body></html>")).rejects.toBeInstanceOf(
      PdfRenderError
    );
  });
});

const booking: Booking = {
  id: "bk-1",
  number: "BK-1001",
  workerId: "w1",
  customerName: "Sara Customer",
  customerPhone: "+966 50 000 0000",
  customerEmail: "sara@example.com",
  jobTitle: "Leaking kitchen sink repair",
  status: "confirmed",
  startAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  endAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  quote: 15000,
  currency: "SAR",
  events: [
    { status: "requested", actorType: "customer", time: new Date(Date.now() - 5 * 3_600_000).toISOString() },
    { status: "confirmed", actorType: "worker", reason: "Can do — quote SAR 150", time: new Date(Date.now() - 4 * 3_600_000).toISOString() },
  ],
};

describe.runIf(resolveChromeExecutable())("renderAuditPdf (live Chrome)", () => {
  it(
    "renders the audit document into a real A4 PDF",
    async () => {
      const pdf = await renderAuditPdf(
        renderBookingAuditPrint(booking, { locale: "en", workerName: "Khaled Al-Harbi" })
      );
      // A real PDF: magic header + a substantial payload (not an empty page).
      // (Content streams are compressed, so the title text isn't greppable in
      // the raw bytes — the header + size are the reliable signals.)
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
    },
    60_000
  );

  it(
    "renders the Arabic RTL document too",
    async () => {
      const pdf = await renderAuditPdf(
        renderBookingAuditPrint(booking, { locale: "ar", workerName: "خالد الحربي" })
      );
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
    },
    60_000
  );
});
