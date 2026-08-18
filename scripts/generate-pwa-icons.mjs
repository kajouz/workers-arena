// WorkersArena — PWA icon generator.
// Renders public/icon.svg to the PNG sizes a real PWA needs, using the SAME
// system-Chrome resolution as src/lib/data/booking-pdf.ts (never a download):
//   public/icons/icon-192.png           (any purpose — launcher + installability)
//   public/icons/icon-512.png           (any purpose — largest install icon)
//   public/icons/maskable-512.png       (maskable — safe-zone padded for adaptive icons)
//   public/icons/apple-touch-icon.png   (iOS home-screen icon, 180px)
// Regenerate with: npm run pwa:icons
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svgPath = resolve(root, "public/icon.svg");

function resolveChromeExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined,
    process.platform === "win32" ? "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" : undefined,
  ].filter((p) => Boolean(p));
  return candidates.find((p) => existsSync(p)) ?? null;
}

const sizes = [
  { file: "icon-192.png", size: 192, maskable: false },
  { file: "icon-512.png", size: 512, maskable: false },
  { file: "maskable-512.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180, maskable: false },
];

async function main() {
  const chrome = resolveChromeExecutable();
  if (!chrome) {
    console.error(
      "pwa:icons — no Chrome/Chromium executable found. Set PUPPETEER_EXECUTABLE_PATH.",
    );
    process.exit(1);
  }
  const { default: puppeteer } = await import("puppeteer-core");
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const svg = await readFileText(svgPath);
    const outDir = resolve(root, "public/icons");
    await mkdir(outDir, { recursive: true });
    for (const { file, size, maskable } of sizes) {
      const inner = svg.replace(/^<\?xml[^>]*\?>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "");
      // Maskable: full-bleed gradient background (adaptive masks clip corners)
      // with the artwork scaled to the 80% safe zone. Regular: the raw artwork.
      const html = maskable
        ? `<!doctype html><html><body style="margin:0">
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
              <defs><linearGradient id="mbg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#fb923c"/><stop offset="0.55" stop-color="#f97316"/><stop offset="1" stop-color="#9a3412"/>
              </linearGradient></defs>
              <rect width="64" height="64" fill="url(#mbg)"/>
              <g transform="translate(6.4 6.4) scale(0.8)">${inner}</g>
            </svg>
          </body></html>`
        : `<!doctype html><html><body style="margin:0">
            <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${inner}</svg>
          </body></html>`;
      const page = await browser.newPage();
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: "load" });
      const img = await page.$("svg");
      if (!img) throw new Error(`svg element not found for ${file}`);
      const png = await img.screenshot({ type: "png" });
      await writeFile(resolve(outDir, file), png);
      await page.close();
      console.log(`wrote public/icons/${file} (${size}px${maskable ? ", maskable" : ""})`);
    }
  } finally {
    await browser.close();
  }
}

import { readFile } from "node:fs/promises";
const readFileText = (p) => readFile(p, "utf8");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
