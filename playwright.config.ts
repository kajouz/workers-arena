import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/playwright",
  timeout: 60_000,
  retries: 0,
  use: {
    browserName: "chromium",
    launchOptions: {
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH ||
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: ["--no-sandbox"],
    },
    baseURL: "http://localhost:3001",
    headless: true,
  },
  webServer: {
    command: "npx next dev -p 3001",
    port: 3001,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
