import { existsSync } from "node:fs";
import type { Browser } from "puppeteer-core";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * BOOKING AUDIT → PDF (docs/ENHANCEMENT-PLAN.md §2.4)
 * ────────────────────────────────────────────────────────────────────────────
 * Server-side twin of the browser's print dialog: renders the EXACT standalone
 * audit document that renderBookingAuditPrint() emits (the same bytes the
 * BookingPrintButton iframe shows) into a PDF buffer, so emailBookingAuditAction
 * can attach it to email as a real PDF.
 *
 * Uses puppeteer-core against the SYSTEM Chrome/Chromium — the same executable
 * the E2E smoke drives (tests/e2e-smoke.test.ts), never a bundled download.
 * Override the path with PUPPETEER_EXECUTABLE_PATH. When no Chrome is found,
 * resolveChromeExecutable() returns null and the server action reports a
 * clear, non-throwing error instead of crashing.
 *
 * A single lazily-launched browser is reused across requests (launching Chrome
 * per email is wasteful); each render gets its own page, closed afterwards.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** First existing Chrome/Chromium executable, or null. Read at CALL time so
 * tests can control it via PUPPETEER_EXECUTABLE_PATH + existsSync stubs. */
export function resolveChromeExecutable(): string | null {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p)) ?? null;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  // Reuse the singleton browser across renders; failed launches reset the
  // promise so a transient crash doesn't wedge every later email.
  browserPromise ??= (async () => {
    const { default: puppeteer } = await import("puppeteer-core");
    return puppeteer.launch({
      executablePath: resolveChromeExecutable()!,
      headless: true,
      args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
    });
  })().catch((err) => {
    browserPromise = null;
    throw err;
  });
  return browserPromise;
}

/** Close the shared browser (used by tests/process teardown). Idempotent. */
export async function closePdfBrowser(): Promise<void> {
  const p = browserPromise;
  browserPromise = null;
  if (p) {
    const b = await p.catch(() => null);
    await b?.close().catch(() => undefined);
  }
}

/** Thrown when no Chrome/Chromium is available to render the PDF. */
export class PdfRenderError extends Error {
  constructor(message = "no Chrome/Chromium executable found (set PUPPETEER_EXECUTABLE_PATH)") {
    super(message);
    this.name = "PdfRenderError";
  }
}

/**
 * Render a standalone HTML document to a PDF buffer. `html` is the audit
 * document from renderBookingAuditPrint() — the print CSS it carries is what
 * `page.pdf({ printBackground: true })` applies, so the PDF matches the
 * browser's print output byte-for-byte in layout.
 */
export async function renderAuditPdf(
  html: string,
  opts: { format?: "A4" | "Letter" } = {}
): Promise<Buffer> {
  if (!resolveChromeExecutable()) throw new PdfRenderError();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: opts.format ?? "A4", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}
