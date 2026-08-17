import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // The email provider lazily imports the optional SDKs (webpackIgnore in
      // the Next build); they aren't installed in dev, so point Vite at test
      // stubs — lets any test import providers/email.ts (tests/stubs).
      nodemailer: path.resolve(__dirname, "tests/stubs/nodemailer.ts"),
      resend: path.resolve(__dirname, "tests/stubs/resend.ts"),
    },
  },
  test: {
    // Default node env — component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock (see tests/respond-dialog.test.tsx).
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Guarded polyfills (matchMedia/ResizeObserver) for the jsdom component
    // tests — a no-op in node env.
    setupFiles: ["tests/setup-jsdom.ts"],
  },
});
