import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLeadOfferMessage,
  buildWhatsAppLeadNotification,
  generateWhatsAppLink,
} from "../src/lib/data/whatsapp-leads";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../src/lib/data/lead-market";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin WhatsApp lead notifications", () => {
  const offer = {
    leadNumber: "QR-2026-00042",
    grade: "gold" as const,
    priceCredits: 20,
    matchScore: 87,
  };

  it("uses the configured app URL instead of a hardcoded deployment URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    const message = buildLeadOfferMessage({
      workerPhone: "+961 70 123 456",
      workerName: "Ahmad",
      offer,
      adminName: "Nour",
    });
    expect(message).toContain("https://app.example.test/dashboard/leads");
    expect(message).not.toContain("workers-arena.vercel.app");
  });

  it("renders an admin-edited grade and locale template with all placeholders", () => {
    const message = buildLeadOfferMessage(
      {
        workerPhone: "+961 70 123 456",
        workerName: "Ahmad",
        offer,
        adminName: "Nour",
        templates: {
          ...DEFAULT_WHATSAPP_TEMPLATES,
          en: {
            ...DEFAULT_WHATSAPP_TEMPLATES.en,
            gold: "{workerName}|{grade}|{leadNumber}|{matchScore}|{priceCredits}|{boardUrl}|{adminName}",
          },
        },
      },
      "en"
    );
    expect(message).toBe(
      "Ahmad|Gold|QR-2026-00042|87|20|http://localhost:3000/dashboard/leads|Nour"
    );
  });

  it("normalizes a formatted Lebanon phone for a wa.me link", () => {
    const result = buildWhatsAppLeadNotification({
      workerPhone: "+961 (70) 123-456",
      workerName: "Ahmad",
      offer,
      adminName: "Nour",
    });
    expect(result.phone).toBe("96170123456");
    expect(result.url).toContain("https://wa.me/96170123456?text=");
    expect(decodeURIComponent(result.url)).toContain("QR-2026-00042");
  });

  it("rejects an empty phone instead of generating an unusable wa.me URL", () => {
    expect(() => generateWhatsAppLink("   ", "hello")).toThrow("valid phone number");
  });
});
