/**
 * §2.4 audit-email attachments — the ChannelPayload.attachments seam: the
 * console provider logs the attachment (dev observability), and the real
 * providers (nodemailer / Resend) pass the attachment array through to their
 * transports. The provider SDKs are mocked at the module level (the channel
 * imports them dynamically), so no network or install is needed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import nodemailer from "nodemailer";
import { createEmailChannel } from "@/lib/notifications/providers/email";
import type { ChannelPayload } from "@/lib/notifications/types";

const { sendMailMock, resendInstances } = vi.hoisted(() => ({
  sendMailMock: vi.fn().mockResolvedValue({}),
  resendInstances: [] as unknown[],
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: vi.fn().mockResolvedValue({}) };
    constructor() {
      resendInstances.push(this);
    }
  },
}));

const pdf = Buffer.from("%PDF-1.4\nfake audit payload");

const payload: ChannelPayload = {
  id: "email-audit-test",
  type: "system",
  titleEn: "Booking audit trail — BK-1001",
  titleAr: "سجل تدقيق الحجز — BK-1001",
  bodyEn: "The audit trail for booking BK-1001 is attached as a PDF.",
  bodyAr: "سجل تدقيق الحجز BK-1001 مرفق كملف PDF.",
  href: "/bookings",
  time: new Date().toISOString(),
  recipient: { name: "Sara Customer", email: "sara@example.com", locale: "en" },
  attachments: [
    { filename: "BK-1001-audit.pdf", content: pdf, contentType: "application/pdf" },
  ],
};

beforeEach(() => {
  vi.stubEnv("NOTIFY_SMTP_HOST", "smtp.test");
  vi.stubEnv("RESEND_API_KEY", "re_test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resendInstances.length = 0;
});

describe("email channel attachments", () => {
  it("console provider logs the attachment filename + size", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await createEmailChannel("console").send(payload);
    expect(result.ok).toBe(true);
    const line = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).toContain("BK-1001-audit.pdf");
    expect(line).toContain("application/pdf");
    expect(line).toContain(`${pdf.length} bytes`);
  });

  it("smtp provider passes the attachment through to nodemailer", async () => {
    const result = await createEmailChannel("smtp").send(payload);
    expect(result.ok).toBe(true);
    const transport = vi.mocked(nodemailer.createTransport).mock.results[0]?.value as {
      sendMail: typeof sendMailMock;
    };
    expect(transport).toBeDefined();
    const sent = transport.sendMail.mock.calls[0]![0] as {
      to?: string;
      attachments?: { filename: string; content: Buffer; contentType: string }[];
    };
    expect(sent.to).toBe("sara@example.com");
    expect(sent.attachments).toEqual([
      { filename: "BK-1001-audit.pdf", content: pdf, contentType: "application/pdf" },
    ]);
  });

  it("resend provider passes the attachment through to the Resend API", async () => {
    const result = await createEmailChannel("resend").send(payload);
    expect(result.ok).toBe(true);
    expect(resendInstances.length).toBe(1);
    const instance = resendInstances[0] as { emails: { send: ReturnType<typeof vi.fn> } };
    const sent = instance.emails.send.mock.calls[0]![0] as {
      to: string[];
      attachments?: { filename: string; content: Buffer; contentType: string }[];
    };
    expect(sent.to).toEqual(["sara@example.com"]);
    expect(sent.attachments).toEqual([
      { filename: "BK-1001-audit.pdf", content: pdf, contentType: "application/pdf" },
    ]);
  });

  it("sends fine with no attachments (backward compatible)", async () => {
    const { attachments: _drop, ...bare } = payload;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await createEmailChannel("console").send(bare);
    expect(result.ok).toBe(true);
    expect(log.mock.calls.map((c) => String(c[0])).join("\n")).not.toContain("attachments");
  });
});
