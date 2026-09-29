import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  platformWhatsAppNumber,
  publicWorker,
  publicWorkers,
  whatsappRequestHref,
  whatsappRequestMessage,
} from "../src/lib/data/contact-guard";

const worker = {
  id: "w1",
  phone: "+96170123456",
  whatsapp: "96170123456",
  email: "karim@example.com",
  website: "karim.example.com",
  socials: [
    { platform: "instagram", url: "https://instagram.com/karim" },
    { platform: "whatsapp", url: "https://wa.me/96170123456" },
    { platform: "telegram", url: "https://t.me/karim" },
  ],
};

describe("publicWorker", () => {
  it("blanks every direct-contact field and keeps the rest", () => {
    const pub = publicWorker(worker);
    expect(pub).toMatchObject({ id: "w1", phone: "", whatsapp: "", email: "" });
    expect(pub.website).toBeUndefined();
    expect(pub.socials).toEqual([{ platform: "instagram", url: "https://instagram.com/karim" }]);
    // The serialised object carries no trace of the number or the address.
    const json = JSON.stringify(pub);
    expect(json).not.toContain("70123456");
    expect(json).not.toContain("@example.com");
  });

  it("does not mutate the input, and maps lists", () => {
    publicWorkers([worker]);
    expect(worker.phone).toBe("+96170123456");
    expect(publicWorkers([worker, worker]).every((w) => w.phone === "")).toBe(true);
  });
});

describe("WhatsApp-first requests go to WorkersArena", () => {
  it("normalises the configured number and rejects junk", () => {
    expect(platformWhatsAppNumber("+961 70 123 456")).toBe("96170123456");
    expect(platformWhatsAppNumber("")).toBeNull();
    expect(platformWhatsAppNumber(undefined)).toBeNull();
    expect(platformWhatsAppNumber("12345")).toBeNull();
  });

  it("builds no link without a platform number (the button hides)", () => {
    expect(whatsappRequestHref({ locale: "en", workerName: "Karim" }, null)).toBeNull();
  });

  it("pre-fills who or what the customer wants, in their language", () => {
    const en = whatsappRequestMessage({ locale: "en", workerName: "Karim", profileUrl: "https://x/en/workers/karim" });
    expect(en).toContain("I'd like to book Karim");
    expect(en).toContain("https://x/en/workers/karim");
    expect(whatsappRequestMessage({ locale: "en", trade: "plumber", place: "Achrafieh" })).toContain(
      "I need a plumber in Achrafieh"
    );
    expect(whatsappRequestMessage({ locale: "ar", workerName: "كريم" })).toContain("أرغب في حجز كريم");

    const href = whatsappRequestHref({ locale: "en", workerName: "Karim" }, "96171000000")!;
    expect(href.startsWith("https://wa.me/96171000000?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toContain("Karim");
  });
});

/**
 * The guard only works if every public read goes through it — the whole worker
 * object is serialised into the page, so one unguarded read puts the numbers
 * back in the HTML. Any public page or public API that reads workers must
 * reference `publicWorker`/`publicWorkers`, or only use slugs (the allow-list
 * below, each checked by hand).
 */
describe("public surfaces read workers through the guard", () => {
  const ROOT = join(__dirname, "..");
  const WORKER_READ = /\b(getWorkers|getAllWorkers|getFeaturedWorkersList|getRelated|getWorkerBySlug|getWorkerById)\s*\(/;
  // Reads that only take slugs/counts from the workers, never render them.
  const SLUG_ONLY = new Set([
    "src/app/[locale]/(public)/cities/[city]/page.tsx",
    "src/app/[locale]/(public)/trades/[trade]/page.tsx",
    "src/app/api/workers/[slug]/slots/route.ts",
  ]);

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  }

  it("guards every public worker read", () => {
    const files = [
      ...walk(join(ROOT, "src/app/[locale]/(public)")),
      ...walk(join(ROOT, "src/app/api/workers")),
      join(ROOT, "src/app/[locale]/(app)/favorites/page.tsx"),
    ];
    const offenders = files
      .map((f) => relative(ROOT, f))
      .filter((rel) => !SLUG_ONLY.has(rel))
      .filter((rel) => {
        const src = readFileSync(join(ROOT, rel), "utf8");
        return WORKER_READ.test(src) && !/\bpublicWorkers?\b/.test(src);
      });
    expect(offenders, "These read workers without publicWorker — contact details would leak").toEqual([]);
  });
});
