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
    // Keep single project for now; docblock opt-in is intentional — splitting into
    // projects would require duplicating setupFiles/alias. Revisit if flakiness appears.
    environment: "node",
    // Vitest 5 flips clearMocks to true (vi.clearAllMocks before every test).
    // Every suite here was written against the v3 leaky default: hoisted vi.fn()
    // mocks are reset by explicit mockReset() where isolation matters, and some
    // suites record calls outside the test body (module scope, beforeAll) and
    // assert on them across tests. Keep v3 semantics — flip deliberately if the
    // whole surface is audited, not silently by a major bump.
    clearMocks: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    // Guarded polyfills (matchMedia/ResizeObserver) for the jsdom component
    // tests — a no-op in node env.
    setupFiles: ["tests/setup-jsdom.ts"],
  },
});
