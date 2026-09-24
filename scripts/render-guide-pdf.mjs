/**
 * ────────────────────────────────────────────────────────────────────────────
 * RENDER GUIDE PDF — HTML source → A4 PDF via local Chrome/Chromium
 * ────────────────────────────────────────────────────────────────────────────
 * Usage: node scripts/render-guide-pdf.mjs [input.html] [output.pdf]
 * Defaults to the business-model guide. Files whose name contains ".ar."
 * get an Arabic RTL running head/footer automatically.
 *
 * Requires `puppeteer-core` (already a dev dependency via smoke-preview) and
 * a Chrome/Chromium binary, resolved in this order: $PUPPETEER_EXECUTABLE_PATH,
 * system Chrome locations, then the Playwright chromium cache.
 */
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.resolve(root, process.argv[2] ?? "docs/WorkersArena-Business-Model-Guide.html");
const output = path.resolve(root, process.argv[3] ?? "docs/WorkersArena-Business-Model-Guide.pdf");

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
].filter((p) => Boolean(p));

const PLAYWRIGHT_CHROMIUM_GLOBS = [
  path.join(os.homedir(), "Library/Caches/ms-playwright"),
  path.join(os.homedir(), ".cache/ms-playwright"),
];

function findPlaywrightChromium() {
  for (const cache of PLAYWRIGHT_CHROMIUM_GLOBS) {
    if (!existsSync(cache)) continue;
    for (const entry of readdirSync(cache)) {
      if (!entry.startsWith("chromium")) continue;
      for (const rel of [
        "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
        "chrome-linux/chrome",
        "chrome-win/chrome.exe",
      ]) {
        const candidate = path.join(cache, entry, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p)) ?? findPlaywrightChromium();
if (!executablePath) {
  console.error("No Chrome/Chromium found — set PUPPETEER_EXECUTABLE_PATH or install one.");
  process.exit(1);
}

const isArabic = path.basename(input).includes(".ar.");
const headerTemplate = isArabic
  ? `<div dir="rtl" style="font-family:sans-serif;font-size:7px;color:#94a3b8;width:100%;text-align:right;padding:0 15mm;">WorkersArena — نموذج الأعمال ودليل الاستخدام ودفّق الإيرادات للعامل</div>`
  : `<div style="font-size:7px;color:#94a3b8;width:100%;text-align:right;padding:0 15mm;">WorkersArena — Business Model, Usage Guide &amp; Worker Revenue Stream</div>`;
const footerTemplate = isArabic
  ? `<div dir="rtl" style="font-family:sans-serif;font-size:7.5px;color:#64748b;width:100%;text-align:center;padding:0 15mm;">الإصدار 1.0 · 23 سبتمبر 2026 — صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></div>`
  : `<div style="font-size:7.5px;color:#64748b;width:100%;text-align:center;padding:0 15mm;">Version 1.0 · 23 September 2026 — page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`;

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.goto(`file://${input}`, { waitUntil: "networkidle0" });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate,
    footerTemplate,
    margin: { top: "15mm", bottom: "15mm", left: "14mm", right: "14mm" },
  });
  console.log(`OK ${output}`);
} finally {
  await browser.close();
}
